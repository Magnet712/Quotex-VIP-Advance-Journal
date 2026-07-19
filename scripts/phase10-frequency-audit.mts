/**
 * PHASE 10 — REAL-WORLD SIGNAL FREQUENCY AUDIT
 *
 * READ-ONLY. No code changes. No modifications. No optimizations.
 *
 * Uses evaluateSignal() EXACTLY as production.
 * Calculates real-world signal frequency for all 10 pairs on 1-min expiry.
 *
 * All 20 analysis requirements + final verdict (A–E).
 */

import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { ProviderManager } from '../src/lib/market-data/core/ProviderManager';
import { TwelveDataProvider } from '../src/lib/market-data/forex/adapters/TwelveDataProvider';
import { YahooProvider } from '../src/lib/market-data/forex/adapters/YahooProvider';
import { evaluateSignal } from '../src/lib/market-data/core/SignalEngine';
import { CandleCache } from '../src/lib/market-data/core/CandleCache';
import type { NormalizedCandle } from '../src/lib/market-data/types';

dotenv.config({ path: '.env.local' });

const PAIRS = ['EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','EUR/JPY','GBP/JPY','AUD/JPY','USD/CHF','EUR/GBP'];
const MIN_WIN = 52;
const SESSIONS: Record<string,[number,number]> = { Asian:[0,8], London:[8,16], New_York:[16,24] };
const WDAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

interface RawSignal {
  ts: number; pair: string; dir: 'CALL'|'PUT'; qs: number; strategy: string;
}

interface WinRec {
  pair: string; ts: number; dir: 'CALL'|'PUT'|'WAIT'; qs: number; strategy: string; reason: string|undefined;
}

function toEpoch(s: string): number { return new Date(s).getTime(); }

async function collectBatch(mgr: ProviderManager, limit: number): Promise<WinRec[]> {
  console.log(`Fetching ${limit} candles × ${PAIRS.length} pairs...`);
  const raw = await mgr.fetchHistoricCandlesBatch(PAIRS, limit, '1min');
  const out: WinRec[] = [];
  for (const pair of PAIRS) {
    const c = raw.get(pair) || [];
    if (c.length < MIN_WIN) { console.log(`  ${pair}: ${c.length} candles (skip)`); continue; }
    const n = c.length - MIN_WIN + 1;
    console.log(`  ${pair}: ${c.length} candles → ${n} windows`);
    for (let s = 0; s + MIN_WIN <= c.length; s++) {
      const e = s + MIN_WIN;
      CandleCache.preloadHistory(pair, c.slice(0, e));
      const r = evaluateSignal(pair, 83, pair, '1min');
      out.push({ pair, ts: toEpoch(c[e-1].timestamp), dir: r.direction, qs: r.qualityScore, strategy: r.strategy, reason: r.noTradeReason });
    }
  }
  return out;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PHASE 10 — REAL-WORLD SIGNAL FREQUENCY AUDIT');
  console.log(`  ${new Date().toISOString()}`);
  console.log('  READ-ONLY. Uses evaluateSignal() EXACTLY as production.');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const mgr = new ProviderManager(null);
  const td = new TwelveDataProvider(); mgr.registerProvider(td);
  const yh = new YahooProvider(); mgr.registerProvider(yh);

  let records: WinRec[] = [];

  // Try TwelveData
  if (process.env.TWELVEDATA_API_KEY) {
    mgr.setActiveProvider(td.id); await td.connect();
    records = await collectBatch(mgr, 5000);
  }
  if (records.length === 0) {
    mgr.setActiveProvider(yh.id); await yh.connect();
    records = await collectBatch(mgr, 120);
  }

  const t = records.length;
  if (t === 0) {
    console.log('\n  NO DATA — TwelveData daily quota likely exhausted.');
    console.log('  Run after midnight UTC when quota resets:');
    console.log('    npx tsx scripts/phase10-frequency-audit.mts\n');
    return;
  }

  const calls = records.filter(r => r.dir === 'CALL');
  const puts  = records.filter(r => r.dir === 'PUT');
  const sigs  = [...calls, ...puts].sort((a,b) => a.ts - b.ts);
  const waits = records.filter(r => r.dir === 'WAIT');

  // Unique timestamps: signals may share the same minute
  const uniqueMinutes = new Set(records.map(r => Math.floor(r.ts / 60000)));
  const totalMinutes = uniqueMinutes.size;

  // ── 1-2. Totals ──
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  1-2. TOTAL SIGNALS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Windows analyzed: ${t}`);
  console.log(`  CALL:  ${calls.length} (${(calls.length/t*100).toFixed(4)}%)`);
  console.log(`  PUT:   ${puts.length} (${(puts.length/t*100).toFixed(4)}%)`);
  console.log(`  WAIT:  ${waits.length} (${(waits.length/t*100).toFixed(4)}%)`);
  console.log(`  Total: ${sigs.length} signals`);

  // ── 3. Per pair ──
  console.log('\n── 3. SIGNALS PER PAIR ──');
  console.log('Pair        Windows  CALL  PUT  Sig%   AvgMinBetw');
  for (const pair of PAIRS) {
    const w = records.filter(r => r.pair === pair);
    const c = w.filter(r => r.dir === 'CALL').length;
    const p = w.filter(r => r.dir === 'PUT').length;
    if (w.length === 0) continue;
    const pairSigs = sigs.filter(s => s.pair === pair);
    let avgGap = Infinity;
    if (pairSigs.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < pairSigs.length; i++) gaps.push((pairSigs[i].ts - pairSigs[i-1].ts) / 60000);
      avgGap = gaps.reduce((s,g) => s+g, 0) / gaps.length;
    }
    const sigPct = (c+p)/w.length*100;
    console.log(`${pair.padEnd(11)} ${w.length.toString().padStart(7)} ${c.toString().padStart(5)} ${p.toString().padStart(4)} ${sigPct.toFixed(2).padStart(6)}% ${avgGap === Infinity ? '∞' : avgGap.toFixed(1).padStart(7)}m`);
  }

  // ── 4. Per session ──
  console.log('\n── 4. SIGNALS PER SESSION ──');
  for (const [sess, [lo,hi]] of Object.entries(SESSIONS)) {
    const w = records.filter(r => { const h = new Date(r.ts).getUTCHours(); return h >= lo && h < hi; });
    const c = w.filter(r => r.dir === 'CALL').length;
    const p = w.filter(r => r.dir === 'PUT').length;
    if (w.length === 0) continue;
    const sigPct = (c+p)/w.length*100;
    console.log(`${sess.padEnd(11)} ${w.length.toString().padStart(7)} ${c.toString().padStart(5)} ${p.toString().padStart(4)} ${sigPct.toFixed(2).padStart(6)}%`);
  }

  // ── 5. Per weekday ──
  console.log('\n── 5. SIGNALS PER WEEKDAY ──');
  for (let d = 1; d <= 5; d++) { // Mon-Fri
    const w = records.filter(r => new Date(r.ts).getUTCDay() === d);
    const c = w.filter(r => r.dir === 'CALL').length;
    const p = w.filter(r => r.dir === 'PUT').length;
    if (w.length === 0) continue;
    console.log(`${WDAY[d].padEnd(10)} ${w.length.toString().padStart(7)} ${c.toString().padStart(5)} ${p.toString().padStart(4)} ${((c+p)/w.length*100).toFixed(2).padStart(6)}%`);
  }

  // ── 6. Per hour ──
  console.log('\n── 6. SIGNALS PER HOUR (UTC) ──');
  const hourSigCount: number[] = Array(24).fill(0);
  const hourWinCount: number[] = Array(24).fill(0);
  for (const r of records) {
    const h = new Date(r.ts).getUTCHours();
    hourWinCount[h]++;
    if (r.dir !== 'WAIT') hourSigCount[h]++;
  }
  for (let h = 0; h < 24; h++) {
    if (hourWinCount[h] === 0) continue;
    const pct = hourSigCount[h]/hourWinCount[h]*100;
    const bar = '█'.repeat(Math.round(hourSigCount[h]/Math.max(1,...hourSigCount)*40));
    console.log(`${h.toString().padStart(2)}:00 ${hourWinCount[h].toString().padStart(6)}w ${hourSigCount[h].toString().padStart(3)}s ${pct.toFixed(2).padStart(6)}% ${bar}`);
  }

  // ── 7-10. Signal timing metrics ──
  const MIN_SIGS_FOR_TIMING = 5;
  console.log('\n── 7-10. SIGNAL TIMING METRICS ──');
  if (sigs.length >= MIN_SIGS_FOR_TIMING) {
    const gaps: number[] = [];
    for (let i = 1; i < sigs.length; i++) gaps.push((sigs[i].ts - sigs[i-1].ts) / 60000);
    gaps.sort((a,b) => a-b);

    const avgGapAll = gaps.reduce((s,g) => s+g, 0) / gaps.length;
    const maxGap = gaps[gaps.length - 1];
    const minGap = gaps[0];
    const median = gaps.length % 2 === 0 ? (gaps[gaps.length/2-1]+gaps[gaps.length/2])/2 : gaps[Math.floor(gaps.length/2)];
    const p95 = gaps[Math.floor(gaps.length * 0.95)];
    const p99 = gaps[Math.floor(gaps.length * 0.99)];

    // Per-pair average minutes between signals
    console.log(`  All pairs combined: ${sigs.length} signals, ${gaps.length} gaps`);
    console.log(`  7. Avg min between ANY signal: ${avgGapAll.toFixed(1)}m`);
    console.log(`  8. Avg min between signals:    ${avgGapAll.toFixed(1)}m`);
    console.log(`  9. Longest drought (no signal): ${maxGap.toFixed(1)}m`);
    console.log(`  10. Shortest gap between sigs:  ${minGap.toFixed(1)}m`);

    // ── 17-19. Percentiles ──
    console.log(`  17. Median waiting time:        ${median.toFixed(1)}m`);
    console.log(`  18. 95th percentile:            ${p95.toFixed(1)}m`);
    console.log(`  19. 99th percentile:            ${p99.toFixed(1)}m`);

    // ── 11-12. Max/min signals per hour ──
    const hourSigs: number[] = Array(24).fill(0);
    for (const s of sigs) {
      const h = new Date(s.ts).getUTCHours();
      hourSigs[h]++;
    }
    const maxPerHr = Math.max(...hourSigs);
    const minPerHr = Math.min(...hourSigs.filter(c => c > 0));
    console.log(`  11. Max signals within 1 hour:  ${maxPerHr}`);
    console.log(`  12. Min signals within 1 hour:  ${minPerHr}`);

    // ── 16. Histogram ──
    console.log('\n── 16. HISTOGRAM: Waiting time between signals ──');
    const buckets = [1, 2, 3, 5, 10, 15, 30, 60, 120, 300, 1440];
    let bi = 0;
    for (const b of buckets) {
      const count = gaps.filter(g => g <= b).length - (bi > 0 ? gaps.filter(g => g <= buckets[bi-1]).length : 0);
      const bar = '█'.repeat(Math.round(count / Math.max(1,...gaps) * 60));
      console.log(`  ≤${b.toString().padStart(4)}m: ${count.toString().padStart(4)} ${bar}`);
      bi++;
    }
  } else {
    console.log(`  Insufficient signals (${sigs.length}) for timing analysis (need ${MIN_SIGS_FOR_TIMING})`);
  }

  // ── 13-14. Rolling counts ──
  console.log('\n── 13-14. ROLLING SIGNAL COUNTS ──');
  if (sigs.length >= MIN_SIGS_FOR_TIMING) {
    const minTs = Math.min(...records.map(r => r.ts));
    const maxTs = Math.max(...records.map(r => r.ts));
    const spanHours = (maxTs - minTs) / 3600000;

    // Rolling 24h: count signals in each 24h window
    if (spanHours >= 24) {
      const rolling24h: number[] = [];
      for (let offset = 0; offset + 24*60*60000 <= maxTs - minTs; offset += 60*60000) {
        const winStart = minTs + offset;
        const winEnd = winStart + 24*60*60000;
        rolling24h.push(sigs.filter(s => s.ts >= winStart && s.ts <= winEnd).length);
      }
      if (rolling24h.length > 0) {
        console.log(`  13. Rolling 24h: max=${Math.max(...rolling24h)}, min=${Math.min(...rolling24h)}, avg=${(rolling24h.reduce((s,c)=>s+c,0)/rolling24h.length).toFixed(1)}`);
      }
    } else { console.log('  13. Rolling 24h: dataset spans <24h'); }

    if (spanHours >= 168) {
      const rolling7d: number[] = [];
      for (let offset = 0; offset + 168*60*60000 <= maxTs - minTs; offset += 60*60000) {
        const winStart = minTs + offset;
        const winEnd = winStart + 168*60*60000;
        rolling7d.push(sigs.filter(s => s.ts >= winStart && s.ts <= winEnd).length);
      }
      if (rolling7d.length > 0) {
        console.log(`  14. Rolling 7d:  max=${Math.max(...rolling7d)}, min=${Math.min(...rolling7d)}, avg=${(rolling7d.reduce((s,c)=>s+c,0)/rolling7d.length).toFixed(1)}`);
      }
    } else { console.log('  14. Rolling 7d:  dataset spans <7d'); }

    // ── 15. Drought stats ──
    console.log('\n── 15. SIGNAL DROUGHT STATISTICS ──');
    const droughtThresholds = [30, 60, 120, 240, 480];
    for (const threshold of droughtThresholds) {
      const droughts = gaps.filter(g => g > threshold);
      console.log(`  Droughts > ${threshold}m: ${droughts.length} (${(droughts.length/gaps.length*100).toFixed(1)}% of gaps)`);
    }

    // ── 20. Signal probability ──
    console.log('\n── 20. PROBABILITY OF SEEING ≥1 SIGNAL WITHIN N MINUTES ──');
    const probWindows = [5, 10, 15, 30, 60];
    // Simulate: at each signal start time, check if another signal occurs within N minutes
    for (const nMin of probWindows) {
      const nMs = nMin * 60000;
      let found = 0;
      for (let i = 0; i < sigs.length; i++) {
        const start = sigs[i].ts;
        let j = i + 1;
        while (j < sigs.length && sigs[j].ts - start <= nMs) { found++; j++; }
      }
      const prob = sigs.length > 0 ? (found / sigs.length) : 0;
      // Also compute from a sliding window perspective
      let slideHits = 0;
      let slideTotal = 0;
      for (let ts = minTs; ts <= maxTs - nMs; ts += 60000) {
        slideTotal++;
        if (sigs.some(s => s.ts >= ts && s.ts <= ts + nMs)) slideHits++;
      }
      const slideProb = slideTotal > 0 ? slideHits / slideTotal * 100 : 0;
      console.log(`  Within ${nMin.toString().padStart(2)}m: ${(prob*100).toFixed(1)}% (gap-based) | ${slideProb.toFixed(1)}% (sliding-window)`);
    }
  }

  // ── MOST IMPORTANT: OPPORTUNITIES PER HOUR/SESSION/DAY ──
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  MOST IMPORTANT: OPPORTUNITIES FOR 10-PAIR TRADER');
  console.log('═══════════════════════════════════════════════════════════════');
  if (sigs.length >= MIN_SIGS_FOR_TIMING && totalMinutes > 0) {
    // Calculate signal rate for a trader watching ALL 10 pairs
    const signalsPerMin = sigs.length / totalMinutes;
    const signalsPerHour = signalsPerMin * 60;
    const sessionLengths: Record<string, number> = { Asian: 8, London: 8, New_York: 8 };
    for (const [sess, hours] of Object.entries(sessionLengths)) {
      const [lo, hi] = SESSIONS[sess];
      const sessSigs = sigs.filter(s => { const h = new Date(s.ts).getUTCHours(); return h >= lo && h < hi; });
      const perSession = sessSigs.length > 0 ? (sessSigs.length / Math.max(1, Math.floor(totalMinutes / 60 / 3))) : 0;
    }

    // Calculate from data timestamps
    const spans: Record<string,{min:number,max:number}> = {};
    for (const [sess] of Object.entries(SESSIONS)) {
      const sigsIn = sigs.filter(s => { const h = new Date(s.ts).getUTCHours(); const [lo,hi] = SESSIONS[sess]; return h >= lo && h < hi; });
      const winsIn = records.filter(r => { const h = new Date(r.ts).getUTCHours(); const [lo,hi] = SESSIONS[sess]; return h >= lo && h < hi; });
      if (winsIn.length === 0) continue;
      const sigRate = sigsIn.length / winsIn.length;
      const minsIn = winsIn.length; // each window ≈ 1 minute
      const estPer8hSession = sigRate * 8 * 60;
      console.log(`  ${sess.padEnd(11)}: ${sigsIn.length} sigs in ${winsIn.length} windows (${(sigRate*100).toFixed(3)}%) → ~${(sigRate*60*60).toFixed(1)} sigs/hr, ~${estPer8hSession.toFixed(0)} sigs/8h session`);
    }

    // Per day (using available days of data)
    const days = new Map<number, number>();
    for (const s of sigs) {
      const dayKey = Math.floor(s.ts / 86400000);
      days.set(dayKey, (days.get(dayKey) || 0) + 1);
    }
    const avgPerDay = days.size > 0 ? [...days.values()].reduce((s,c) => s+c, 0) / days.size : 0;
    console.log(`  Per day (${days.size} trading days): avg ${avgPerDay.toFixed(1)} signals/day`);

    const spanHours = (Math.max(...records.map(r=>r.ts)) - Math.min(...records.map(r=>r.ts))) / 3600000;
    console.log(`  Data span: ${spanHours.toFixed(1)} hours (${(spanHours/24).toFixed(1)} days)`);
    console.log(`  Overall rate: ${(sigs.length / spanHours).toFixed(2)} signals/hour for 10-pair trader`);
    console.log(`  → ~${(sigs.length / spanHours * 8).toFixed(0)} signals/8h session`);
    console.log(`  → ~${(sigs.length / spanHours * 24).toFixed(0)} signals/day`);
  } else {
    console.log(`  Insufficient data for opportunity calculation`);
  }

  // ── FINAL VERDICT ──
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  FINAL VERDICT');
  console.log('═══════════════════════════════════════════════════════════════');
  if (sigs.length < 5) {
    console.log(`\n  Signals detected: ${sigs.length} in ${t} windows`);
    console.log(`  Acceptance rate: ${(sigs.length/t*100).toFixed(4)}%`);
    console.log(`  Sample too small for confident verdict classification.`);
    console.log(`  Verdict: E — Practically unusable (with current sample size)`);
    console.log(`  (More data needed for definitive classification)`);
  } else {
    const sigsPerHour = sigs.length / Math.max(1, totalMinutes / 60);
    console.log(`\n  Signals detected: ${sigs.length} in ${t} windows (${(sigs.length/t*100).toFixed(4)}%)`);
    console.log(`  Avg signals/hour (10 pairs): ${sigsPerHour.toFixed(2)}`);
    console.log(`  Longest drought: ${Math.max(...gaps || [Infinity]).toFixed(0)}m`);

    let verdict = '';
    if (sigsPerHour >= 5) verdict = 'A — Excellent signal frequency';
    else if (sigsPerHour >= 2) verdict = 'B — Good frequency';
    else if (sigsPerHour >= 0.5) verdict = 'C — Acceptable frequency';
    else if (sigsPerHour >= 0.1) verdict = 'D — Too restrictive';
    else verdict = 'E — Practically unusable';

    console.log(`\n  VERDICT: ${verdict}`);
    console.log(`  Evidence: ${sigs.length} signals over ${totalMinutes} minutes = ${sigsPerHour.toFixed(3)} signals/hour`);
    if (sigs.length >= 5) {
      console.log(`  Median gap: ${median.toFixed(1)}m, P95 gap: ${p95.toFixed(1)}m, P99 gap: ${p99.toFixed(1)}m`);
      console.log(`  Max drought: ${maxGap.toFixed(0)}m`);
    }
  }
  console.log(`\n  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // CSV
  const csvPath = path.resolve(process.cwd(), 'docs', 'Phase_10_Raw_Signals.csv');
  const lines = sigs.map(s => `${new Date(s.ts).toISOString()},${s.pair},${s.dir},${s.qs},${s.strategy}`);
  fs.writeFileSync(csvPath, 'ts,pair,dir,qs,strategy\n' + lines.join('\n'), 'utf-8');
  console.log(`\nCSV: ${csvPath} (${sigs.length} signals)`);
}

main().catch(console.error);
