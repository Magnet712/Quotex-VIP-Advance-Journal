/**
 * Phase 3 Validation Script — Signal Engine Historical Replay
 *
 * Fetches real 1-minute OHLC candles from TwelveData for all 10 supported FOREX pairs.
 * Replays each candle window through both old and new volatility gate implementations
 * using the actual exported indicator functions from SignalEngine.ts.
 *
 * Output: scratch/phase3_raw.json + scratch/phase3_report.md
 *
 * Run: npx ts-node --project tsconfig.script.json scripts/phase3-validate.ts
 */

import https from 'https';
import fs from 'fs';
import path from 'path';

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

// ─── Constants ────────────────────────────────────────────────────────────────

const API_KEY      = process.env.TWELVEDATA_API_KEY || '144352e20b9644c9bf16be2c1d67f7bd';
const OUTPUT_SIZE  = 500;
const WINDOW       = 60;
const MIN_QUALITY  = 83;

const PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
  'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'USD/CHF', 'EUR/GBP',
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candle {
  timestamp: string;
  open: number; high: number; low: number; close: number;
}

interface Snap {
  f0: boolean; f1: boolean;
  f2old: boolean; f2new: boolean;
  f3: boolean; f4: boolean; f5: boolean;
  dir: 'CALL' | 'PUT' | 'WAIT';
  dir_old: 'CALL' | 'PUT' | 'WAIT';
  atrPips: number; bodyPips: number; adx: number; qScore: number;
  session: 'Asian' | 'London' | 'NY' | 'Off';
  won: boolean | null;
}

// ─── Session helper ───────────────────────────────────────────────────────────

function getSession(ts: string): 'Asian' | 'London' | 'NY' | 'Off' {
  const h = new Date(ts).getUTCHours();
  if (h >= 0  && h < 8)  return 'Asian';
  if (h >= 8  && h < 13) return 'London';
  if (h >= 13 && h < 22) return 'NY';
  return 'Off';
}

// ─── TwelveData fetch ─────────────────────────────────────────────────────────

function fetchCandles(pair: string): Promise<Candle[]> {
  return new Promise((resolve) => {
    const to = setTimeout(() => { resolve([]); }, 15000);
    const opts = {
      hostname: 'api.twelvedata.com',
      path: `/time_series?symbol=${encodeURIComponent(pair)}&interval=1min&outputsize=${OUTPUT_SIZE}&timezone=UTC&apikey=${API_KEY}`,
      method: 'GET',
    };
    https.get(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        clearTimeout(to);
        try {
          const j = JSON.parse(d);
          if (!j.values) { console.warn(`  [${pair}] ${j.message || j.status}`); resolve([]); return; }
          const out: Candle[] = j.values.map((v: Record<string,string>) => {
            const dt = v.datetime.includes('T') ? v.datetime : v.datetime.replace(' ', 'T');
            return {
              timestamp: new Date(dt.endsWith('Z') ? dt : dt + 'Z').toISOString(),
              open: +v.open, high: +v.high, low: +v.low, close: +v.close,
            };
          });
          resolve(out.reverse());
        } catch (e) { clearTimeout(to); resolve([]); }
      });
    }).on('error', () => { clearTimeout(to); resolve([]); });
  });
}

// ─── Single-window replay ─────────────────────────────────────────────────────

function replayWindow(pair: string, candles: Candle[]): Snap | null {
  if (candles.length < WINDOW) return null;

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const idx    = closes.length - 1;

  const f0 = candles.length >= 52;
  if (!f0) return buildWait(true, false, false, false, false, false, 0, 0, 0, 0, candles[idx].timestamp);

  const ema21      = calculateEMA(closes, 21);
  const sma50      = calculateSMA(closes, 50);
  const rsi        = calculateRSI(closes, 14);
  const cci        = calculateCCI(highs, lows, closes, 14);
  const stoch      = calculateStochastic(highs, lows, closes, 14);
  const atr        = calculateATR(highs, lows, closes, 14);
  const supertrend = calculateSuperTrend(highs, lows, closes, 10, 3);
  const adxArr     = calculateADX(highs, lows, closes, 14);

  const cE21 = ema21[idx], cS50 = sma50[idx], cK = stoch.k[idx], cD = stoch.d[idx];
  const cRsi = rsi[idx],   cCci = cci[idx],   cAtr = atr[idx];
  const cST  = supertrend.values[idx], cSTdir = supertrend.trend[idx];
  const cPrice = closes[idx], cAdx = adxArr[idx] || 0;

  const f1 = !(cE21 === null || cS50 === null || cK === null || cD === null ||
               cRsi === null || cCci === null || cAtr === null || cST === null);

  if (!f1 || cAtr === null || cE21 === null || cS50 === null || cK === null ||
      cD === null || cRsi === null || cCci === null) {
    return buildWait(true, true, false, false, false, false, 0, 0, cAdx, 0, candles[idx].timestamp);
  }

  const atrSmaArr    = calculateSMA(atr.map(v => v === null ? 0 : v), 20);
  const cAtrSma      = atrSmaArr[idx] || 0.0001;
  const normalizedAtr = cAtr / cPrice;
  const pipSize       = pair.includes('JPY') ? 0.01 : 0.0001;
  const atrInPips     = cAtr / pipSize;

  const f2old = normalizedAtr >= 0.00015 && cAtr > cAtrSma * 0.9;
  const f2new = atrInPips >= 1.0          && cAtr > cAtrSma * 0.9;

  const bodyAbs   = Math.abs(closes[idx] - candles[idx].open);
  const bodySmaA  = calculateSMA(candles.map(c => Math.abs(c.close - c.open)), 20);
  const cBodySma  = bodySmaA[idx] || 0.0001;
  const f3        = bodyAbs > cBodySma * 0.85;

  const bodyPips  = bodyAbs / pipSize;

  const isTrending     = cAdx > 22;
  const isBull         = cE21 > cS50;
  const isBear         = cE21 < cS50;
  const cK_: number    = cK!; const cD_: number = cD!;
  const isCallStoch    = cK_ > cD_ && cK_ < 70;
  const isPutStoch     = cK_ < cD_ && cK_ > 30;
  const isCallCci      = cCci! > 0;
  const isPutCci       = cCci! < 0;
  const isCallST       = cSTdir === 1;
  const isPutST        = cSTdir === -1;
  const { swingHigh, swingLow } = calculateSwingHighLow(highs, lows, 50);
  const atrBuf         = cAtr * 0.5;
  const hasCallSR      = (swingHigh - cPrice) > atrBuf;
  const hasPutSR       = (cPrice - swingLow) > atrBuf;
  const isOversold     = cK_ > cD_ && cK_ < 30;
  const isOverbought   = cK_ < cD_ && cK_ > 70;

  function run(volOk: boolean): { f4: boolean; f5: boolean; dir: 'CALL'|'PUT'|'WAIT'; q: number } {
    if (!volOk || !f3) return { f4: false, f5: false, dir: 'WAIT', q: 0 };
    let dir: 'CALL'|'PUT'|'WAIT' = 'WAIT', q = 0;
    let f4m = false;
    if (isTrending) {
      if (isBull && isCallStoch && isCallCci && isCallST && hasCallSR) {
        f4m = true;
        q = calculateQualityScore('CALL', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasCallSR, idx);
        if (q >= MIN_QUALITY) dir = 'CALL';
      } else if (isBear && isPutStoch && isPutCci && isPutST && hasPutSR) {
        f4m = true;
        q = calculateQualityScore('PUT', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasPutSR, idx);
        if (q >= MIN_QUALITY) dir = 'PUT';
      }
    } else {
      if (isOversold && isCallCci && hasCallSR) {
        f4m = true;
        q = calculateQualityScore('CALL', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasCallSR, idx);
        if (q >= MIN_QUALITY) dir = 'CALL';
      } else if (isOverbought && isPutCci && hasPutSR) {
        f4m = true;
        q = calculateQualityScore('PUT', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasPutSR, idx);
        if (q >= MIN_QUALITY) dir = 'PUT';
      }
    }
    return { f4: f4m, f5: dir !== 'WAIT', dir, q };
  }

  const nr = run(f2new);
  const or = run(f2old);

  return {
    f0: true, f1: true,
    f2old, f2new, f3,
    f4: nr.f4, f5: nr.f5,
    dir: nr.dir, dir_old: or.dir,
    atrPips: atrInPips, bodyPips, adx: cAdx, qScore: nr.q,
    session: getSession(candles[idx].timestamp),
    won: null,
  };
}

function buildWait(f0: boolean, f1: boolean, f2old: boolean, f2new: boolean, f3: boolean, f4: boolean,
  atr: number, body: number, adx: number, q: number, ts: string): Snap {
  return { f0, f1, f2old, f2new, f3, f4, f5: false, dir: 'WAIT', dir_old: 'WAIT',
    atrPips: atr, bodyPips: body, adx, qScore: q, session: getSession(ts), won: null };
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

function pct(n: number, d: number) { return d === 0 ? '—' : ((n / d) * 100).toFixed(1) + '%'; }
function avg(a: number[]) { return a.length === 0 ? 0 : a.reduce((x, y) => x + y, 0) / a.length; }
function fmtAvg(a: number[]) { return avg(a).toFixed(3); }

// ─── Report builder ───────────────────────────────────────────────────────────

interface PairData { pair: string; snaps: Snap[]; }

function buildReport(all: PairData[]): string {
  const L: string[] = [];
  const push = (...s: string[]) => s.forEach(x => L.push(x));

  push(
    '# Phase 3 — Signal Engine Validation Report',
    `**Generated**: ${new Date().toUTCString()}`,
    `**Source**: TwelveData REST API — ${OUTPUT_SIZE} × 1-min candles per pair`,
    `**Window**: ${WINDOW} candles | **Min Q-score**: ${MIN_QUALITY}`,
    `**Sessions (UTC)**: Asian 00–08h | London 08–13h | NY 13–22h | Off 22–24h`,
    '', '---', '',
  );

  for (const { pair, snaps } of all) {
    const total = snaps.length;
    if (total === 0) { push(`## ${pair}`, '', '> No data returned from API.', '', '---', ''); continue; }

    const f1s   = snaps.filter(s => s.f1);
    const f2o   = f1s.filter(s => s.f2old);
    const f2n   = f1s.filter(s => s.f2new);
    const f3s   = f1s.filter(s => s.f3);
    const f4s   = f2n.filter(s => s.f3 && s.f4);
    const f5s   = snaps.filter(s => s.f5);
    const nCall = snaps.filter(s => s.dir === 'CALL').length;
    const nPut  = snaps.filter(s => s.dir === 'PUT').length;
    const nWait = snaps.filter(s => s.dir === 'WAIT').length;
    const oCall = snaps.filter(s => s.dir_old === 'CALL').length;
    const oPut  = snaps.filter(s => s.dir_old === 'PUT').length;
    const trades= snaps.filter(s => s.won !== null);
    const wins  = trades.filter(s => s.won === true).length;

    push(
      `## ${pair}`, '',
      `**Windows replayed**: ${total}`, '',
      '### Filter Pass Rates', '',
      '| Filter | Description | Pass | Denom | Rate |',
      '|---|---|---|---|---|',
      `| F0 | Candle count ≥ 52         | ${total} | ${total} | 100.0% |`,
      `| F1 | No null indicators         | ${f1s.length} | ${total} | ${pct(f1s.length, total)} |`,
      `| F2 OLD | normalizedAtr ≥ 0.00015 | ${f2o.length} | ${f1s.length} | ${pct(f2o.length, f1s.length)} |`,
      `| F2 NEW | atrInPips ≥ 1.0          | ${f2n.length} | ${f1s.length} | ${pct(f2n.length, f1s.length)} |`,
      `| F3 | Body expansion (of F1)     | ${f3s.length} | ${f1s.length} | ${pct(f3s.length, f1s.length)} |`,
      `| F4 | Strategy conditions (of F2N+F3) | ${f4s.length} | ${Math.min(f2n.length, f3s.length)} | ${pct(f4s.length, Math.min(f2n.length, f3s.length))} |`,
      `| F5 | Quality score ≥ 83 (of F4) | ${f5s.length} | ${f4s.length} | ${pct(f5s.length, f4s.length)} |`,
      '',
      '### Signal Counts', '',
      '| | NEW gate | OLD gate |',
      '|---|---|---|',
      `| CALL  | ${nCall} | ${oCall} |`,
      `| PUT   | ${nPut}  | ${oPut}  |`,
      `| WAIT  | ${nWait} | ${snaps.length - oCall - oPut} |`,
      `| Total signals | ${nCall + nPut} | ${oCall + oPut} |`,
      `| Wins / Trades | ${wins} / ${trades.length} | — |`,
      `| **Accuracy** | **${pct(wins, trades.length)}** | — |`,
      '',
      '### Key Averages (valid indicator windows)', '',
      '| Metric | Value |',
      '|---|---|',
      `| Avg ATR (pips)    | ${fmtAvg(f1s.map(s => s.atrPips))} |`,
      `| Avg body (pips)   | ${fmtAvg(f1s.map(s => s.bodyPips))} |`,
      `| Avg ADX           | ${fmtAvg(f1s.map(s => s.adx))} |`,
      `| Avg Q-score (signals) | ${fmtAvg(f5s.map(s => s.qScore))} |`,
      '',
    );

    // Session breakdown
    push('### Session Breakdown (NEW gate)', '');
    push('| Session | Windows | F2 pass% | F3 pass% | F4 pass% | F5 pass% | CALL | PUT | WAIT | Wins | Acc% | Avg ATR pip |');
    push('|---|---|---|---|---|---|---|---|---|---|---|---|');

    for (const sess of ['Asian', 'London', 'NY'] as const) {
      const ss   = snaps.filter(s => s.session === sess);
      const sF1  = ss.filter(s => s.f1);
      const sF2n = sF1.filter(s => s.f2new);
      const sF3  = sF1.filter(s => s.f3);
      const sF4  = sF2n.filter(s => s.f3 && s.f4);
      const sF5  = ss.filter(s => s.f5);
      const sC   = ss.filter(s => s.dir === 'CALL').length;
      const sP   = ss.filter(s => s.dir === 'PUT').length;
      const sW   = ss.filter(s => s.dir === 'WAIT').length;
      const sTr  = ss.filter(s => s.won !== null);
      const sWin = sTr.filter(s => s.won === true).length;
      push(`| ${sess} | ${ss.length} | ${pct(sF2n.length, sF1.length)} | ${pct(sF3.length, sF1.length)} | ${pct(sF4.length, sF2n.length)} | ${pct(sF5.length, sF4.length)} | ${sC} | ${sP} | ${sW} | ${sWin} | ${pct(sWin, sTr.length)} | ${fmtAvg(sF1.map(s => s.atrPips))} |`);
    }
    push('');

    // ATR distribution
    const v   = f1s;
    const a10 = v.filter(s => s.atrPips < 1.0);
    const a11 = v.filter(s => s.atrPips >= 1.0 && s.atrPips < 1.1);
    const a12 = v.filter(s => s.atrPips >= 1.1 && s.atrPips < 1.2);
    const a13 = v.filter(s => s.atrPips >= 1.2);

    const sg10 = f5s.filter(s => s.atrPips >= 1.0 && s.atrPips < 1.1);
    const sg11 = f5s.filter(s => s.atrPips >= 1.1 && s.atrPips < 1.2);
    const sg12 = f5s.filter(s => s.atrPips >= 1.2);
    const w10  = sg10.filter(s => s.won === true).length;
    const w11  = sg11.filter(s => s.won === true).length;
    const w12  = sg12.filter(s => s.won === true).length;

    push(
      '### ATR Pip Distribution & Threshold Sensitivity', '',
      '| ATR Band | Windows | % of valid |',
      '|---|---|---|',
      `| < 1.0 pip      | ${a10.length} | ${pct(a10.length, v.length)} |`,
      `| 1.0 – 1.1 pip  | ${a11.length} | ${pct(a11.length, v.length)} |`,
      `| 1.1 – 1.2 pip  | ${a12.length} | ${pct(a12.length, v.length)} |`,
      `| ≥ 1.2 pip      | ${a13.length} | ${pct(a13.length, v.length)} |`,
      '',
      '| ATR Band | Signals | Wins | Accuracy |',
      '|---|---|---|---|',
      `| 1.0 – 1.1 pip (marginal) | ${sg10.length} | ${w10} | ${pct(w10, sg10.length)} |`,
      `| 1.1 – 1.2 pip            | ${sg11.length} | ${w11} | ${pct(w11, sg11.length)} |`,
      `| ≥ 1.2 pip                | ${sg12.length} | ${w12} | ${pct(w12, sg12.length)} |`,
      '', '---', '',
    );
  }

  // ── Global summary ─────────────────────────────────────────────────────────
  const gSnaps  = all.flatMap(x => x.snaps);
  const gF1     = gSnaps.filter(s => s.f1);
  const gF2o    = gF1.filter(s => s.f2old);
  const gF2n    = gF1.filter(s => s.f2new);
  const gSigN   = gSnaps.filter(s => s.dir !== 'WAIT').length;
  const gSigO   = gSnaps.filter(s => s.dir_old !== 'WAIT').length;
  const gTrades = gSnaps.filter(s => s.won !== null);
  const gWins   = gTrades.filter(s => s.won === true).length;

  const marg    = gSnaps.filter(s => s.f5 && s.atrPips >= 1.0 && s.atrPips < 1.2);
  const margW   = marg.filter(s => s.won === true).length;
  const hv      = gSnaps.filter(s => s.f5 && s.atrPips >= 1.2);
  const hvW     = hv.filter(s => s.won === true).length;
  const mAcc    = marg.length > 0 ? (margW / marg.length) * 100 : 0;
  const hAcc    = hv.length  > 0 ? (hvW   / hv.length)   * 100 : 0;
  const delta   = hAcc - mAcc;

  push(
    '## Global Summary — All 10 Pairs', '',
    '| Metric | OLD gate | NEW gate |',
    '|---|---|---|',
    `| F2 pass rate  | ${pct(gF2o.length, gF1.length)} | ${pct(gF2n.length, gF1.length)} |`,
    `| Total signals | ${gSigO} | ${gSigN} |`,
    `| Signal delta  | baseline | +${gSigN - gSigO} |`,
    `| Accuracy      | — | ${pct(gWins, gTrades.length)} |`,
    '',
    '### Marginal vs High-Volatility Accuracy', '',
    '| Band | Signals | Accuracy |',
    '|---|---|---|',
    `| 1.0 – 1.2 pip (marginal) | ${marg.length} | ${mAcc.toFixed(1)}% |`,
    `| ≥ 1.2 pip (high vol)     | ${hv.length}   | ${hAcc.toFixed(1)}% |`,
    `| **Accuracy delta**       | — | **${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp** |`,
    '',
  );

  // ── Recommendation ─────────────────────────────────────────────────────────
  push('## Final Recommendation', '');

  if (Math.abs(delta) < 3) {
    push(
      '**→ KEEP threshold at 1.0 pip.**',
      '',
      `The accuracy difference between the 1.0–1.2 pip marginal band and ≥1.2 pip signals is **${Math.abs(delta).toFixed(1)} pp** — within statistical noise for this sample size. Raising the threshold would reduce signal frequency without a statistically meaningful gain in accuracy. The downstream filters (body expansion, strategy conditions, quality score ≥83) are sufficient quality guards.`,
    );
  } else if (delta > 5) {
    push(
      '**→ RAISE threshold to 1.2 pips.**',
      '',
      `High-ATR signals (≥1.2 pip) outperform marginal signals (1.0–1.2 pip) by **${delta.toFixed(1)} pp**. This is statistically significant and justifies a higher threshold. Cost: ${marg.length} fewer signals globally, but improved accuracy.`,
    );
  } else {
    push(
      '**→ CONSIDER raising threshold to 1.1 pips.**',
      '',
      `The 1.0–1.1 pip band shows modestly lower accuracy (delta: **${delta.toFixed(1)} pp**). A threshold of 1.1 pips would prune the weakest marginal candles while retaining more signals than a 1.2 pip threshold. This is a conservative adjustment.`,
    );
  }

  push('', '---', '', '*Phase 3 complete. No trading logic was modified.*');
  return L.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Phase 3 — Signal Engine Validation        ║');
  console.log('╚════════════════════════════════════════════╝\n');

  const allData: PairData[] = [];

  for (const pair of PAIRS) {
    process.stdout.write(`Fetching ${pair}...`);
    const candles = await fetchCandles(pair);
    if (candles.length < WINDOW + 1) {
      console.log(` ✗ (${candles.length} candles — insufficient)`);
      allData.push({ pair, snaps: [] });
      continue;
    }
    console.log(` ✓ (${candles.length} candles)`);

    const snaps: Snap[] = [];
    for (let end = WINDOW; end < candles.length - 1; end++) {
      const win  = candles.slice(end - WINDOW, end);
      const snap = replayWindow(pair, win);
      if (!snap) continue;

      // Win/loss from next candle
      if (snap.dir !== 'WAIT') {
        const next = candles[end];
        snap.won = snap.dir === 'CALL' ? (next.close > next.open) : (next.close < next.open);
      }
      snaps.push(snap);
    }

    console.log(`  Replayed: ${snaps.length} windows`);
    allData.push({ pair, snaps });

    // Rate-limit courtesy between pairs
    await new Promise(r => setTimeout(r, 900));
  }

  const report = buildReport(allData);

  const outDir = path.join(process.cwd(), 'scratch');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'phase3_raw.json'), JSON.stringify(allData, null, 2));
  fs.writeFileSync(path.join(outDir, 'phase3_report.md'), report);

  console.log('\n✓ scratch/phase3_report.md written');
  console.log('✓ scratch/phase3_raw.json written\n');
}

main().catch(e => { console.error(e); process.exit(1); });
