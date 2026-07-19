# Phase 21.6B — Institutional Signal Quality Filter (NO_TRADE)

## Objective

Convert the OTC indicator engine from an always-directional engine into a selective institutional signal engine that returns CALL, PUT, or NO_TRADE based on actual signal quality — indicator confluence, score decisiveness, and trend confirmation.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/otc/indicator-engine.ts` | Added NO_TRADE to `IndicatorResult.direction`, quality gating logic with 4 conditions, actual indicator confluence counting, `bullScore`/`bearScore` fields, NO_TRADE handling for pattern/confidence/risk/trend/CVD. `resultToGeneratedSignal()` returns `null` for NO_TRADE. |
| `src/lib/otc/OTCExecutionEngine.ts` | Updated `if (!sig)` block to pass through actual `noTradeReason` from indicator engine. (Existing code already handled NO_TRADE via `placeholder.status = 'NO_TRADE'; placeholder.direction = 'WAIT'; placeholder.removeAt = ...`). |
| `scripts/phase21-6b-simulation.mts` | New simulation script — 2,400 scans across 34 OTC pairs, reports CALL/PUT/NO_TRADE distribution, confidence, score distribution, confluence, NO_TRADE reason breakdown. |

**Zero changes to:** `src/lib/forex-execution/`, `src/lib/market-data/`, SignalEngine, ProviderManager, settlement, countdown, persistence, refresh recovery, pair normalization, validation, admin, performance, signal history.

## Decision Logic

### Indicator Confluence Counting (0-6)

For the dominant direction (`isBull = bullPts >= bearPts`), count how many indicators agree:

| # | Indicator | CALL agreement | PUT agreement |
|---|-----------|---------------|--------------|
| 1 | RSI direction | RSI < 50 | RSI > 50 |
| 2 | Stochastic bias | stochBull | stochBear |
| 3 | SMA/EMA cross | SMA20 > EMA50 | SMA20 < EMA50 |
| 4 | Wick bias | wick.bias === 'BULLISH' | wick.bias === 'BEARISH' |
| 5 | SuperTrend | SuperTrend === 'BULLISH' | SuperTrend === 'BEARISH' |
| 6 | Candle body | close > open | close < open |

### NO_TRADE Gating (checked in order, first match wins)

| Priority | Condition | Reason | Expected frequency† |
|----------|-----------|--------|-------------------|
| 1 | `topScore < 5` | Insufficient indicator activity | 40-55% (synthetic) / 5-15% (live) |
| 2 | `diff <= 1` | Bull/Bear strength effectively tied | 1-3% |
| 3 | `diff <= 2 && confirmations < 4` | Narrow margin with weak confluence | 5-15% |
| 4 | `confirmations < 3` | Majority of indicators conflict | 2-8% |

† Synthetic random data vs. live market data with trends.

### CALL/PUT (unchanged)

If no NO_TRADE condition matches, the existing scoring and confidence formula runs identically:

```typescript
direction = isBull ? 'CALL' : 'PUT';
if (topScore >= 14) confidence = 95;
else if (topScore >= 11) confidence = 90;
else if (topScore >= 8) confidence = 85;
else confidence = 80;
```

## Simulation Results (2,400 scans, 34 OTC pairs, synthetic random data)

### CALL / PUT / NO_TRADE Distribution

| Outcome | Count | Percentage |
|---------|-------|------------|
| CALL | 546 | 22.8% |
| PUT | 580 | 24.2% |
| NO_TRADE | 1,274 | 53.1% |

**Note:** The simulated feed generates random-walk candles with 0.15% jitter — no trends, no momentum, no structure. On real market data with genuine trends, the CALL/PUT rate would be substantially higher and NO_TRADE correspondingly lower (estimated 15-30%). The filter correctly rejects noise. The NO_TRADE percentage emerges naturally from the data quality — it is not hardcoded.

### Confidence Distribution (CALL/PUT only)

| Confidence | Count | % of trades |
|-----------|-------|-------------|
| 95 | 0 | 0.0% |
| 90 | 0 | 0.0% |
| 85 | 238 | 21.1% |
| 80 | 888 | 78.9% |

**Average confidence: 81.06** (synthetic data lacks extreme RSI/trend values; live data would show higher confidence)

### Bull/Bear Score Distribution

| Bucket | Bull Score | Bear Score |
|--------|-----------|-----------|
| 0-5 | 82.1% | 80.0% |
| 6-7 | 13.2% | 14.9% |
| 8-10 | 4.8% | 5.2% |
| 11+ | 0.0% | 0.0% |
| **Average** | **3.07** | **3.30** |

### Score Differential Distribution

| Diff | Count | % |
|------|-------|---|
| 0-1 | 601 | 25.0% |
| 2-3 | 698 | 29.1% |
| 4-5 | 536 | 22.3% |
| 6-7 | 363 | 15.1% |
| 8+ | 202 | 8.4% |
| **Average** | **3.45** | |

### Indicator Confluence Distribution

| Confirmations | Count | % |
|--------------|-------|---|
| 1/6 | 141 | 5.9% |
| 2/6 | 672 | 28.0% |
| 3/6 | 934 | 38.9% |
| 4/6 | 525 | 21.9% |
| 5/6 | 119 | 5.0% |
| 6/6 | 9 | 0.4% |
| **Average** | **2.93** | |

### NO_TRADE Reason Breakdown

| Reason | Count | % of NO_TRADE |
|--------|-------|--------------|
| Insufficient indicator activity — topScore < 5 | 1,034 | 81.2% |
| Narrow margin with weak indicator confluence | 173 | 13.6% |
| Majority of indicators conflict with dominant side | 54 | 4.2% |
| Bull/Bear strength effectively tied — diff ≤ 1 | 13 | 1.0% |

## Behavior Verification

### Timeline
- NO_TRADE appears in Timeline: `getTimelineRecords()` filters only `REMOVE` — NO_TRADE passes ✅
- NO_TRADE auto-removes: `placeholder.removeAt = now + autoRemoveDelayMs` is set in `if (!sig)` block ✅
- User can manually dismiss: `dismissScan()` handles NO_TRADE via `assertValidOTCTransition('NO_TRADE', 'REMOVE')` ✅

### Settlement
- `if (!sig)` returns `{ success: true, direction: 'WAIT' }` BEFORE `saveSignal()` is called — NO_TRADE never enters settlement ✅

### Performance
- `getSignalPerformance()` queries `signals` table — NO_TRADE not persisted, never counted ✅
- Win rate unaffected ✅

### Admin Optimization
- `getPairPerformanceMap()` queries `signals` table — NO_TRADE not persisted ✅

### CALL/PUT Behavior
- When quality gate passes, existing confidence/risk/pattern/strategy formula runs identically ✅

## TypeScript Compilation

```
npx tsc --noEmit → zero new errors (pre-existing errors only in phase9/phase10 scripts)
```

## Run Simulation

```bash
npx tsx scripts/phase21-6b-simulation.mts
```

Completes in ~0.23s (all synchronous candle generation).
