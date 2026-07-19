# Phase 12.5 — Forensic Audit of Phase 12 Validation Script

> **Objective:** Independently verify whether `scripts/phase12-validate.mts` is mathematically and architecturally correct.
> **Scope:** Read-only. No production code modified. No strategy changes.
> **Date:** 2026-07-15

---

## 1. Architecture Audit

### 1.1 Does it use `evaluateSignal()` directly?

**YES — Line 10 & 225**

```typescript
import { evaluateSignal } from "../src/lib/market-data/core/SignalEngine";
// ...
const result = evaluateSignal(pair);
```

The production `evaluateSignal()` is imported directly from `SignalEngine.ts` and called without any wrapper, proxy, or duplicated logic. There is no re-implementation of the decision engine. ✅

### 1.2 Does it use exactly the same `CandleCache` as production?

**YES — Line 9 & 222**

```typescript
import { CandleCache } from "../src/lib/market-data/core/CandleCache";
// ...
const ok = CandleCache.preloadHistory(pair, windowCandles);
```

The same static `CandleCache` class from production is imported and used. The only interaction is `preloadHistory()` (write) before `evaluateSignal()` (read via `getCandles()`). ✅

### 1.3 Does it use exactly the same indicators as production?

**YES — Delegated entirely to `evaluateSignal()`**

The script never calls `calculateEMA`, `calculateRSI`, `calculateADX`, or any other indicator function. All indicator computation happens inside `evaluateSignal()`, which is the production implementation. ✅

### 1.4 Does it bypass any production filters?

**PARTIALLY**

The production scan pipeline (`scanLiveMarketAsset` in `signals.ts`) has these gates:

| Production Filter | Phase 12 Applies? | Impact |
|---|---|---|
| Auth check (`checkApproved()`) | ❌ Skipped | Acceptable — validation doesn't need auth |
| User cooldown (15s/60s) | ❌ Skipped | Acceptable — this is a UI rate-limit |
| Pair cooldown (30s) | ❌ Skipped | Acceptable — this is a UI rate-limit |
| Global scan cache | ❌ Skipped | Acceptable — we want fresh signals |
| Market hours guard (`isForexMarketOpen()`) | **❌ Skipped** | **⚠️ Minor risk** — data from outside the trading week (Sat, Fri after 22:00 UTC) could be processed. In practice, TwelveData returns the last 200 minutes of available data, so off-hours fetches get stale Friday data. |
| Hard timeout (20s abort) | ❌ Skipped | Acceptable — validation has its own 20s per-request timeout |

The market hours bypass is the only notable omission. If the user runs the script during weekends, it will process data that the production engine would never scan. ✅ Acceptable for validation with caveat.

### 1.5 Does it introduce look-ahead bias?

**NO — Verified through trace**

For each window position `i` (MIN_WINDOW-1 through N-2):

| Component | Data Used |
|---|---|
| `windowSlice` | `candles[0..i]` — only **past** candles |
| `nextCandle` | `candles[i+1]` — the **next** candle (entry/exit) |
| `evaluateSignal` | Reads from `CandleCache` containing only `windowSlice` |
| Entry price | `nextCandle.open` |
| Exit/expiry price | `nextCandle.close` |

The signal is always generated from data strictly before the entry. The outcome is always determined by data strictly after the signal. No future information leaks into any decision. ✅

---

## 2. Binary Entry/Exit Logic Audit

### 2.1 Entry: Next Candle Open

```typescript
// Line 228
const entryPrice = nextCandle.open;
```

Entry occurs at the **open** of the candle immediately following the signal candle. This is correct for 1-minute Binary Options: the trader enters at the next available price. ✅

### 2.2 Exit: Following Candle Close (1-minute expiry)

```typescript
// Line 229
const expiryPrice = nextCandle.close;
```

Exit occurs at the **close** of the same candle (1 minute later). With 1-minute candles, this is exactly a 1-minute holding period. ✅

### 2.3 Visual Verification

```
Candle[i] closes  ──>  evaluateSignal() fires
Candle[i+1] opens ───> Entry at open
Candle[i+1] closes ──> Exit at close (1 min later)
```

Correct. No 5-candle lookahead, no close-to-close simulation, no synthetic exits. ✅

---

## 3. Win/Loss Logic Audit

### 3.1 CALL Wins

```typescript
// Line 211
if (direction === "CALL") return exitClose > entryOpen;
```

CALL wins iff exit close **strictly greater than** entry open. ✅

### 3.2 PUT Wins

```typescript
// Line 212
return exitClose < entryOpen;
```

PUT wins iff exit close **strictly less than** entry open. ✅

### 3.3 Tie Handling

If `exitClose === entryOpen` (At The Money):
- CALL: `false` (not >)
- PUT: `false` (not <)

Both are classified as losses. This is correct for Binary Options. ✅

---

## 4. WAIT Handling Audit

### 4.1 WAIT never converted to CALL/PUT

```typescript
// Lines 249-256
if (result.direction !== "WAIT") {
  record.won = checkWin(result.direction, entryPrice, expiryPrice);
} else {
  record.won = null;
  // Hypothetical analysis stored separately
  (record as any).callWouldWin = callWouldWin;
  (record as any).putWouldWin = putWouldWin;
}
```

WAIT signals are stored with `won: null`. They are never converted to trades. ✅

### 4.2 CALL/PUT never disappear

Non-WAIT signals always have `won: true | false`. They are never silently dropped or reclassified. ✅

---

## 5. Confidence & Quality Score Audit

### 5.1 Confidence is observational only

```typescript
// Line 237
confidence: result.confidence,
```

Recorded from the production engine's return value. Never used to determine win/loss. ✅

### 5.2 Quality Score is observational only

```typescript
// Line 238
qualityScore: result.qualityScore,
```

Recorded from the production engine's return value. Never used to determine win/loss. ✅

---

## 6. CSV Generation Audit

### 6.1 Initialization

```typescript
// Lines 295-301
function initSignalsCSV(): void {
  if (!fs.existsSync(SIGNALS_CSV)) {
    const header = "...";
    fs.writeFileSync(SIGNALS_CSV, header, "utf-8");
  }
}
```

Only writes header if file doesn't exist. Safe. ✅

### 6.2 Append

```typescript
// Lines 303-311
function appendSignalsCSV(records: SignalRecord[]): void {
  const lines = records.map(r => { /* ... */ });
  fs.appendFileSync(SIGNALS_CSV, lines.join("\n") + "\n", "utf-8");
}
```

Appends with trailing newline. Each run adds its rows. ✅

### 6.3 Read-back

```typescript
// Lines 315-339
line.split(",")
```

⚠️ **Minor fragility**: Uses `String.split(",")` which breaks if any field contains a comma. Specifically, `noTradeReason` can contain phrases like:
- `"Directional confidence too balanced"`
- `"Insufficient indicator alignment"`
- `"Volatility too low"`

None of these contain commas, so it's safe in practice. But the field is not escaped/quoted in the CSV writer either.

### 6.4 ❌ CRITICAL: No duplicate detection

**This is the most significant flaw in the validation script.**

If the script is run twice within 200 minutes, the second run fetches data that **overlaps** with the first run. The same candle windows will be processed again and **appended as duplicate rows** to the CSV.

Example:
```
Run 1 at 10:00 UTC — fetches data from 06:40 to 10:00 UTC
Run 2 at 11:00 UTC — fetches data from 07:40 to 11:00 UTC
                          ↑ overlap: 07:40–10:00 (80 minutes × 10 pairs × ~150 windows = 12,000+ duplicate rows!)
```

The state file tracks `lastFetchTimestamp` but **never compares it against fetched data** to skip windows that were already recorded.

**Impact**: Win rate calculations are skewed. If one batch has 55% win rate and the duplicate batch is the same data (same win rate), the overall rate is unchanged. But if the duplicate batch contains DIFFERENT pairs' data (partial overlap), the weighted average shifts.

**Severity**: HIGH for cumulative statistics, LOW for single-run results.

### 6.5 ❌ CRITICAL: State can diverge from CSV

If execution is interrupted between CSV append (line 841) and state save (line 857):

```
CSV:     [batch 1 data appended]
State:   [NOT updated — still shows pre-batch counters]
```

On re-run:
1. New data is fetched
2. Appended to CSV (which now has batch 1 + batch 2)
3. State updated with `records.length` (only batch 2 counted)
4. `totalWindowsCollected` now undercounts by batch 1's size

**Impact**: The cumulative counters in the state file diverge from the actual CSV, making the state unreliable for progress tracking.

---

## 7. Resume Logic Audit

### 7.1 Current resume mechanism

```typescript
// Lines 799-803
if (state.collectionDate !== today) {
  state.windowsCollectedToday = 0;
  state.collectionDate = today;
}
```

The only resumption mechanism is a daily counter reset. There is **no** mechanism to:
- Skip already-processed timestamp windows
- Reconcile state with CSV row count on startup
- Determine where the previous run stopped

### 7.2 ❌ Resume is effectively a no-op

The script always fetches the most recent 200 candles and processes all windows from scratch. The state file provides no positional information to continue from where it left off.

**Impact**: Every run adds windows, but there's no guarantee they're new windows. The "total cumulative windows" counter is misleading.

---

## 8. Quota Usage Audit

### 8.1 API calls per run: 2

With 10 pairs and BATCH_SIZE=8:
- Run 1: 8 pairs (batch 1)
- Run 2: 2 pairs (batch 2)
- Total: **2 API calls per script execution**

### 8.2 Daily maximum: 400 runs

800 quota / 2 calls per run = **400 runs per day** maximum.

### 8.3 ⚠️ No soft quota cap

The script does not check remaining quota before fetching:

```typescript
// Line 811 — always fetches, regardless of quota state
const { candles, apiCallCount } = await fetchBatchCandles(PAIRS, CANDLES_PER_FETCH, "1min");
```

If quota is exhausted, the API returns an error, and `fetchBatchCandles` returns empty results. The script exits gracefully (lines 823-827). This is acceptable behavior, though wasteful of the error response round-trip. ✅

### 8.4 Windows per API call: ~740

200 candles - 52 window minimum = 148 windows per pair per batch
10 pairs × 148 = 1,480 windows across 2 API calls
**740 windows per API call**

### 8.5 Days to 100,000 windows

At 1,480 windows per run (2 API calls), with 1 run per market session:
- 3 sessions/day × 1,480 = 4,440 windows/day
- 100,000 / 4,440 ≈ **23 days**

✅ Quota is respected. No hidden loops or accidental flooding.

---

## 9. Session, Weekday, Hour Classification Audit

### 9.1 Session Classification

```typescript
// Lines 198-204
function classifySession(hour: number): string {
  if (hour >= 0 && hour < 8) return "Asian";
  if (hour >= 8 && hour < 13) return "London";
  if (hour >= 13 && hour < 17) return "NY_Overlap";
  if (hour >= 17 && hour < 22) return "NY";
  return "Off";
}
```

| Session | UTC Range | Expected | Correct? |
|---|---|---|---|
| Asian (Tokyo) | 00:00–08:00 | 0–8 | ✅ |
| London | 08:00–13:00 | 8–13 | ✅ |
| NY Overlap | 13:00–17:00 | 13–17 | ✅ |
| NY only | 17:00–22:00 | 17–22 | ✅ |
| Off-hours | 22:00–24:00 | 22–24 | ✅ |

Uses `entryTime.getUTCHours()` (line 231, 245). ✅

### 9.2 Weekday Classification

```typescript
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// ...
weekday: WEEKDAYS[entryTime.getUTCDay()],
```

`getUTCDay()` returns 0=Sun through 6=Sat. Mapping is correct. ✅

### 9.3 Hour Classification

```typescript
utcHour: hour,  // from entryTime.getUTCHours()
```

Correct UTC hour from the entry timestamp. ✅

---

## 10. Streak Logic Audit

### 10.1 Longest WAIT / CALL / PUT streaks

```typescript
// Lines 441-462
for (const s of signals) {
  if (s.direction === "WAIT") {
    currentWaitStreak++;
    longestWaitStreak = Math.max(longestWaitStreak, currentWaitStreak);
    currentCallStreak = 0;
    currentPutStreak = 0;
  } else if (s.direction === "CALL") { /* symmetric */ }
  else if (s.direction === "PUT") { /* symmetric */ }
}
```

Tracks consecutive identical signals. Resets opposite streaks to 0. Correct. ✅

### 10.2 Average WAIT streak

```typescript
// Lines 464-472
for (const s of signals) {
  if (s.direction === "WAIT") streak++;
  else { if (streak > 0) waitStreaks.push(streak); streak = 0; }
}
if (streak > 0) waitStreaks.push(streak);
avgWaitStreak = waitStreaks.length > 0 ? waitStreaks.reduce((a, b) => a + b, 0) / waitStreaks.length : 0;
```

Collects all WAIT streak lengths and computes the mean. Correct. ✅

---

## 11. Waiting Time Metrics Audit

### 11.1 Timestamp source

```typescript
// Line 421-424
const nonWaitTimestamps = signals
  .filter(s => s.direction !== "WAIT")
  .map(s => new Date(s.timestamp).getTime())
  .sort((a, b) => a - b);
```

Timestamps are from `s.timestamp` which is the **signal generation time** (close of the last candle in the window). This is correct for measuring when signals occur. ✅

### 11.2 Gap calculation

```typescript
// Lines 428-431
const gaps: number[] = [];
for (let i = 1; i < nonWaitTimestamps.length; i++) {
  gaps.push(nonWaitTimestamps[i] - nonWaitTimestamps[i - 1]);
}
```

Difference between consecutive signal timestamps. Correct. ✅

### 11.3 Statistical measures

```typescript
// Lines 432-437
avgWaitMs = gaps.reduce((a, b) => a + b, 0) / gaps.length;                     // Mean
medianWaitMs = sorted[Math.floor(sorted.length / 2)];                           // Median
p95WaitMs = sorted[Math.floor(sorted.length * 0.95)];                           // P95
p99WaitMs = sorted[Math.floor(sorted.length * 0.99)];                           // P99
avgMinBetweenSignals = avgWaitMs / 60000;                                       // Convert to minutes
```

All measures are computed from actual timestamp differences. No assumptions. ✅

**Important caveat**: These measure signal density within the collected data, not wall-clock user wait time. Since all signals within a single batch are 1 minute apart (consecutive windows), the gaps reflect "how many consecutive minutes have at least one non-WAIT signal across all pairs," not "how long a user waits between manual scans."

---

## 12. Probability Metrics Audit

### 12.1 Signals per hour

```typescript
// Lines 475-479
const spanHours = (nonWaitTimestamps[nonWaitTimestamps.length - 1] - nonWaitTimestamps[0]) / 3600000;
signalsPerHour = spanHours > 0 ? nonWaitTimestamps.length / spanHours : 0;
```

Total non-WAIT signals divided by the time span between the first and last signal. Correct. ✅

### 12.2 Signals per trading day

```typescript
// Line 502
signalsPerTradingDay: signalsPerHour * 24 * 5 / 7,
```

24 × 5 / 7 ≈ 17.14 hours/day. This is numerically equal to 120/7 (the actual Forex trading week of 120 hours). The formula is correct but the comment/justification is inaccurate — it assumes 24/5 trading instead of the actual Sun 22:00–Fri 22:00 schedule. Numerically equivalent, though. ✅

---

## 13. Confidence Buckets Audit

### 13.1 Bucket assignment

```typescript
const confBuckets = [50, 60, 70, 80, 90];
const b = confBuckets.slice().reverse().find(c => s.confidence >= c) || 50;
const key = `${b}-${b + 9}`;
```

| Confidence | Match | Key | Correct? |
|---|---|---|---|
| 99 | 99 >= 90 → 90 | "90-99" | ✅ |
| 85 | 85 >= 80 → 80 | "80-89" | ✅ |
| 74 | 74 >= 70 → 70 | "70-79" | ✅ |
| 63 | 63 >= 60 → 60 | "60-69" | ✅ |
| 51 | 51 >= 50 → 50 | "50-59" | ✅ |
| 50 | 50 >= 50 → 50 | "50-59" | ✅ |
| 49 | None match → 50 | "50-59" | Not possible for non-WAIT (always >= 50) |

WAIT signals are excluded (line 410: `if (s.direction === "WAIT") continue`). Non-WAIT signals always have confidence >= 50 from evaluateSignal's threshold. ✅

---

## 14. Strategy Breakdown Audit

```typescript
// Lines 396-404
if (s.direction === "WAIT") continue;
if (!strategyMap.has(s.strategy)) strategyMap.set(s.strategy, { ... });
```

The `strategy` field comes directly from `result.strategy` which is the production engine's output:

```typescript
// SignalEngine.ts
strategy = isTrending ? "Trend Corridor Breakout" : "Range Extreme Reversion";
```

These are the exact production labels. No remapping, no guessing. ✅

---

## 15. False Positive & False Negative Analysis Audit

### 15.1 False Positives

```typescript
// Lines 665-667
- CALL losses: ${stats.callLosses} (X% of CALLs)
- PUT losses: ${stats.putLosses} (X% of PUTs)
```

False positive = signal generated → lost after 1-minute expiry. Correctly calculated from `won === false`. ✅

### 15.2 False Negatives

```typescript
// Lines 482-483
const waitCallWouldWin = signals.filter(s => s.direction === "WAIT" && (s as any).callWouldWin === true);
const waitPutWouldWin = signals.filter(s => s.direction === "WAIT" && (s as any).putWouldWin === true);
```

False negative = WAIT where a hypothetical trade would have won. Checked against the same entry/exit prices. WAIT windows are never classified as "won" — they're counted separately. ✅

---

## 16. Pair Rotation Audit

All 10 pairs are passed together to `fetchBatchCandles`:
```typescript
const { candles, apiCallCount } = await fetchBatchCandles(PAIRS, CANDLES_PER_FETCH, "1min");
```

`PAIRS` is a fixed array of 10 pairs. `processBatchData` iterates over all results. No pair is skipped, no pair is prioritized. ✅

---

## 17. Final Verdict Threshold Audit

### 17.1 Threshold criteria

| Grade | Requirements | Source |
|---|---|---|
| INCONCLUSIVE | `total < 1000` | Hard-coded minimum |
| A | WR >= 58% AND AR >= 15% | Hard-coded |
| B | WR >= 52% AND AR >= 10% | Hard-coded |
| C | WR >= 45% AND AR >= 5% | Hard-coded |
| D | WR >= 35% OR AR >= 3% | Hard-coded |
| E | Everything else | Catch-all |

### 17.2 Assessment

The thresholds are **subjective** (not derived from any industry standard or historical baseline for this engine). However, they are:
- **Clearly defined** in the code (lines 714-727)
- **Based on measured data** (WR and AR come from `stats`, not opinion)
- **Reproducible** (same inputs always produce the same grade)

The A grade requires 58%+ win rate AND 15%+ acceptance rate — this is appropriate for a professional signal engine (profitable with realistic frequency).

The thresholds are arbitrary but defensible. ✅

---

## 18. Risk Assessment Summary

| Risk | Severity | Impact |
|---|---|---|
| **No duplicate detection** | 🔴 HIGH | Multi-run datasets are contaminated with duplicate rows, skewing win rates and signal counts |
| **State-CSV divergence after interruption** | 🔴 HIGH | Counters become unreliable, progress tracking breaks |
| **CSV parsing fragility** | 🟡 LOW | Commas in `noTradeReason` would break line parsing (none present currently) |
| **No market hours guard** | 🟡 LOW | Off-hours data may not represent production conditions |
| **No hard quota cap** | 🟡 LOW | ~400 runs/day would exhaust quota with no early abort |
| **signalsPerTradingDay formula** | 🟢 INFO | Numerically correct, conceptually misleading comment |

---

## 19. Production Readiness Score

### Correct:
- ✅ Uses production `evaluateSignal()` directly
- ✅ Uses production `CandleCache` directly
- ✅ No look-ahead bias
- ✅ Correct binary entry/exit (next candle open → following candle close)
- ✅ Correct win/loss logic (including ties as losses)
- ✅ WAIT never converted to CALL/PUT
- ✅ Confidence and QS are observational only
- ✅ Session, weekday, hour classification correct
- ✅ Streak logic correct
- ✅ Gap-based timing metrics correct
- ✅ Confidence buckets correct
- ✅ Strategy labels from production engine
- ✅ False positive/negative analysis correct
- ✅ All pairs treated equally
- ✅ Verdict thresholds clear and data-driven

### Needs Fixing:
- ❌ **No duplicate window detection** — must use timestamp ranges to skip already-processed windows
- ❌ **State-CSV reconciliation** — must validate state against CSV row count on startup
- ⚠️ **CSV quoting** — `noTradeReason` should be quoted/escaped
- ⚠️ **Market hours** — should gate processing on `isForexMarketOpen()` or tag off-hours data

---

## 20. Final Forensic Verdict

**Grade: C — Promising — Needs targeted correction before results can be trusted.**

### Rationale

The **core signal validation** (what the engine actually decides, how wins/losses are determined) is **mathematically correct**. The production engine is the sole decision source, the binary entry/exit logic is exact, and there is no look-ahead bias.

However, the **data integrity layer** has two critical flaws that undermine cumulative results:

1. **No duplicate detection** means that running the script more than once with overlapping data windows produces duplicate CSV rows. This directly contaminates all statistics that depend on signal counts — win rate, distribution, signals per hour, confidence analysis, and strategy breakdown.

2. **No state-CSV reconciliation** means that interrupted runs produce permanent divergence between the state file (counters) and the CSV data (actual records). The user cannot determine whether their cumulative numbers are accurate.

### For a single, uninterrupted run, the output is correct.
### For cumulative multi-day collection, the results are unreliable without manual deduplication.

### Recommendation

Before trusting long-term results, add:
- Timestamp-based dedup (track `[pair, windowEndTimestamp]` pairs processed)
- State-CSV reconciliation on startup (recount CSV rows and validate against state)
- CSV field quoting for `noTradeReason`

These are data integrity fixes, not strategy changes, and do not modify production code.
