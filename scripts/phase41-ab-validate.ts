import https from 'https';
import fs from 'fs';
import path from 'path';

// ── Production Engine Imports ────────────────────────────────────────────────
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

// ── Constants ────────────────────────────────────────────────────────────────
const API_KEY     = process.env.TWELVEDATA_API_KEY || '144352e20b9644c9bf16be2c1d67f7bd';
const OUTPUT_SIZE = 1000;
const WINDOW      = 60;
const MIN_QUALITY = 83;

const BATCH1 = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY'];
const BATCH2 = ['AUD/JPY', 'USD/CHF', 'EUR/GBP'];

// ── Types ────────────────────────────────────────────────────────────────────
interface Candle {
  timestamp: string;
  open:  number;
  high:  number;
  low:   number;
  close: number;
}

interface ReplaySignal {
  pair: string;
  timestamp: string;
  hour: number;
  session: 'Asian' | 'London' | 'NY' | 'Off';
  direction: 'CALL' | 'PUT';
  strategy: string;
  won: boolean;
  adx: number;
  atrPips: number;
  bodyPips: number;
  rsi: number;
  cci: number;
  stochK: number;
  stochD: number;
  triggerCandleColor: 'GREEN' | 'RED' | 'DOJI';
  prevCandleBodyPips: number;
}

interface VariantMetrics {
  totalSignals: number;
  calls: number;
  puts: number;
  wins: number;
  losses: number;
  accuracy: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdown: number;
  recoveryFactor: number;
  signals: ReplaySignal[];
}

// ── Session Helper ───────────────────────────────────────────────────────────
function getSession(ts: string): 'Asian' | 'London' | 'NY' | 'Off' {
  const h = new Date(ts).getUTCHours();
  if (h < 8)  return 'Asian';
  if (h < 13) return 'London';
  if (h < 22) return 'NY';
  return 'Off';
}

// ── TwelveData Fetch ─────────────────────────────────────────────────────────
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

// ── Comparative Replay Evaluator ────────────────────────────────────────────
function runVariantReplay(
  pair: string,
  candles: Candle[],
  variant: 'A' | 'B' | 'C' | 'D'
): ReplaySignal[] {
  const signals: ReplaySignal[] = [];

  for (let end = WINDOW; end < candles.length - 1; end++) {
    const history = candles.slice(end - WINDOW, end);
    const idx = history.length - 1;
    const closes = history.map(c => c.close);
    const highs  = history.map(c => c.high);
    const lows   = history.map(c => c.low);

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

    const f1 = !(
      cE21 === null || cS50 === null || cK === null || cD === null ||
      cRsi === null || cCci === null || cAtr === null || cST === null
    );
    if (!f1 || cAtr === null || cE21 === null || cS50 === null ||
        cK === null || cD === null || cRsi === null || cCci === null) {
      continue;
    }

    const atrSmaArr = calculateSMA(atr.map(v => v === null ? 0 : v), 20);
    const cAtrSma   = atrSmaArr[idx] || 0.0001;
    const pipSize   = pair.includes('JPY') ? 0.01 : 0.0001;
    const atrInPips = cAtr / pipSize;
    const f2        = atrInPips >= 1.2 && cAtr > cAtrSma * 0.9;

    const bodyAbs    = Math.abs(closes[idx] - history[idx].open);
    const bodySmaArr = calculateSMA(history.map(c => Math.abs(c.close - c.open)), 20);
    const cBodySma   = bodySmaArr[idx] || 0.0001;
    const f3         = bodyAbs > cBodySma * 0.85;

    if (!f2 || !f3) continue;

    const isBullish  = cE21 > cS50;
    const isBearish  = cE21 < cS50;
    const isTrending = cAdx > 22;

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

    let direction: 'CALL' | 'PUT' | 'WAIT' = 'WAIT';
    let strategy = '';

    if (isTrending) {
      if (isBullish && isCallStoch && isCallCci && isCallST && hasCallSR) {
        const qScore = calculateQualityScore('CALL', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasCallSR, idx);
        if (qScore >= MIN_QUALITY) { direction = 'CALL'; strategy = 'Trend Corridor Breakout'; }
      } else if (isBearish && isPutStoch && isPutCci && isPutST && hasPutSR) {
        // Apply TCB PUT Variant Filter Rules
        const isBearishCandle = closes[idx] < history[idx].open;
        const prevCandleBody = Math.abs(history[idx - 1].close - history[idx - 1].open);
        const hasBearishBodyMomentum = isBearishCandle && (bodyAbs > prevCandleBody);
        
        let variantPass = true;
        if (variant === 'B') {
          variantPass = isBearishCandle;
        } else if (variant === 'C') {
          variantPass = hasBearishBodyMomentum;
        } else if (variant === 'D') {
          variantPass = cAdx > 26;
        }

        if (variantPass) {
          const qScore = calculateQualityScore('PUT', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasPutSR, idx);
          if (qScore >= MIN_QUALITY) { direction = 'PUT'; strategy = 'Trend Corridor Breakout'; }
        }
      }
    } else {
      if (isOversold && isCallCci && hasCallSR) {
        const qScore = calculateQualityScore('CALL', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasCallSR, idx);
        if (qScore >= MIN_QUALITY) { direction = 'CALL'; strategy = 'Range Extreme Reversion'; }
      } else if (isOverbought && isPutCci && hasPutSR) {
        const qScore = calculateQualityScore('PUT', cPrice, ema21, sma50, rsi, cci, stoch, atr, supertrend, adxArr, f3, hasPutSR, idx);
        if (qScore >= MIN_QUALITY) { direction = 'PUT'; strategy = 'Range Extreme Reversion'; }
      }
    }

    if (direction !== 'WAIT') {
      const next = candles[end];
      const won = direction === 'CALL' ? next.close > next.open : next.close < next.open;

      const triggerCandleColor = closes[idx] > history[idx].open ? 'GREEN' : (closes[idx] < history[idx].open ? 'RED' : 'DOJI');
      const prevCandleBodyPips = Math.abs(history[idx - 1].close - history[idx - 1].open) / pipSize;

      signals.push({
        pair,
        timestamp: history[idx].timestamp,
        hour: new Date(history[idx].timestamp).getUTCHours(),
        session: getSession(history[idx].timestamp),
        direction,
        strategy,
        won,
        adx: cAdx,
        atrPips: atrInPips,
        bodyPips: bodyAbs / pipSize,
        rsi: cRsi,
        cci: cCci,
        stochK: cK,
        stochD: cD,
        triggerCandleColor,
        prevCandleBodyPips,
      });
    }
  }

  return signals;
}

// ── Metrics Aggregator ───────────────────────────────────────────────────────
function calculateVariantMetrics(signals: ReplaySignal[]): VariantMetrics {
  const totalSignals = signals.length;
  const calls = signals.filter(s => s.direction === 'CALL').length;
  const puts = signals.filter(s => s.direction === 'PUT').length;
  const wins = signals.filter(s => s.won).length;
  const losses = totalSignals - wins;
  
  const accuracy = totalSignals > 0 ? (wins / totalSignals) * 100 : 0;
  
  // Payout 80%, Penalty 100%
  const expectancy = totalSignals > 0 ? (wins * 0.8 - losses * 1.0) / totalSignals : 0;
  const profitFactor = losses === 0 ? (wins > 0 ? Infinity : 0) : (wins * 0.8) / (losses * 1.0);

  // Drawdown
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let ddLen = 0;
  
  for (const s of signals) {
    equity += s.won ? 0.8 : -1.0;
    if (equity > peak) {
      peak = equity;
      ddLen = 0;
    } else {
      const dd = peak - equity;
      if (dd > maxDrawdown) maxDrawdown = dd;
      ddLen++;
    }
  }

  const recoveryFactor = maxDrawdown > 0 ? equity / maxDrawdown : (equity > 0 ? Infinity : 0);

  return {
    totalSignals,
    calls,
    puts,
    wins,
    losses,
    accuracy,
    expectancy,
    profitFactor,
    maxDrawdown,
    recoveryFactor,
    signals,
  };
}

// ── Main Execution ───────────────────────────────────────────────────────────
async function main() {
  console.log('Starting Phase 4.1 A/B Validation Replay...');
  const allCandles: { [pair: string]: Candle[] } = {};

  // Fetch candles
  for (const pair of BATCH1) {
    process.stdout.write(`Fetching ${pair}... `);
    allCandles[pair] = await fetchCandles(pair);
    console.log(`✓ (${allCandles[pair].length} bars)`);
    await new Promise(r => setTimeout(r, 900));
  }

  // Rate-limit pause
  const pauseMs = (60 - new Date().getSeconds() + 5) * 1000;
  console.log(`Rate-limit pause: ${(pauseMs / 1000).toFixed(0)}s...`);
  await new Promise(r => setTimeout(r, pauseMs));

  for (const pair of BATCH2) {
    process.stdout.write(`Fetching ${pair}... `);
    allCandles[pair] = await fetchCandles(pair);
    console.log(`✓ (${allCandles[pair].length} bars)`);
    await new Promise(r => setTimeout(r, 900));
  }

  // Run Replays for Variants A, B, C, D
  const results: { [variant: string]: { [pair: string]: ReplaySignal[] } } = {
    A: {}, B: {}, C: {}, D: {}
  };

  const variants: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

  for (const variant of variants) {
    for (const pair of Object.keys(allCandles)) {
      results[variant][pair] = runVariantReplay(pair, allCandles[pair], variant);
    }
  }

  // Compile global metrics
  const globalMetrics: { [variant: string]: VariantMetrics } = {};
  for (const variant of variants) {
    const allSignals: ReplaySignal[] = [];
    for (const pair of Object.keys(allCandles)) {
      allSignals.push(...results[variant][pair]);
    }
    globalMetrics[variant] = calculateVariantMetrics(allSignals);
  }

  // Analyze removed signals between Baseline A and others
  const getRemovedBreakdown = (varName: 'B' | 'C' | 'D') => {
    const aSigs = Object.values(results.A).flat();
    const varSigs = Object.values(results[varName]).flat();

    const removed = aSigs.filter(a => 
      !varSigs.some(v => v.pair === a.pair && v.timestamp === a.timestamp && v.direction === a.direction)
    );

    const removedWins = removed.filter(r => r.won).length;
    const removedLosses = removed.filter(r => !r.won).length;

    return {
      totalRemoved: removed.length,
      winsRemoved: removedWins,
      lossesRemoved: removedLosses,
      signals: removed
    };
  };

  const removedB = getRemovedBreakdown('B');
  const removedC = getRemovedBreakdown('C');
  const removedD = getRemovedBreakdown('D');

  // Markdown Generation
  const lines: string[] = [];
  lines.push('# Phase 4.1 A/B Validation Report');
  lines.push(`**Generated**: ${new Date().toUTCString()}`);
  lines.push(`**Method**: 10 FOREX pairs, sliding window size ${WINDOW}, output candles ${OUTPUT_SIZE} per pair.`);
  lines.push('');
  lines.push('## Section 1 — Global Comparative Metrics');
  lines.push('');
  lines.push('| Variant | Description | Total Signals | CALL | PUT | Wins | Losses | Accuracy | Expectancy | Profit Factor | Max Drawdown | Recovery Factor |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  
  const desc = {
    A: 'Variant A: Current Baseline v1.2 (no changes)',
    B: 'Variant B: Require bearish trigger candle (Close < Open)',
    C: 'Variant C: Require bearish body expansion (Close < Open & Body > Prev Body)',
    D: 'Variant D: Require ADX > 26'
  };

  for (const v of variants) {
    const m = globalMetrics[v];
    lines.push(`| **${v}** | ${desc[v]} | ${m.totalSignals} | ${m.calls} | ${m.puts} | ${m.wins} | ${m.losses} | ${m.accuracy.toFixed(1)}% | ${m.expectancy.toFixed(4)} | ${m.profitFactor.toFixed(2)} | ${m.maxDrawdown.toFixed(2)} | ${m.recoveryFactor === Infinity ? '∞' : m.recoveryFactor.toFixed(2)} |`);
  }
  lines.push('');

  lines.push('## Section 2 — Removed Trade Details');
  lines.push('');
  lines.push('### Variant B vs. Baseline v1.2');
  lines.push(`- **Total signals filtered**: ${removedB.totalRemoved}`);
  lines.push(`- **Winning trades filtered (False Negatives)**: ${removedB.winsRemoved}`);
  lines.push(`- **Losing trades filtered (True Negatives)**: ${removedB.lossesRemoved}`);
  lines.push('');
  if (removedB.totalRemoved > 0) {
    lines.push('| Pair | Timestamp (UTC) | Direction | Strategy | Indicator Profile | Result |');
    lines.push('|---|---|---|---|---|---|');
    for (const r of removedB.signals) {
      lines.push(`| ${r.pair} | ${r.timestamp} | ${r.direction} | ${r.strategy} | ADX: ${r.adx.toFixed(1)}, ATR: ${r.atrPips.toFixed(1)}, Body: ${r.bodyPips.toFixed(1)}, RSI: ${r.rsi.toFixed(1)}, CCI: ${r.cci.toFixed(1)}, Stoch: K ${r.stochK.toFixed(0)}/D ${r.stochD.toFixed(0)}, Color: ${r.triggerCandleColor} | ${r.won ? 'Win ❌ (Filtered)' : 'Loss ✅ (Filtered)'} |`);
    }
  } else {
    lines.push('> No trades were filtered by Variant B.');
  }
  lines.push('');

  lines.push('### Variant C vs. Baseline v1.2');
  lines.push(`- **Total signals filtered**: ${removedC.totalRemoved}`);
  lines.push(`- **Winning trades filtered (False Negatives)**: ${removedC.winsRemoved}`);
  lines.push(`- **Losing trades filtered (True Negatives)**: ${removedC.lossesRemoved}`);
  lines.push('');
  if (removedC.totalRemoved > 0) {
    lines.push('| Pair | Timestamp (UTC) | Direction | Strategy | Indicator Profile | Result |');
    lines.push('|---|---|---|---|---|---|');
    for (const r of removedC.signals) {
      lines.push(`| ${r.pair} | ${r.timestamp} | ${r.direction} | ${r.strategy} | ADX: ${r.adx.toFixed(1)}, ATR: ${r.atrPips.toFixed(1)}, Body: ${r.bodyPips.toFixed(1)}, Prev Body: ${r.prevCandleBodyPips.toFixed(1)}, Color: ${r.triggerCandleColor} | ${r.won ? 'Win ❌ (Filtered)' : 'Loss ✅ (Filtered)'} |`);
    }
  } else {
    lines.push('> No trades were filtered by Variant C.');
  }
  lines.push('');

  lines.push('### Variant D vs. Baseline v1.2');
  lines.push(`- **Total signals filtered**: ${removedD.totalRemoved}`);
  lines.push(`- **Winning trades filtered (False Negatives)**: ${removedD.winsRemoved}`);
  lines.push(`- **Losing trades filtered (True Negatives)**: ${removedD.lossesRemoved}`);
  lines.push('');
  if (removedD.totalRemoved > 0) {
    lines.push('| Pair | Timestamp (UTC) | Direction | Strategy | Indicator Profile | Result |');
    lines.push('|---|---|---|---|---|---|');
    for (const r of removedD.signals) {
      lines.push(`| ${r.pair} | ${r.timestamp} | ${r.direction} | ${r.strategy} | ADX: ${r.adx.toFixed(1)}, ATR: ${r.atrPips.toFixed(1)}, Body: ${r.bodyPips.toFixed(1)}, Color: ${r.triggerCandleColor} | ${r.won ? 'Win ❌ (Filtered)' : 'Loss ✅ (Filtered)'} |`);
    }
  } else {
    lines.push('> No trades were filtered by Variant D.');
  }
  lines.push('');

  lines.push('## Section 3 — Pair-by-Pair Breakdown');
  lines.push('');
  lines.push('| Pair | Variant A (Acc / Sigs) | Variant B (Acc / Sigs) | Variant C (Acc / Sigs) | Variant D (Acc / Sigs) |');
  lines.push('|---|---|---|---|---|');

  for (const pair of Object.keys(allCandles)) {
    const accA = results.A[pair].length > 0 ? `${(results.A[pair].filter(s => s.won).length / results.A[pair].length * 100).toFixed(0)}%` : '—';
    const accB = results.B[pair].length > 0 ? `${(results.B[pair].filter(s => s.won).length / results.B[pair].length * 100).toFixed(0)}%` : '—';
    const accC = results.C[pair].length > 0 ? `${(results.C[pair].filter(s => s.won).length / results.C[pair].length * 100).toFixed(0)}%` : '—';
    const accD = results.D[pair].length > 0 ? `${(results.D[pair].filter(s => s.won).length / results.D[pair].length * 100).toFixed(0)}%` : '—';

    lines.push(`| ${pair} | ${accA} (${results.A[pair].length}) | ${accB} (${results.B[pair].length}) | ${accC} (${results.C[pair].length}) | ${accD} (${results.D[pair].length}) |`);
  }
  lines.push('');

  lines.push('## Section 4 — Session Breakdown');
  lines.push('');
  const getSessionStr = (varName: 'A' | 'B' | 'C' | 'D', session: 'Asian' | 'London' | 'NY' | 'Off') => {
    const sigs = Object.values(results[varName]).flat().filter(s => s.session === session);
    const wins = sigs.filter(s => s.won).length;
    return sigs.length > 0 ? `${((wins / sigs.length) * 100).toFixed(0)}% (${sigs.length})` : '—';
  };

  lines.push('| Session | Variant A | Variant B | Variant C | Variant D |');
  lines.push('|---|---|---|---|---|');
  lines.push(`| Asian | ${getSessionStr('A', 'Asian')} | ${getSessionStr('B', 'Asian')} | ${getSessionStr('C', 'Asian')} | ${getSessionStr('D', 'Asian')} |`);
  lines.push(`| London | ${getSessionStr('A', 'London')} | ${getSessionStr('B', 'London')} | ${getSessionStr('C', 'London')} | ${getSessionStr('D', 'London')} |`);
  lines.push(`| NY | ${getSessionStr('A', 'NY')} | ${getSessionStr('B', 'NY')} | ${getSessionStr('C', 'NY')} | ${getSessionStr('D', 'NY')} |`);
  lines.push('');

  lines.push('## Section 5 — Summary Findings');
  lines.push('');
  lines.push('Based on the comparative replay:');
  lines.push('');
  lines.push(`1. **Variant B (Bearish Trigger Candle)** filters out signals where the trigger candle closed green. This removes counter-momentum entries.`);
  lines.push(`2. **Variant C (Bearish Body Momentum)** requires a red trigger candle that is larger than the previous candle body, ensuring expanding downward strength.`);
  lines.push(`3. **Variant D (ADX > 26)** filters out signals occurring in weak trending environments.`);
  lines.push('');
  lines.push('*End of report.*');

  // Write report
  const scratchDir = path.join(process.cwd(), 'scratch');
  fs.writeFileSync(path.join(scratchDir, 'phase41_ab_validation_report.md'), lines.join('\n'));
  console.log('Verification report written to scratch/phase41_ab_validation_report.md');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
