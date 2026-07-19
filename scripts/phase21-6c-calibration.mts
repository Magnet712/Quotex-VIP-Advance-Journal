/**
 * Phase 21.6C — Signal Quality Calibration Verification
 *
 * Validates the NO_TRADE quality filter across multiple threshold
 * configurations. Does NOT modify any production code.
 *
 * Run: npx tsx scripts/phase21-6c-calibration.mts
 */

import { analyzeCandles } from '../src/lib/otc/indicator-engine';
import type { CandleSource } from '../src/lib/otc/types';

// ─── Candle generation (same algorithm as simulated_feed.ts) ───────────────

function sr(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const PAIR_BASE_PRICES: Record<string, { base: number; pip: number }> = {
  'EUR/USD': { base: 1.08450, pip: 5 }, 'GBP/USD': { base: 1.26500, pip: 5 },
  'USD/JPY': { base: 149.500, pip: 2 }, 'AUD/USD': { base: 0.65200, pip: 5 },
  'USD/CAD': { base: 1.35800, pip: 5 }, 'EUR/JPY': { base: 162.100, pip: 2 },
  'GBP/JPY': { base: 189.200, pip: 2 }, 'EUR/GBP': { base: 0.85700, pip: 5 },
  'NZD/USD': { base: 0.59800, pip: 5 }, 'USD/CHF': { base: 0.90400, pip: 5 },
  'EUR/AUD': { base: 1.66200, pip: 5 }, 'GBP/AUD': { base: 1.93600, pip: 5 },
  'AUD/JPY': { base: 97.500, pip: 2 }, 'CAD/JPY': { base: 110.200, pip: 2 },
  'CHF/JPY': { base: 165.400, pip: 2 }, 'EUR/CAD': { base: 1.47300, pip: 5 },
  'GBP/CAD': { base: 1.71500, pip: 5 }, 'USD/SGD': { base: 1.34200, pip: 5 },
  'USD/INR': { base: 83.650, pip: 2 }, 'USD/BRL': { base: 4.98500, pip: 3 },
  'USD/MXN': { base: 17.1500, pip: 3 }, 'EUR/CHF': { base: 0.97800, pip: 5 },
  'GBP/CHF': { base: 1.13200, pip: 5 }, 'AUD/CAD': { base: 0.89600, pip: 5 },
  'AUD/NZD': { base: 1.09100, pip: 5 }, 'NZD/JPY': { base: 89.700, pip: 2 },
  'GBP/NZD': { base: 2.11500, pip: 5 }, 'EUR/NZD': { base: 1.81200, pip: 5 },
  'CAD/CHF': { base: 0.66600, pip: 5 }, 'USD/ZAR': { base: 18.6500, pip: 3 },
  'USD/TRY': { base: 32.4500, pip: 3 }, 'USD/ARS': { base: 920.00, pip: 1 },
  'USD/PKR': { base: 278.50, pip: 1 }, 'USD/BDT': { base: 109.80, pip: 1 },
};

const PAIRS = Object.keys(PAIR_BASE_PRICES);

interface OTCCandle {
  pair: string; timeframe: string; open: number; high: number; low: number; close: number; timestamp: Date; source: CandleSource;
}

function buildSimulatedCandle(pair: string, minuteSeed: number, candleTimestamp: Date): OTCCandle {
  const config = PAIR_BASE_PRICES[pair];
  const pairHash = pair.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const s = pairHash * 7919 + minuteSeed;
  const priceJitter = (sr(s + 0.9) - 0.5) * config.base * 0.003;
  const close = parseFloat((config.base + priceJitter).toFixed(config.pip));
  const spread = config.base * 0.001;
  const open = parseFloat((close + (sr(s + 1.1) - 0.5) * spread).toFixed(config.pip));
  const high = parseFloat((Math.max(open, close) + sr(s + 1.2) * spread).toFixed(config.pip));
  const low = parseFloat((Math.min(open, close) - sr(s + 1.3) * spread).toFixed(config.pip));
  return { pair, timeframe: '1m', open, high, low, close, timestamp: candleTimestamp, source: 'simulation' as CandleSource };
}

function generateCandles(pair: string, baseMinute: number, count: number): OTCCandle[] {
  const candles: OTCCandle[] = [];
  for (let i = 0; i < count; i++) {
    const seed = baseMinute - count + 1 + i;
    candles.push(buildSimulatedCandle(pair, seed, new Date(seed * 60000)));
  }
  return candles;
}

// ─── Threshold configurations ──────────────────────────────────────────────

interface GateConfig {
  name: string;
  desc: string;
  /** topScore must be >= this to avoid NO_TRADE from Rule 1 */
  topScoreMin: number;
  /** diff must be > this (strictly) to avoid NO_TRADE from Rule 2 */
  diffMin: number;
  /** For Rule 3: if diff <= this AND confirmations < confMinForWeak → NO_TRADE */
  diffMinWeak: number;
  confMinForWeak: number;
  /** For Rule 4: confirmations must be >= this */
  confMin: number;
}

const CONFIGS: GateConfig[] = [
  {
    name: 'LOOSER',
    desc: 'Harder to trigger NO_TRADE (fewer filtered)',
    topScoreMin: 3, diffMin: 0, diffMinWeak: 1, confMinForWeak: 3, confMin: 2,
  },
  {
    name: 'BASELINE',
    desc: 'Current Phase 21.6B thresholds',
    topScoreMin: 5, diffMin: 1, diffMinWeak: 2, confMinForWeak: 4, confMin: 3,
  },
  {
    name: 'STRICTER',
    desc: 'Easier to trigger NO_TRADE (more filtered)',
    topScoreMin: 6, diffMin: 2, diffMinWeak: 3, confMinForWeak: 4, confMin: 4,
  },
];

// ─── Quality gate evaluator (copies indicator-engine.ts logic exactly) ─────

interface QualityEval {
  direction: 'CALL' | 'PUT' | 'NO_TRADE';
  noTradeReason?: string;
}

function evaluateQuality(
  bullPts: number, bearPts: number, confirmations: number,
  config: GateConfig | null
): QualityEval {
  const isBull = bullPts >= bearPts;
  const topScore = Math.max(bullPts, bearPts);
  const diff = Math.abs(bullPts - bearPts);

  // No gate — always produce CALL/PUT (Phase 21 baseline)
  if (config === null) {
    return { direction: isBull ? 'CALL' : 'PUT' };
  }

  // Rule 1: topScore < threshold
  if (topScore < config.topScoreMin) {
    return { direction: 'NO_TRADE', noTradeReason: `Insufficient indicator activity — topScore < ${config.topScoreMin}` };
  }
  // Rule 2: diff <= threshold
  if (diff <= config.diffMin) {
    return { direction: 'NO_TRADE', noTradeReason: `Bull/Bear strength effectively tied — diff ≤ ${config.diffMin}` };
  }
  // Rule 3: narrow diff + weak confluence
  if (diff <= config.diffMinWeak && confirmations < config.confMinForWeak) {
    return { direction: 'NO_TRADE', noTradeReason: `Narrow margin with weak indicator confluence` };
  }
  // Rule 4: insufficient confirmations
  if (confirmations < config.confMin) {
    return { direction: 'NO_TRADE', noTradeReason: `Majority of indicators conflict with dominant direction` };
  }

  return { direction: isBull ? 'CALL' : 'PUT' };
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function round2(v: number): number { return Math.round(v * 100) / 100; }

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return round2(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function pct(n: number, total: number): string {
  return ((n / total) * 100).toFixed(1) + '%';
}

function bar(count: number, total: number, width = 30): string {
  const filled = Math.round((count / total) * width);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

function histoBucket(v: number, buckets: number[]): number {
  for (let i = 0; i < buckets.length - 1; i++) {
    if (v <= buckets[i + 1]) return i;
  }
  return buckets.length - 2;
}

// ─── Confidence formula (mirrors indicator-engine.ts exactly) ──────────────

function computeConfidence(topScore: number): number {
  if (topScore >= 14) return 95;
  if (topScore >= 11) return 90;
  if (topScore >= 8) return 85;
  return 80;
}

// ─── Run one configuration ─────────────────────────────────────────────────

interface ScanRecord {
  direction: string;
  noTradeReason?: string;
  bullPts: number;
  bearPts: number;
  topScore: number;
  diff: number;
  confirmations: number;
  confidence: number;
  rsi: number;
  smaStatus: string;
  stochBias: string;
  superTrend: string;
  wickBias: string;
  superTrendStrength: string;
}

function runSimulation(config: GateConfig | null, iterations: number): ScanRecord[] {
  const BASE_MINUTE = Math.floor(Date.now() / 60000);
  const CANDLE_COUNT = 61;
  const records: ScanRecord[] = [];

  for (let i = 0; i < iterations; i++) {
    const pair = PAIRS[i % PAIRS.length];
    const baseMinute = BASE_MINUTE - i * 3;
    const candles = generateCandles(pair, baseMinute, CANDLE_COUNT);
    const result = analyzeCandles(candles);

    const bullPts = result.bullScore;
    const bearPts = result.bearScore;
    const topScore = Math.max(bullPts, bearPts);
    const diff = Math.abs(bullPts - bearPts);
    const hasCallPut = result.direction === 'CALL' || result.direction === 'PUT';
    const confidence = hasCallPut ? result.confidence : 0;

    // Determine direction from the gate (independent of analyzeCandles' own NO_TRADE)
    const q = evaluateQuality(bullPts, bearPts, result.confirmations, config);
    // Use independent confidence formula based on topScore (not result.confidence,
    // which would be 0 if analyzeCandles returned NO_TRADE despite the gate passing it)
    const finalConfidence = q.direction !== 'NO_TRADE' ? computeConfidence(topScore) : 0;
    records.push({
      direction: q.direction,
      noTradeReason: q.noTradeReason,
      bullPts,
      bearPts,
      topScore,
      diff,
      confirmations: result.confirmations,
      confidence: finalConfidence,
      rsi: result.rsi,
      smaStatus: result.smaStatus,
      stochBias: result.stochBias,
      superTrend: result.superTrend,
      wickBias: result.wickBias,
      superTrendStrength: result.superTrendStrength,
    });
  }

  return records;
}

// ─── Report generators ─────────────────────────────────────────────────────

function printHistogram(data: number[], label: string, buckets: number[], bucketLabels: string[]): void {
  const total = data.length;
  const counts = new Array(buckets.length - 1).fill(0);
  for (const v of data) {
    const idx = histoBucket(v, buckets);
    if (idx >= 0 && idx < counts.length) counts[idx]++;
  }
  console.log(`  ${label}:`);
  for (let i = 0; i < counts.length; i++) {
    const p = (counts[i] / total * 100).toFixed(1);
    console.log(`    ${bucketLabels[i]}: ${counts[i]} (${p}%) ${bar(counts[i], total)}`);
  }
  console.log(`    Average: ${avg(data)}`);
}

function printDistribution(records: ScanRecord[], configName: string): void {
  const total = records.length;
  const calls = records.filter(r => r.direction === 'CALL').length;
  const puts = records.filter(r => r.direction === 'PUT').length;
  const noTrades = records.filter(r => r.direction === 'NO_TRADE').length;

  console.log(`─── ${configName}: CALL / PUT / NO_TRADE ───`);
  console.log(`  CALL:     ${calls} (${pct(calls, total)})`);
  console.log(`  PUT:      ${puts} (${pct(puts, total)})`);
  console.log(`  NO_TRADE: ${noTrades} (${pct(noTrades, total)})`);
  console.log(`  Total:    ${total}`);
  console.log('');
}

function printTriggerAnalysis(records: ScanRecord[], configName: string): void {
  const noTrades = records.filter(r => r.direction === 'NO_TRADE');
  if (noTrades.length === 0) return;

  const reasons: Record<string, number> = {};
  for (const r of noTrades) {
    const reason = r.noTradeReason || 'Unknown';
    reasons[reason] = (reasons[reason] || 0) + 1;
  }

  console.log(`─── ${configName}: NO_TRADE Trigger Analysis ───`);
  const sorted = Object.entries(reasons).sort(([, a], [, b]) => b - a);
  for (const [reason, count] of sorted) {
    console.log(`  ${reason}: ${count} (${pct(count, noTrades.length)})`);
  }
  console.log('');
}

function printScoreHistograms(records: ScanRecord[], configName: string): void {
  console.log(`─── ${configName}: Score Distributions ───`);

  printHistogram(
    records.map(r => r.bullPts),
    'Bull Score', [0, 3, 5, 7, 9, 11, 13, 17],
    ['0-2', '3-4', '5-6', '7-8', '9-10', '11-12', '13+']
  );

  printHistogram(
    records.map(r => r.bearPts),
    'Bear Score', [0, 3, 5, 7, 9, 11, 13, 17],
    ['0-2', '3-4', '5-6', '7-8', '9-10', '11-12', '13+']
  );

  printHistogram(
    records.map(r => r.diff),
    'Score Difference', [0, 2, 4, 6, 8, 11, 17],
    ['0-1', '2-3', '4-5', '6-7', '8-10', '11+']
  );

  const allConf = records.filter(r => r.direction !== 'NO_TRADE').map(r => r.confidence);
  if (allConf.length > 0) {
    printHistogram(
      allConf,
      'Confidence (CALL/PUT only)', [0, 80, 85, 90, 95, 100],
      ['<80', '80', '85', '90', '95']
    );
  }

  printHistogram(
    records.map(r => r.confirmations),
    'Confirmations (all)', [0, 1, 2, 3, 4, 5, 7],
    ['0', '1', '2', '3', '4', '5-6']
  );

  console.log('');
}

function printIndicatorAgreement(records: ScanRecord[], configName: string): void {
  const trades = records.filter(r => r.direction === 'CALL' || r.direction === 'PUT');
  if (trades.length === 0) {
    console.log(`─── ${configName}: No CALL/PUT signals to analyze ───\n`);
    return;
  }

  const calls = trades.filter(r => r.direction === 'CALL');
  const puts = trades.filter(r => r.direction === 'PUT');

  // EMA agreement: for CALL, SMA20 > EMA50; for PUT, SMA20 < EMA50
  const emaAgreeCALL = calls.filter(r => r.smaStatus.includes('>')).length;
  const emaAgreePUT = puts.filter(r => r.smaStatus.includes('<')).length;
  const emaDisagreeCALL = calls.length - emaAgreeCALL;
  const emaDisagreePUT = puts.length - emaAgreePUT;

  // SuperTrend agreement
  const stAgreeCALL = calls.filter(r => r.superTrend === 'BULLISH').length;
  const stAgreePUT = puts.filter(r => r.superTrend === 'BEARISH').length;

  // Stochastic agreement
  const stochAgreeCALL = calls.filter(r =>
    r.stochBias.includes('BULL') || r.stochBias.includes('OVERSOLD')
  ).length;
  const stochAgreePUT = puts.filter(r =>
    r.stochBias.includes('BEAR') || r.stochBias.includes('OVERBOUGHT')
  ).length;

  // Wick agreement
  const wickAgreeCALL = calls.filter(r => r.wickBias === 'BULLISH').length;
  const wickAgreePUT = puts.filter(r => r.wickBias === 'BEARISH').length;

  console.log(`─── ${configName}: Indicator Agreement (CALL/PUT only) ───`);
  console.log(`  Total CALL: ${calls.length}, Total PUT: ${puts.length}`);
  console.log(`  Average RSI:   CALL=${avg(calls.map(r => r.rsi))}  PUT=${avg(puts.map(r => r.rsi))}`);
  console.log(`  Average conf:  CALL=${avg(calls.map(r => r.confidence))}  PUT=${avg(puts.map(r => r.confidence))}`);
  console.log(`  Avg confirm:   CALL=${avg(calls.map(r => r.confirmations))}  PUT=${avg(puts.map(r => r.confirmations))}`);
  console.log(`  Avg topScore:  CALL=${avg(calls.map(r => r.topScore))}  PUT=${avg(puts.map(r => r.topScore))}`);
  console.log(`  Avg diff:      CALL=${avg(calls.map(r => r.diff))}  PUT=${avg(puts.map(r => r.diff))}`);
  console.log('');
  console.log(`  EMA agreement:`);
  console.log(`    CALL SMA20>EMA50: ${emaAgreeCALL}/${calls.length} (${pct(emaAgreeCALL, calls.length)})`);
  console.log(`    PUT  SMA20<EMA50: ${emaAgreePUT}/${puts.length} (${pct(emaAgreePUT, puts.length)})`);
  console.log(`  SuperTrend agreement:`);
  console.log(`    CALL BULLISH:     ${stAgreeCALL}/${calls.length} (${pct(stAgreeCALL, calls.length)})`);
  console.log(`    PUT  BEARISH:     ${stAgreePUT}/${puts.length} (${pct(stAgreePUT, puts.length)})`);
  console.log(`  Stochastic agreement:`);
  console.log(`    CALL bull bias:   ${stochAgreeCALL}/${calls.length} (${pct(stochAgreeCALL, calls.length)})`);
  console.log(`    PUT  bear bias:   ${stochAgreePUT}/${puts.length} (${pct(stochAgreePUT, puts.length)})`);
  console.log(`  Wick agreement:`);
  console.log(`    CALL BULLISH:     ${wickAgreeCALL}/${calls.length} (${pct(wickAgreeCALL, calls.length)})`);
  console.log(`    PUT  BEARISH:     ${wickAgreePUT}/${puts.length} (${pct(wickAgreePUT, puts.length)})`);
  console.log('');
}

function printConfidenceComparison(
  baselineNoGate: ScanRecord[],
  baselineGate: ScanRecord[]
): void {
  const bgCalls = baselineNoGate.filter(r => r.direction === 'CALL' || r.direction === 'PUT');
  const gCalls = baselineGate.filter(r => r.direction === 'CALL' || r.direction === 'PUT');

  console.log('─── Confidence Comparison: Phase 21 (no gate) vs Phase 21.6B (baseline) ───');
  console.log(`  Phase 21 (no gate, all scans produce CALL/PUT):`);
  console.log(`    CALL count: ${baselineNoGate.filter(r => r.direction === 'CALL').length}`);
  console.log(`    PUT  count: ${baselineNoGate.filter(r => r.direction === 'PUT').length}`);
  console.log(`    Avg confidence: ${avg(bgCalls.map(r => r.confidence))}`);
  console.log(`  Phase 21.6B (with gate, only quality signals pass):`);
  console.log(`    CALL count: ${baselineGate.filter(r => r.direction === 'CALL').length}`);
  console.log(`    PUT  count: ${baselineGate.filter(r => r.direction === 'PUT').length}`);
  console.log(`    Avg confidence: ${avg(gCalls.map(r => r.confidence))}`);

  const bgConf = avg(bgCalls.map(r => r.confidence));
  const gConf = avg(gCalls.map(r => r.confidence));
  const diff = round2(gConf - bgConf);
  const dir = diff >= 0 ? 'increased' : 'decreased';
  console.log(`  Change: ${dir} by ${Math.abs(diff)} points`);
  console.log('');
}

function printSensitivityTable(allResults: Map<string, ScanRecord[]>): void {
  console.log('─── Threshold Sensitivity Table ───');
  console.log('  Config     | CALL %   | PUT %    | NO_TRADE % | Avg Conf (C/P)');
  console.log('  ' + '─'.repeat(65));

  for (const [name, records] of allResults) {
    const total = records.length;
    const calls = records.filter(r => r.direction === 'CALL').length;
    const puts = records.filter(r => r.direction === 'PUT').length;
    const noTrades = records.filter(r => r.direction === 'NO_TRADE').length;
    const trades = records.filter(r => r.direction === 'CALL' || r.direction === 'PUT');
    const avgConf = avg(trades.map(r => r.confidence));
    console.log(
      `  ${name.padEnd(11)}| ${pct(calls, total).padStart(7)} | ${pct(puts, total).padStart(7)} | ${pct(noTrades, total).padStart(9)} | ${avgConf}`
    );
  }
  console.log('');
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const ITERATIONS = 2400;

  console.log('Phase 21.6C — Signal Quality Calibration Verification');
  console.log('='.repeat(70));
  console.log(`Iterations: ${ITERATIONS} across ${PAIRS.length} OTC pairs`);
  console.log(`Candles per scan: 61 (1h lookback)`);
  console.log('');

  const startTime = Date.now();

  // Run all configurations
  const allResults = new Map<string, ScanRecord[]>();

  // 1. Phase 21 baseline (no gate) — for confidence comparison
  console.log('>>> Running Phase 21 baseline (no NO_TRADE gate)...');
  const noGate = runSimulation(null, ITERATIONS);
  allResults.set('NO_GATE', noGate);
  printDistribution(noGate, 'NO_GATE');
  console.log('');

  // 2-4. Run each gate config
  for (const config of CONFIGS) {
    console.log(`>>> Running ${config.name} (${config.desc})...`);
    const records = runSimulation(config, ITERATIONS);
    allResults.set(config.name, records);
    printDistribution(records, config.name);
    printTriggerAnalysis(records, config.name);
    printScoreHistograms(records, config.name);
    printIndicatorAgreement(records, config.name);
  }

  // 5. Confidence comparison: Phase 21 vs Phase 21.6B baseline
  const noGateRecords = allResults.get('NO_GATE')!;
  const baselineRecords = allResults.get('BASELINE')!;
  printConfidenceComparison(noGateRecords, baselineRecords);

  // 6. Sensitivity table (all configurations)
  printSensitivityTable(allResults);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Total time: ${elapsed}s`);
  console.log('');
  console.log('Done.');
}

main().catch(console.error);
