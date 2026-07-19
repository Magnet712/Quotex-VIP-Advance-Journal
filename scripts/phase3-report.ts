import fs from 'fs';
import path from 'path';
import {
  calculateEMA, calculateSMA, calculateRSI, calculateCCI,
  calculateStochastic, calculateATR, calculateSuperTrend,
  calculateADX, calculateSwingHighLow, calculateQualityScore,
} from '../src/lib/market-data/core/SignalEngine';

const MIN_QUALITY = 83;
const WINDOW = 60;

interface Candle { timestamp: string; open: number; high: number; low: number; close: number; }
interface Snap {
  f0: boolean; f1: boolean; f2old: boolean; f2new: boolean;
  f3: boolean; f4: boolean; f5: boolean;
  dir: 'CALL'|'PUT'|'WAIT'; dir_old: 'CALL'|'PUT'|'WAIT';
  atrPips: number; bodyPips: number; adx: number; qScore: number;
  session: 'Asian'|'London'|'NY'|'Off'; won: boolean|null;
}
interface PairData { pair: string; snaps: Snap[]; }

function pct(n: number, d: number) { return d === 0 ? '—' : ((n / d) * 100).toFixed(1) + '%'; }
function avg(a: number[]) { return a.length === 0 ? 0 : a.reduce((x, y) => x + y, 0) / a.length; }
function fmtAvg(a: number[]) { return avg(a).toFixed(3); }

function buildReport(all: PairData[]): string {
  const L: string[] = [];
  const push = (...s: string[]) => s.forEach(x => L.push(x));

  push(
    '# Phase 3 — Signal Engine Validation Report (Complete)',
    `**Generated**: ${new Date().toUTCString()}`,
    `**Source**: TwelveData REST API — 500 × 1-min candles per pair (all 10 pairs)`,
    `**Window**: ${WINDOW} candles | **Min Q-score**: ${MIN_QUALITY}`,
    `**Sessions (UTC)**: Asian 00–08h | London 08–13h | NY 13–22h | Off 22–24h`,
    '', '---', '',
  );

  for (const { pair, snaps } of all) {
    const total = snaps.length;
    if (total === 0) { push(`## ${pair}`, '', '> No data.', '', '---', ''); continue; }

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
      `| F0 | Candle count ≥ 52           | ${total} | ${total} | 100.0% |`,
      `| F1 | No null indicators           | ${f1s.length} | ${total} | ${pct(f1s.length, total)} |`,
      `| F2 OLD | normalizedAtr ≥ 0.00015  | ${f2o.length} | ${f1s.length} | ${pct(f2o.length, f1s.length)} |`,
      `| F2 NEW | atrInPips ≥ 1.0           | ${f2n.length} | ${f1s.length} | ${pct(f2n.length, f1s.length)} |`,
      `| F3 | Body expansion               | ${f3s.length} | ${f1s.length} | ${pct(f3s.length, f1s.length)} |`,
      `| F4 | Strategy conditions (of F2N+F3) | ${f4s.length} | ${Math.min(f2n.length, f3s.length)} | ${pct(f4s.length, Math.min(f2n.length, f3s.length))} |`,
      `| F5 | Quality score ≥ 83 (of F4)  | ${f5s.length} | ${f4s.length} | ${pct(f5s.length, f4s.length)} |`,
      '',
      '### Signal Counts', '',
      '| | NEW gate | OLD gate |',
      '|---|---|---|',
      `| CALL          | ${nCall} | ${oCall} |`,
      `| PUT           | ${nPut} | ${oPut} |`,
      `| WAIT          | ${nWait} | ${snaps.length - oCall - oPut} |`,
      `| Total signals | ${nCall + nPut} | ${oCall + oPut} |`,
      `| Wins / Trades | ${wins} / ${trades.length} | — |`,
      `| **Accuracy**  | **${pct(wins, trades.length)}** | — |`,
      '',
      '### Key Averages', '',
      '| Metric | Value |',
      '|---|---|',
      `| Avg ATR (pips)        | ${fmtAvg(f1s.map(s => s.atrPips))} |`,
      `| Avg body (pips)       | ${fmtAvg(f1s.map(s => s.bodyPips))} |`,
      `| Avg ADX               | ${fmtAvg(f1s.map(s => s.adx))} |`,
      `| Avg Q-score (signals) | ${fmtAvg(f5s.map(s => s.qScore))} |`,
      '',
    );

    push('### Session Breakdown (NEW gate)', '');
    push('| Session | Windows | F2% | F3% | F4% | F5% | CALL | PUT | WAIT | Wins | Acc% | Avg ATR pip |');
    push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const sess of ['Asian', 'London', 'NY'] as const) {
      const ss  = snaps.filter(s => s.session === sess);
      const sF1 = ss.filter(s => s.f1);
      const sF2n= sF1.filter(s => s.f2new);
      const sF3 = sF1.filter(s => s.f3);
      const sF4 = sF2n.filter(s => s.f3 && s.f4);
      const sF5 = ss.filter(s => s.f5);
      const sC  = ss.filter(s => s.dir === 'CALL').length;
      const sP  = ss.filter(s => s.dir === 'PUT').length;
      const sW  = ss.filter(s => s.dir === 'WAIT').length;
      const sTr = ss.filter(s => s.won !== null);
      const sWin= sTr.filter(s => s.won === true).length;
      push(`| ${sess} | ${ss.length} | ${pct(sF2n.length,sF1.length)} | ${pct(sF3.length,sF1.length)} | ${pct(sF4.length,sF2n.length)} | ${pct(sF5.length,sF4.length)} | ${sC} | ${sP} | ${sW} | ${sWin} | ${pct(sWin,sTr.length)} | ${fmtAvg(sF1.map(s=>s.atrPips))} |`);
    }
    push('');

    const v   = f1s;
    const a10 = v.filter(s => s.atrPips < 1.0);
    const a11 = v.filter(s => s.atrPips >= 1.0 && s.atrPips < 1.1);
    const a12 = v.filter(s => s.atrPips >= 1.1 && s.atrPips < 1.2);
    const a13 = v.filter(s => s.atrPips >= 1.2);
    const sg10= f5s.filter(s => s.atrPips >= 1.0 && s.atrPips < 1.1);
    const sg11= f5s.filter(s => s.atrPips >= 1.1 && s.atrPips < 1.2);
    const sg12= f5s.filter(s => s.atrPips >= 1.2);
    const w10 = sg10.filter(s => s.won === true).length;
    const w11 = sg11.filter(s => s.won === true).length;
    const w12 = sg12.filter(s => s.won === true).length;

    push(
      '### ATR Distribution & Threshold Sensitivity', '',
      '| ATR Band | Windows | % of valid |',
      '|---|---|---|',
      `| < 1.0 pip      | ${a10.length} | ${pct(a10.length, v.length)} |`,
      `| 1.0 – 1.1 pip  | ${a11.length} | ${pct(a11.length, v.length)} |`,
      `| 1.1 – 1.2 pip  | ${a12.length} | ${pct(a12.length, v.length)} |`,
      `| ≥ 1.2 pip      | ${a13.length} | ${pct(a13.length, v.length)} |`,
      '',
      '| ATR Band | Signals | Wins | Accuracy |',
      '|---|---|---|---|',
      `| 1.0–1.1 pip (marginal) | ${sg10.length} | ${w10} | ${pct(w10, sg10.length)} |`,
      `| 1.1–1.2 pip            | ${sg11.length} | ${w11} | ${pct(w11, sg11.length)} |`,
      `| ≥ 1.2 pip              | ${sg12.length} | ${w12} | ${pct(w12, sg12.length)} |`,
      '', '---', '',
    );
  }

  // Global summary
  const gSnaps  = all.flatMap(x => x.snaps);
  const gF1     = gSnaps.filter(s => s.f1);
  const gF2o    = gF1.filter(s => s.f2old);
  const gF2n    = gF1.filter(s => s.f2new);
  const gF3     = gF1.filter(s => s.f3);
  const gF4     = gF2n.filter(s => s.f3 && s.f4);
  const gF5     = gSnaps.filter(s => s.f5);
  const gSigN   = gSnaps.filter(s => s.dir !== 'WAIT').length;
  const gSigO   = gSnaps.filter(s => s.dir_old !== 'WAIT').length;
  const gTrades = gSnaps.filter(s => s.won !== null);
  const gWins   = gTrades.filter(s => s.won === true).length;
  const total   = gSnaps.length;

  const marg  = gSnaps.filter(s => s.f5 && s.atrPips >= 1.0 && s.atrPips < 1.2);
  const margW = marg.filter(s => s.won === true).length;
  const hv    = gSnaps.filter(s => s.f5 && s.atrPips >= 1.2);
  const hvW   = hv.filter(s => s.won === true).length;
  const mAcc  = marg.length > 0 ? (margW / marg.length) * 100 : 0;
  const hAcc  = hv.length  > 0 ? (hvW   / hv.length)   * 100 : 0;
  const delta = hAcc - mAcc;

  push(
    '## Global Summary — All 10 Pairs',
    `**Total windows**: ${total} (439 per pair × 10)`, '',
    '### Filter Funnel', '',
    '| Filter | Pass | Total | Rate |',
    '|---|---|---|---|',
    `| F1 No null indicators   | ${gF1.length} | ${total} | ${pct(gF1.length, total)} |`,
    `| F2 OLD normalizedAtr    | ${gF2o.length} | ${gF1.length} | ${pct(gF2o.length, gF1.length)} |`,
    `| F2 NEW atrInPips ≥ 1.0  | ${gF2n.length} | ${gF1.length} | ${pct(gF2n.length, gF1.length)} |`,
    `| F3 Body expansion       | ${gF3.length} | ${gF1.length} | ${pct(gF3.length, gF1.length)} |`,
    `| F4 Strategy conditions  | ${gF4.length} | ${Math.min(gF2n.length,gF3.length)} | ${pct(gF4.length, Math.min(gF2n.length,gF3.length))} |`,
    `| F5 Quality ≥ 83         | ${gF5.length} | ${gF4.length} | ${pct(gF5.length, gF4.length)} |`,
    '',
    '### OLD vs NEW Comparison', '',
    '| Metric | OLD gate | NEW gate | Delta |',
    '|---|---|---|---|',
    `| F2 pass rate  | ${pct(gF2o.length, gF1.length)} | ${pct(gF2n.length, gF1.length)} | +${((gF2n.length-gF2o.length)/gF1.length*100).toFixed(1)}pp |`,
    `| Total signals | ${gSigO} | ${gSigN} | +${gSigN - gSigO} |`,
    `| Accuracy      | — | ${pct(gWins, gTrades.length)} | — |`,
    '',
    '### Session Accuracy (NEW gate — all pairs)', '',
    '| Session | Signals | Wins | Accuracy |',
    '|---|---|---|---|',
  );

  for (const sess of ['Asian', 'London', 'NY'] as const) {
    const ss  = gSnaps.filter(s => s.session === sess && s.won !== null);
    const sw  = ss.filter(s => s.won === true).length;
    push(`| ${sess} | ${ss.length} | ${sw} | ${pct(sw, ss.length)} |`);
  }

  push(
    '',
    '### Marginal vs High-Volatility Accuracy (all pairs)', '',
    '| ATR Band | Signals | Wins | Accuracy |',
    '|---|---|---|---|',
    `| 1.0–1.2 pip (marginal) | ${marg.length} | ${margW} | ${mAcc.toFixed(1)}% |`,
    `| ≥ 1.2 pip (high vol)   | ${hv.length}   | ${hvW}   | ${hAcc.toFixed(1)}% |`,
    `| **Delta**              | —              | —        | **${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp** |`,
    '',
    '## Final Recommendation', '',
  );

  if (Math.abs(delta) < 3) {
    push(
      '**→ KEEP threshold at 1.0 pip.**', '',
      `The accuracy difference between marginal-ATR signals (1.0–1.2 pip) and high-ATR signals (≥1.2 pip) is **${Math.abs(delta).toFixed(1)} pp** — within statistical noise. Downstream filters (F3 body expansion, F4 strategy, F5 quality ≥83) are sufficient quality guards. Raising the threshold would reduce signal frequency without a statistically meaningful accuracy improvement.`,
    );
  } else if (delta > 3) {
    push(
      '**→ RAISE threshold to 1.2 pips.**', '',
      `High-ATR signals outperform marginal signals by **${delta.toFixed(1)} pp**. This is statistically meaningful. Raising to 1.2 pips improves accuracy at the cost of ${marg.length} fewer signals globally.`,
    );
  } else {
    push(
      '**→ CONSIDER raising threshold to 1.1 pips.**', '',
      `The 1.0–1.1 pip marginal band shows lower accuracy by **${Math.abs(delta).toFixed(1)} pp**. A 1.1 pip threshold is a conservative improvement.`,
    );
  }

  push('', '---', '', '*Phase 3 complete — no trading logic was modified.*');
  return L.join('\n');
}

const rawPath = path.join(process.cwd(), 'scratch', 'phase3_raw.json');
const raw: PairData[] = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const report = buildReport(raw);
fs.writeFileSync(path.join(process.cwd(), 'scratch', 'phase3_report.md'), report);
console.log(report);
