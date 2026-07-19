/**
 * Phase 3.5 — Production Validation Audit
 * =========================================
 * Analytics ONLY. Zero production code changes.
 *
 * Fetches real 1-min candles from TwelveData (500 per pair, all 10 FOREX pairs).
 * Replays each 60-candle window through the production filter pipeline using
 * the exact exported indicator functions from SignalEngine.ts (no duplication).
 *
 * Batching: 7 pairs in minute 1, 62-second pause, 3 pairs in minute 2.
 * This guarantees < 8 API credits per minute (plan limit).
 *
 * Output: scratch/phase35_raw.json
 * Run:    npx ts-node --project tsconfig.script.json scripts/phase35-audit.ts
 */

import https from 'https';
import fs from 'fs';
import path from 'path';

// ── Production engine imports — no duplication, exact same functions ──────────
import {
  calculateEMA,
  calculateSMA,
  calculateRSI,
  calculateCCI,
  calculateStochastic,
  calculateATR,
  calculateSuperTrend,
  calculateADX,
  calculateSwingHighLow,
  calculateQualityScore,
} from '../src/lib/market-data/core/SignalEngine';

// ── Constants ─────────────────────────────────────────────────────────────────

const API_KEY     = process.env.TWELVEDATA_API_KEY || '144352e20b9644c9bf16be2c1d67f7bd';
const OUTPUT_SIZE = 500;
const WINDOW      = 60;
const MIN_QUALITY = 83;

// Batch 1: 7 pairs (7 API credits — within the 8/min plan limit)
const BATCH1 = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY'];
// Batch 2: 3 pairs (fetched after a fresh minute window)
const BATCH2 = ['AUD/JPY', 'USD/CHF', 'EUR/GBP'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Candle {
  timestamp: string;
  open:  number;
  high:  number;
  low:   number;
  close: number;
}

export interface AuditSnap {
  // ── Timing ─────────────────────────────────────────────────────────────────
  pair:      string;
  timestamp: string;          // ISO8601 UTC
  weekday:   number;          // 0=Sun … 6=Sat
  hour:      number;          // 0-23 UTC
  session:  'Asian' | 'London' | 'NY' | 'Off';

  // ── Filter pass/fail (F0 always true in our 60-candle window) ──────────────
  f1: boolean;                // no null indicators
  f2: boolean;                // atrInPips >= 1.2 && atr > atrSma*0.9
  f3: boolean;                // bodySize > bodySma*0.85
  f4: boolean;                // strategy conditions met (excl. quality score)
  f5: boolean;                // quality score >= 83

  // ── F2 sub-conditions ──────────────────────────────────────────────────────
  f2_pip: boolean;            // atrInPips >= 1.2
  f2_sma: boolean;            // atr > atrSma * 0.9

  // ── Market regime ──────────────────────────────────────────────────────────
  regime:      'trending' | 'ranging';
  isBullish:   boolean;
  isBearish:   boolean;
  isOversold:  boolean;       // for ranging CALL setup (stochK < 30)
  isOverbought:boolean;       // for ranging PUT setup (stochK > 70)

  // ── F4 sub-conditions (for the attempted direction) ────────────────────────
  // Trending: all four matter. Ranging: stoch=oversold/overbought (N/A for ST).
  f4_stoch:      boolean;
  f4_cci:        boolean;
  f4_supertrend: boolean;
  f4_sr:         boolean;
  f4_no_setup:   boolean;     // no direction to attempt (flat trend or mid-range stoch)

  // ── Signal output ──────────────────────────────────────────────────────────
  direction:    'CALL' | 'PUT' | 'WAIT';
  strategy:     'Trend Corridor Breakout' | 'Range Extreme Reversion' | 'none';
  confidence:   number;       // 85 | 86 | 87 | 88 | 0
  qualityScore: number;       // 70–100 (0 = not computed, f4 did not pass)

  // ── Indicator snapshot ─────────────────────────────────────────────────────
  atrPips:  number;
  bodyPips: number;
  adx:      number;
  rsi:      number;
  cci:      number;

  // ── Next-candle win/loss ───────────────────────────────────────────────────
  won: boolean | null;        // null = WAIT (no trade placed)
}

export interface PairAudit {
  pair:  string;
  snaps: AuditSnap[];
}

// ── Session helper ────────────────────────────────────────────────────────────

function getSession(ts: string): 'Asian' | 'London' | 'NY' | 'Off' {
  const h = new Date(ts).getUTCHours();
  if (h < 8)  return 'Asian';
  if (h < 13) return 'London';
  if (h < 22) return 'NY';
  return 'Off';
}

// ── TwelveData fetch ──────────────────────────────────────────────────────────

function fetchCandles(pair: string): Promise<Candle[]> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => { console.warn(`  [TIMEOUT] ${pair}`); resolve([]); }, 15000);
    https.get({
      hostname: 'api.twelvedata.com',
      path: `/time_series?symbol=${encodeURIComponent(pair)}&interval=1min&outputsize=${OUTPUT_SIZE}&timezone=UTC&apikey=${API_KEY}`,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          const j = JSON.parse(d);
          if (!j.values) { console.warn(`  [API ERR] ${pair}: ${j.message ?? j.status}`); resolve([]); return; }
          const out: Candle[] = j.values.map((v: Record<string, string>) => {
            const dt = v.datetime.includes('T') ? v.datetime : v.datetime.replace(' ', 'T');
            return {
              timestamp: new Date(dt.endsWith('Z') ? dt : dt + 'Z').toISOString(),
              open: +v.open, high: +v.high, low: +v.low, close: +v.close,
            };
          });
          resolve(out.reverse()); // oldest first
        } catch (e) { clearTimeout(timeout); resolve([]); }
      });
    }).on('error', e => { clearTimeout(timeout); console.warn(`  [NET ERR] ${pair}: ${e.message}`); resolve([]); });
  });
}

// ── Core replay — mirrors evaluateSignal() exactly ────────────────────────────

function replayWindow(pair: string, candles: Candle[]): AuditSnap | null {
  if (candles.length < WINDOW) return null;

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const idx    = closes.length - 1;
  const ts     = candles[idx].timestamp;
  const dt     = new Date(ts);

  const meta = {
    pair, timestamp: ts,
    weekday: dt.getUTCDay(),
    hour:    dt.getUTCHours(),
    session: getSession(ts),
  };

  // ── Indicators (same as evaluateSignal lines 396–403) ──────────────────────
  const ema21      = calculateEMA(closes, 21);
  const sma50      = calculateSMA(closes, 50);
  const rsi        = calculateRSI(closes, 14);
  const cci        = calculateCCI(highs, lows, closes, 14);
  const stoch      = calculateStochastic(highs, lows, closes, 14);
  const atr        = calculateATR(highs, lows, closes, 14);
  const supertrend = calculateSuperTrend(highs, lows, closes, 10, 3);
  const adxArr     = calculateADX(highs, lows, closes, 14);

  const cE21 = ema21[idx], cS50 = sma50[idx];
  const cK   = stoch.k[idx], cD = stoch.d[idx];
  const cRsi = rsi[idx], cCci = cci[idx], cAtr = atr[idx];
  const cST  = supertrend.values[idx], cSTdir = supertrend.trend[idx];
  const cPrice = closes[idx], cAdx = adxArr[idx] || 0;

  // ── F1: null check (same as engine lines 438–449) ─────────────────────────
  const f1 = !(
    cE21 === null || cS50 === null || cK === null || cD === null ||
    cRsi === null || cCci === null || cAtr === null || cST === null
  );

  if (!f1 || cAtr === null || cE21 === null || cS50 === null ||
      cK === null || cD === null || cRsi === null || cCci === null) {
    return {
      ...meta, f1: false, f2: false, f3: false, f4: false, f5: false,
      f2_pip: false, f2_sma: false,
      regime: 'trending', isBullish: false, isBearish: false,
      isOversold: false, isOverbought: false,
      f4_stoch: false, f4_cci: false, f4_supertrend: false, f4_sr: false, f4_no_setup: true,
      direction: 'WAIT', strategy: 'none', confidence: 0, qualityScore: 0,
      atrPips: 0, bodyPips: 0, adx: cAdx, rsi: 0, cci: 0, won: null,
    };
  }

  // ── F2: ATR pip gate (same as engine lines 461–469) ───────────────────────
  const atrSmaArr = calculateSMA(atr.map(v => v === null ? 0 : v), 20);
  const cAtrSma   = atrSmaArr[idx] || 0.0001;
  const pipSize   = pair.includes('JPY') ? 0.01 : 0.0001;
  const atrInPips = cAtr / pipSize;
  const f2_pip    = atrInPips >= 1.2;
  const f2_sma    = cAtr > cAtrSma * 0.9;
  const f2        = f2_pip && f2_sma;

  // ── F3: body expansion (same as engine lines 488–492) ─────────────────────
  const bodyAbs    = Math.abs(closes[idx] - candles[idx].open);
  const bodySmaArr = calculateSMA(candles.map(c => Math.abs(c.close - c.open)), 20);
  const cBodySma   = bodySmaArr[idx] || 0.0001;
  const f3         = bodyAbs > cBodySma * 0.85;
  const bodyPips   = bodyAbs / pipSize;

  // ── Regime (same as engine lines 451–455) ─────────────────────────────────
  const isBullish  = cE21 > cS50;
  const isBearish  = cE21 < cS50;
  const isTrending = cAdx > 22;
  const regime: 'trending' | 'ranging' = isTrending ? 'trending' : 'ranging';

  // ── Sub-conditions (same as engine lines 494–506) ─────────────────────────
  const isCallStoch  = cK > cD && cK < 70;
  const isPutStoch   = cK < cD && cK > 30;
  const isCallCci    = cCci > 0;
  const isPutCci     = cCci < 0;
  const isCallST     = cSTdir === 1;
  const isPutST      = cSTdir === -1;
  const { swingHigh, swingLow } = calculateSwingHighLow(highs, lows, 50);
  const atrBuf    = cAtr * 0.5;
  const hasCallSR = (swingHigh - cPrice) > atrBuf;
  const hasPutSR  = (cPrice - swingLow)  > atrBuf;
  const isOversold   = cK > cD && cK < 30;
  const isOverbought = cK < cD && cK > 70;

  // ── F4 + F5: strategy evaluation (same as engine lines 515–551) ───────────
  let f4 = false, f5 = false;
  let direction: 'CALL' | 'PUT' | 'WAIT' = 'WAIT';
  let strategy: 'Trend Corridor Breakout' | 'Range Extreme Reversion' | 'none' = 'none';
  let confidence = 0, qScore = 0;
  let f4_stoch = false, f4_cci = false, f4_supertrend = false, f4_sr = false, f4_no_setup = false;

  if (f2 && f3) {
    if (isTrending) {
      if (isBullish) {
        // Attempt CALL — record all sub-conditions
        f4_stoch = isCallStoch; f4_cci = isCallCci; f4_supertrend = isCallST; f4_sr = hasCallSR;
        if (isCallStoch && isCallCci && isCallST && hasCallSR) {
          f4     = true;
          qScore = calculateQualityScore('CALL', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasCallSR, idx);
          f5     = qScore >= MIN_QUALITY;
          if (f5) { direction = 'CALL'; strategy = 'Trend Corridor Breakout'; confidence = 86; }
        }
      } else if (isBearish) {
        // Attempt PUT — record all sub-conditions
        f4_stoch = isPutStoch; f4_cci = isPutCci; f4_supertrend = isPutST; f4_sr = hasPutSR;
        if (isPutStoch && isPutCci && isPutST && hasPutSR) {
          f4     = true;
          qScore = calculateQualityScore('PUT', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasPutSR, idx);
          f5     = qScore >= MIN_QUALITY;
          if (f5) { direction = 'PUT'; strategy = 'Trend Corridor Breakout'; confidence = 85; }
        }
      } else {
        f4_no_setup = true; // EMA21 == SMA50 exactly — no direction
      }
    } else {
      // Ranging regime
      if (isOversold) {
        f4_stoch = true; f4_supertrend = true; // N/A for ranging
        f4_cci = isCallCci; f4_sr = hasCallSR;
        if (isCallCci && hasCallSR) {
          f4     = true;
          qScore = calculateQualityScore('CALL', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasCallSR, idx);
          f5     = qScore >= MIN_QUALITY;
          if (f5) { direction = 'CALL'; strategy = 'Range Extreme Reversion'; confidence = 88; }
        }
      } else if (isOverbought) {
        f4_stoch = true; f4_supertrend = true;
        f4_cci = isPutCci; f4_sr = hasPutSR;
        if (isPutCci && hasPutSR) {
          f4     = true;
          qScore = calculateQualityScore('PUT', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasPutSR, idx);
          f5     = qScore >= MIN_QUALITY;
          if (f5) { direction = 'PUT'; strategy = 'Range Extreme Reversion'; confidence = 87; }
        }
      } else {
        f4_no_setup = true; // stoch in 30–70 zone — no extreme, no setup
      }
    }
  }

  return {
    ...meta,
    f1: true, f2, f3, f4, f5,
    f2_pip, f2_sma,
    regime, isBullish, isBearish, isOversold, isOverbought,
    f4_stoch, f4_cci, f4_supertrend, f4_sr, f4_no_setup,
    direction, strategy, confidence, qualityScore: qScore,
    atrPips: atrInPips, bodyPips, adx: cAdx, rsi: cRsi, cci: cCci,
    won: null,
  };
}

// ── Main orchestration ────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Phase 3.5 — Production Validation Audit               ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log(`  Window: ${WINDOW} candles | Min Q-score: ${MIN_QUALITY} | Data: ${OUTPUT_SIZE} bars/pair\n`);

  const allData: PairAudit[] = [];

  async function processBatch(batch: string[], batchNum: number) {
    console.log(`── Batch ${batchNum} ──────────────────────────────────────────`);
    for (const pair of batch) {
      process.stdout.write(`  ${pair.padEnd(8)}`);
      const candles = await fetchCandles(pair);

      if (candles.length < WINDOW + 1) {
        console.log(` ✗  (${candles.length} candles — skipped)`);
        allData.push({ pair, snaps: [] });
        await new Promise(r => setTimeout(r, 900));
        continue;
      }

      process.stdout.write(` ✓  (${candles.length} bars)`);
      const snaps: AuditSnap[] = [];

      for (let end = WINDOW; end < candles.length - 1; end++) {
        const win  = candles.slice(end - WINDOW, end);
        const snap = replayWindow(pair, win);
        if (!snap) continue;

        // Win/loss: compare signal to next candle
        if (snap.direction !== 'WAIT') {
          const next = candles[end];
          snap.won = snap.direction === 'CALL'
            ? next.close > next.open
            : next.close < next.open;
        }
        snaps.push(snap);
      }

      const sigs  = snaps.filter(s => s.direction !== 'WAIT').length;
      const wins  = snaps.filter(s => s.won === true).length;
      console.log(`  →  ${snaps.length} windows  |  ${sigs} signals  |  ${wins} wins`);

      allData.push({ pair, snaps });
      await new Promise(r => setTimeout(r, 900));
    }
    console.log('');
  }

  // Batch 1
  await processBatch(BATCH1, 1);

  // Rate-limit pause — wait until next clean API minute
  const nowSec = new Date().getSeconds();
  const pauseMs = Math.max(5000, (60 - nowSec + 5) * 1000);
  process.stdout.write(`  Rate-limit pause: ${(pauseMs / 1000).toFixed(0)}s ...`);
  await new Promise(r => setTimeout(r, pauseMs));
  console.log(' ready.\n');

  // Batch 2
  await processBatch(BATCH2, 2);

  // Write raw JSON
  const outDir = path.join(process.cwd(), 'scratch');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'phase35_raw.json');
  fs.writeFileSync(outPath, JSON.stringify(allData, null, 2));

  const totalPairs   = allData.filter(p => p.snaps.length > 0).length;
  const totalWindows = allData.reduce((a, p) => a + p.snaps.length, 0);
  const totalSignals = allData.reduce((a, p) => a + p.snaps.filter(s => s.direction !== 'WAIT').length, 0);
  const totalWins    = allData.reduce((a, p) => a + p.snaps.filter(s => s.won === true).length, 0);
  const totalTrades  = allData.reduce((a, p) => a + p.snaps.filter(s => s.won !== null).length, 0);

  console.log('════════════════════════════════════════════════════════');
  console.log(`  Pairs processed : ${totalPairs} / 10`);
  console.log(`  Total windows   : ${totalWindows}`);
  console.log(`  Total signals   : ${totalSignals}`);
  console.log(`  Wins / Trades   : ${totalWins} / ${totalTrades}`);
  console.log(`  Overall accuracy: ${totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '—'}%`);
  console.log(`  Output written  : scratch/phase35_raw.json`);
  console.log('════════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
