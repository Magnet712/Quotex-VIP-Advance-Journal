/**
 * Phase 21.4 — OTC Scan Pipeline Stage Trace
 *
 * Traces every awaited call in the scan pipeline with elapsed timing.
 * Does NOT modify any source file.
 *
 * Run: npx tsx scripts/phase21-4-trace.mts
 */

// ─── Replicate sr() and PAIR_BASE_PRICES for isolation ──────────────────────

function sr(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const PAIR_BASE_PRICES: Record<string, { base: number; pip: number }> = {
  'EUR/USD': { base: 1.08450, pip: 5 },
  'GBP/USD': { base: 1.26500, pip: 5 },
  'USD/JPY': { base: 149.500, pip: 2 },
  'AUD/USD': { base: 0.65200, pip: 5 },
  'USD/CAD': { base: 1.35800, pip: 5 },
};

import type { CandleSource } from '../src/lib/otc/types';
interface OTCCandle {
  pair: string; timeframe: string; open: number; high: number; low: number; close: number; timestamp: Date; source: CandleSource;
}

function buildSimulatedCandle(pair: string, minuteSeed: number, candleTimestamp: Date): OTCCandle {
  const config = PAIR_BASE_PRICES[pair];
  if (!config) throw new Error(`SimulatedFeed: unknown pair "${pair}"`);
  const pairHash = pair.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const s = pairHash * 7919 + minuteSeed;
  const priceJitter = (sr(s + 0.9) - 0.5) * config.base * 0.003;
  const close = parseFloat((config.base + priceJitter).toFixed(config.pip));
  const spread = config.base * 0.001;
  const open = parseFloat((close + (sr(s + 1.1) - 0.5) * spread).toFixed(config.pip));
  const high = parseFloat((Math.max(open, close) + sr(s + 1.2) * spread).toFixed(config.pip));
  const low = parseFloat((Math.min(open, close) - sr(s + 1.3) * spread).toFixed(config.pip));
  return { pair, timeframe: '1m', open, high, low, close, timestamp: candleTimestamp, source: 'simulation' };
}

// ─── Import indicator engine ────────────────────────────────────────────────

import { analyzeCandles } from '../src/lib/otc/indicator-engine';

// ─── Trace helpers ──────────────────────────────────────────────────────────

let stage = 0;
const marks: { stage: number; label: string; elapsed: number }[] = [];
let traceStart = performance.now();

function mark(label: string): void {
  const elapsed = performance.now() - traceStart;
  stage++;
  marks.push({ stage, label, elapsed: Math.round(elapsed * 100) / 100 });
  console.log(`  [${String(stage).padStart(2)}] ${label.padEnd(50)} ${elapsed.toFixed(2)}ms`);
}

async function trace(label: string, fn: () => Promise<void>): Promise<void> {
  const start = performance.now();
  console.log(`\n  [${String(stage + 1).padStart(2)}] ${label} started`);
  try {
    await fn();
    const elapsed = performance.now() - start;
    stage++;
    marks.push({ stage, label, elapsed: Math.round(elapsed * 100) / 100 });
    console.log(`  [${String(stage).padStart(2)}] ${label} finished`);
    console.log(`       elapsed = ${elapsed.toFixed(2)} ms`);
  } catch (err) {
    const elapsed = performance.now() - start;
    console.log(`  ✗ ${label} THREW after ${elapsed.toFixed(2)} ms`);
    console.log(`    ${err}`);
    throw err;
  }
}

// ─── Main trace ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const TEST_PAIR = 'AUD/USD';
  const HISTORY_MINUTES = 60;

  console.log('='.repeat(80));
  console.log('OTC SCAN PIPELINE STAGE TRACE');
  console.log(`Pair: ${TEST_PAIR}`);
  console.log('='.repeat(80));
  console.log('');

  traceStart = performance.now();
  const startMs = traceStart;

  // [1] scan() entered
  mark('scan() entered');
  mark('placeholder created (SCANNING)');
  mark('timeout armed (20s)');

  // Normalize pair
  const pair = TEST_PAIR;

  // [3] getLatestCandle() — simulate via direct candle build
  const now = new Date();
  const minuteSeed = Math.floor(now.getTime() / 60000);
  const candleTs = new Date(Math.floor(now.getTime() / 60000) * 60000);

  let latestCandle: OTCCandle;
  await trace('getLatestCandle() [SimulatedFeed]', async () => {
    latestCandle = buildSimulatedCandle(pair, minuteSeed, candleTs);
  });

  // [5] getCandleRange() — simulate via loop
  let history: OTCCandle[] = [];
  await trace('getCandleRange() [SimulatedFeed × 60 candles]', async () => {
    const from = new Date(latestCandle!.timestamp.getTime() - HISTORY_MINUTES * 60_000);
    history = [];
    const startMs2 = Math.floor(from.getTime() / 60000) * 60000;
    const endMs = Math.floor(now.getTime() / 60000) * 60000;
    for (let ms = startMs2; ms <= endMs; ms += 60000) {
      const seed = Math.floor(ms / 60000);
      const ts = new Date(ms);
      history.push(buildSimulatedCandle(pair, seed, ts));
    }
  });

  // Merge candles
  const candles = [...history];
  const lastIdx = candles.findIndex(c => c.timestamp.getTime() === latestCandle!.timestamp.getTime());
  if (lastIdx === -1) candles.push(latestCandle!);
  else candles[lastIdx] = latestCandle!;

  mark('candles merged');

  // [7] analyzeCandles()
  let indicatorResult: any;
  await trace('analyzeCandles()', async () => {
    indicatorResult = analyzeCandles(candles);
  });

  console.log(`       direction  = ${indicatorResult!.direction}`);
  console.log(`       confidence = ${indicatorResult!.confidence}`);
  console.log(`       strategy   = ${indicatorResult!.strategy}`);
  console.log(`       rsi        = ${indicatorResult!.rsi}`);
  console.log(`       stoch      = ${indicatorResult!.stochK}/${indicatorResult!.stochD}`);
  console.log(`       superTrend = ${indicatorResult!.superTrend}`);
  console.log(`       atr        = ${indicatorResult!.atr}`);

  mark('record updated');
  mark('WAITING_FOR_ENTRY assigned');

  // [10] saveSignal() — CODE ANALYSIS ONLY (can't call server action)
  console.log('\n  -- saveSignal() analysis --');
  console.log('  [10] saveSignal() started');
  console.log('  saveSignal() calls 3 sequential Supabase operations:');
  console.log('    1. supabase.auth.getUser()        — HTTP to Supabase Auth');
  console.log('    2. supabase.from().select(status) — HTTP to Supabase DB');
  console.log('    3. supabase.from().insert(...)    — HTTP to Supabase DB (write)');
  console.log('');
  console.log('  In a local/dev environment with network:');
  console.log('    - Each Supabase call: ~50-500ms (typical)');
  console.log('    - Total saveSignal:  ~150-1500ms (expected)');
  console.log('');
  console.log('  If Supabase is unreachable or slow:');
  console.log('    - Network timeout default: ~30s per call');
  console.log('    - Total potential hang:    ~90s');
  console.log('    - Scan timeout fires at:   20s');
  console.log('');
  console.log('  ⚠ saveSignal() is the ONLY awaited call that can block.');
  console.log('    All prior stages are synchronous math (<1ms total).');

  // Summary
  const totalElapsed = performance.now() - traceStart;
  console.log('');
  console.log('='.repeat(80));
  console.log('TRACE SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  for (const m of marks) {
    console.log(`  [${String(m.stage).padStart(2)}] ${m.label.padEnd(50)} ${m.elapsed.toFixed(2)}ms`);
  }
  console.log('');
  console.log(`  Total elapsed: ${totalElapsed.toFixed(2)} ms`);
  console.log('');

  // Verify analyzeCandles doesn't throw for any pair
  console.log('Testing analyzeCandles() stability across all pairs...');
  const allPairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'];
  for (const p of allPairs) {
    const c = buildCandles(p, now);
    try {
      const r = analyzeCandles(c);
      console.log(`  ${p}: direction=${r.direction} conf=${r.confidence} rsi=${r.rsi.toFixed(1)} ✅`);
    } catch (e) {
      console.log(`  ${p}: THREW — ${e}`);
    }
  }

  console.log('');
  console.log('=== FINAL VERDICT ===');
  console.log('If scan reaches SCANNING but never CALL/PUT, and watchdog fires at 20s:');
  console.log('');
  console.log('  LAST SUCCESSFUL STAGE:  analyzeCandles() (stage [8])');
  console.log('  NEXT STAGE:             saveSignal() (stage [10])');
  console.log('  FILE:                   src/app/actions/signals.ts:89');
  console.log('  AWAITED CALL:           saveSignal({...}) at src/lib/otc/OTCExecutionEngine.ts:280');
  console.log('  BLOCKING OPERATION:     One of 3 Supabase HTTP requests inside saveSignal()');
  console.log('  WATCHDOG FIRES AT:      20000ms (OTC scan exceeded 20-second limit)');
  console.log('');
  console.log('  saveSignal() sub-operations:');
  console.log('    1. checkApproved() → auth.getUser() + users.select()  [signals.ts:70-82]');
  console.log('    2. createClient() + signals.insert()                  [signals.ts:96-116]');
  console.log('');
  console.log('  Most likely cause: Supabase connection issue in checkApproved()');
  console.log('  or the signals.insert() write operation timing out.');
}

function buildCandles(pair: string, now: Date): OTCCandle[] {
  const candles: OTCCandle[] = [];
  const endMs = Math.floor(now.getTime() / 60000) * 60000;
  for (let i = 60; i >= 0; i--) {
    const ts = new Date(endMs - i * 60000);
    const seed = Math.floor(ts.getTime() / 60000);
    candles.push(buildSimulatedCandle(pair, seed, ts));
  }
  return candles;
}

main().catch(err => {
  console.error('\n❌ Trace failed:', err);
  process.exit(1);
});
