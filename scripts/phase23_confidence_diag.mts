/**
 * Phase 23 — Confidence Diagnostic v2
 *
 * Checks per-pair confidence across multiple minute windows.
 */

import { simulatedFeed } from '../src/lib/otc/simulated_feed';
import { analyzeCandles } from '../src/lib/otc/indicator-engine';

const PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
  'EUR/JPY', 'GBP/JPY', 'EUR/GBP', 'NZD/USD', 'USD/CHF',
  'EUR/AUD', 'GBP/AUD', 'AUD/JPY', 'CAD/JPY', 'CHF/JPY',
  'EUR/CAD', 'GBP/CAD', 'AUD/CAD', 'AUD/NZD', 'NZD/JPY',
];

async function run() {
  // Test across 20 different minute windows
  const windows = 20;

  // Collect all data: pair → window → { confidence, topScore, direction }
  const pairData: Record<string, { conf: number; topScore: number; dir: string; window: number }[]> = {};

  for (const pair of PAIRS) {
    pairData[pair] = [];
  }

  for (let w = 0; w < windows; w++) {
    const now = new Date(Date.now() - w * 60_000);
    const from = new Date(now.getTime() - 60 * 60_000);
    const to = new Date(now.getTime() + 60_000);

    for (const pair of PAIRS) {
      const candles = await simulatedFeed.getCandleRange(pair, from, to, '1m');
      const result = analyzeCandles(candles);
      pairData[pair].push({
        conf: result.confidence,
        topScore: Math.max(result.bullScore, result.bearScore),
        dir: result.direction,
        window: w,
      });
    }
  }

  // For each pair, count unique confidence values in TRADE signals
  console.log('═'.repeat(120));
  console.log('Per-pair confidence analysis — 20 minute windows');
  console.log('═'.repeat(120));

  let totalTradeSignals = 0;
  let singleValuePairs = 0;

  for (const pair of PAIRS) {
    const tradeSignals = pairData[pair].filter(d => d.dir !== 'NO_TRADE');
    totalTradeSignals += tradeSignals.length;

    const confValues = [...new Set(tradeSignals.map(d => d.conf))].sort((a, b) => a - b);

    if (tradeSignals.length === 0) {
      console.log(`  ${pair.padEnd(10)} NO TRADE SIGNALS`);
    } else {
      const confStr = confValues.join(', ');
      const hasSingleValue = confValues.length === 1;
      if (hasSingleValue) singleValuePairs++;

      console.log(
        `  ${pair.padEnd(10)} signals=${String(tradeSignals.length).padStart(2)}  ` +
        `conf: [${confStr}]${hasSingleValue ? ' ← ALL SAME VALUE' : ''}`
      );
    }
  }

  // Overall stats
  console.log(`\n  Total trade signals: ${totalTradeSignals}`);
  console.log(`  Pairs with single confidence value: ${singleValuePairs} / ${PAIRS.length}`);

  // Confidence distribution across ALL trade signals
  const confDist: Record<number, number> = {};
  for (const pair of PAIRS) {
    for (const d of pairData[pair]) {
      if (d.dir !== 'NO_TRADE') {
        confDist[d.conf] = (confDist[d.conf] || 0) + 1;
      }
    }
  }
  console.log('\nConfidence distribution (all trade signals):');
  for (const [conf, count] of Object.entries(confDist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const pct = (count / totalTradeSignals * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(Number(pct)));
    console.log(`  ${conf}%: ${String(count).padStart(3)} signals (${pct}%) ${bar}`);
  }
}

run().catch(console.error);
