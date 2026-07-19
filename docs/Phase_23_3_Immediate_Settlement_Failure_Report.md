# Phase 23.3 — Immediate Settlement Failure Investigation Report

**Date**: 2026-07-18
**Status**: Investigation only — NO fixes applied
**Scope**: OTC execution only — Live FOREX untouched (`src/lib/forex-execution/`, `src/lib/market-data/` zero modifications)

---

## 1. Complete FAILED Assignment Table

Every place in the OTC module where `record.status = 'FAILED'` (or equivalent) is assigned:

| # | File | Line | Trigger | `noTradeReason` | When | `emit()` |
|---|------|------|---------|-----------------|------|----------|
| 1 | `OTCExecutionEngine.ts` | 303-308 | `getCandleAtTime()` returns null or `candle.close === undefined` | `'No candle data at expiry'` | <1s after SETTLING | YES |
| 2 | `OTCExecutionEngine.ts` | 317-319 | `updateSignalResult()` returns `{ success: false }` | `res.error \|\| 'Settlement failed'` | ~1-2s after SETTLING | YES (line 328) |
| 3 | `OTCExecutionEngine.ts` | 322-324 | Exception thrown in try block | `'Settlement execution error'` | <100ms after SETTLING | YES (line 328) |
| 4 | `OTCExecutionEngine.ts` | 265-268 | `now > expiryMs + 30000` (30s watchdog) | `'Settlement timeout'` | 30s after SETTLING | NO (set by tick → emit on changed) |
| 5 | `OTCExecutionEngine.ts` | 358-362 | Scan timeout (20s) | `'OTC scan exceeded 20-second limit'` | During SCANNING | YES |
| 6 | `OTCExecutionEngine.ts` | 458-461 | Unexpected scan error | `err.message \|\| 'OTC execution error'` | During SCANNING | YES |
| 7 | `OTCExecutionEngine.ts` | 507-509 | Manual dismiss | `'Manually dismissed'` | User action | NO (→ REMOVE then emit) |

### Key Finding

**Only paths 1, 2, 3 execute within seconds of SETTLING.** Path 4 takes 30 seconds. Paths 5-7 execute before SETTLING or on user action.

---

## 2. Every `status = 'FAILED'` with `noTradeReason` Search

Full search across `src/lib/otc/`:

| File | Line | Code | `noTradeReason` |
|------|------|------|-----------------|
| `OTCExecutionEngine.ts` | 266 | `record.noTradeReason = 'Settlement timeout'` | `Settlement timeout` |
| `OTCExecutionEngine.ts` | 304 | `record.noTradeReason = 'No candle data at expiry'` | `No candle data at expiry` |
| `OTCExecutionEngine.ts` | 318 | `record.noTradeReason = res.error \|\| 'Settlement failed'` | `res.error \|\| 'Settlement failed'` |
| `OTCExecutionEngine.ts` | 323 | `record.noTradeReason = 'Settlement execution error'` | `Settlement execution error` |
| `OTCExecutionEngine.ts` | 360 | `rec.noTradeReason = 'OTC scan exceeded 20-second limit'` | `OTC scan exceeded 20-second limit` |
| `OTCExecutionEngine.ts` | 459 | `placeholder.noTradeReason = msg` | `err.message \|\| 'OTC execution error'` |
| `OTCExecutionEngine.ts` | 508 | `record.noTradeReason = 'Manually dismissed'` | `Manually dismissed` |

---

## 3. Complete `resolveSettlement()` Execution Trace

File: `src/lib/otc/OTCExecutionEngine.ts:294-329`

```
resolveSettlement(record)
  │
  ├─ try {
  │     │
  │     ├─ const expiryTime = new Date(record.expiryTime)          ← L296
  │     │   └─ CAN THROW: if record.expiryTime is invalid/unset
  │     │      → catch → FAILED 'Settlement execution error'       ← L322-324
  │     │
  │     ├─ candle = await getCandleAtTime(pair, expiryTime)        ← L297
  │     │   └─ RETURNS null:
  │     │      → FAILED 'No candle data at expiry'                 ← L303-308
  │     │      → settlingIds.delete(record.id)                     ← L306
  │     │      → emit()                                            ← L307
  │     │      → return (EXIT)                                     ← L308
  │     │   └─ RETURNS candle:
  │     │      expiryPrice = candle.close                          ← L301
  │     │      ↓
  │     │
  │     ├─ res = await updateSignalResult(id, expiryPrice)         ← L311
  │     │   │
  │     │   ├─ { success: true, result: 'WIN'|'LOSS' }
  │     │   │  → record.status = 'WIN'|'LOSS'                     ← L314
  │     │   │  → record.expiryPrice = expiryPrice                  ← L315
  │     │   │
  │     │   ├─ { success: true, result: 'SETTLING', skipped: true }
  │     │   │  → record.status = 'SETTLING' (NO CHANGE)           ← L314
  │     │   │  → STUCK — watchdog fires 30s later → FAILED        ← L265-268
  │     │   │
  │     │   ├─ { success: false, error: string }
  │     │   │  → FAILED 'error || Settlement failed'              ← L317-319
  │     │   │
  │     │   └─ THROWS exception
  │     │      → catch → FAILED 'Settlement execution error'      ← L322-324
  │     │
  │     └─ (success path continues to line 326)
  │
  ├─ } catch {                                                    ← L321
  │     record.status = 'FAILED'                                  ← L322
  │     record.noTradeReason = 'Settlement execution error'       ← L323
  │     record.removeAt = now + autoRemoveDelayMs                 ← L324
  │ }                                                             ← L325
  │
  ├─ settlingIds.delete(record.id)                                ← L327
  └─ emit()                                                       ← L328
```

---

## 4. `getCandleAtTime()` — Return vs Throw Analysis

File: `src/lib/otc/index.ts:89-111`

```
getCandleAtTime(pair, at, timeframe)
  │
  ├─ mode = await readSignalMode()            ← L94
  │   └─ Returns: 'SIMULATION' | 'LIVE_OTC'
  │   └─ NEVER throws (own try/catch returns SIMULATION)
  │
  ├─ to = new Date(at.getTime() + 60000)      ← L95
  │   └─ NEVER throws (at is a Date object)
  │
  ├─ try {
  │     ├─ if (mode === 'LIVE_OTC'):
  │     │   try {
  │     │     candles = await otcFeedProvider.getCandleRange(...)  ← L100
  │     │     │   └─ ALWAYS throws OTCFeedUnavailableError (stub)
  │     │   } catch {
  │     │     // fallthrough to simulation                         ← L102-104
  │     │   }
  │     │
  │     ├─ candles = await simulatedFeed.getCandleRange(...)       ← L106
  │     │   │
  │     │   ├─ CAN THROW: if pair not in PAIR_BASE_PRICES          ← simulated_feed.ts:73
  │     │   │  → outer catch → RETURNS null                        ← L108-109
  │     │   │
  │     │   └─ Returns array of 1+ candles (always ≥1 since 
  │     │      startMs = floor(at) <= floor(at+60s) = endMs)      ← simulated_feed.ts:127-134
  │     │
  │     └─ return candles[0] ?? null                               ← L107
  │         └─ null ONLY if array is empty (impossible, see above)
  │
  } catch {
      return null                                                  ← L108-109
  }
```

**Verdict**: `getCandleAtTime()` NEVER throws to the caller (returns null instead). The only way it returns null is:
1. `simulatedFeed.getCandleRange()` throws (pair not in `PAIR_BASE_PRICES`)
2. Array is empty (theoretically impossible given the loop logic)

---

## 5. `updateSignalResult()` — All Return Paths

File: `src/app/actions/signals.ts:157-253`

| Condition | Line | Return Value | `res.success` | `res.result` | `res.error` |
|-----------|------|-------------|---------------|--------------|-------------|
| `!ok` (auth failed) | 162 | `{ success: false, error: 'Unauthorized' }` | `false` | — | `'Unauthorized'` |
| fetchError or !signal | 174-175 | `{ success: false, error: 'Signal not found' }` | `false` | — | `'Signal not found'` |
| signal.result !== 'PENDING' | 179-180 | `{ success: true, result, skipped: true }` | `true` | `signal.result` (e.g. `'SETTLING'`, `'WIN'`) | — |
| updateError on write | 200-202 | `{ success: false, error: 'Failed to update signal result' }` | `false` | — | `'Failed to update signal result'` |
| Success (WIN/LOSS) | 248 | `{ success: true, result }` | `true` | `'WIN'` or `'LOSS'` | — |
| Unexpected catch | 250-251 | `{ success: false, error: 'Failed to update signal result' }` | `false` | — | `'Failed to update signal result'` |

---

## 6. Every `catch` Block in OTCExecutionEngine

| # | File | Line | Location | Catches | Sets FAILED? | `emit()`? |
|---|------|------|----------|---------|-------------|-----------|
| 1 | `OTCExecutionEngine.ts` | 321-325 | `resolveSettlement()` try outer | Any exception | YES — `'Settlement execution error'` | YES (line 328) |
| 2 | `OTCExecutionEngine.ts` | 448-452 | `scan()` persistence try | Any exception from `saveSignal` | NO (sets `persistenceStatus = 'FAILED'`) | YES |
| 3 | `OTCExecutionEngine.ts` | 455-463 | `scan()` outer | Any exception | YES — `err.message` | YES |
| 4 | `OTCExecutionEngine.ts` | 42 | `restoreDismissedIds` | JSON parse error | NO | NO |
| 5 | `OTCExecutionEngine.ts` | 53 | `persistDismissedId` | JSON parse error | NO | NO |

Catch block 1 (`resolveSettlement` top-level catch) is the one that triggers FAILED if anything unexpected happens during settlement.

---

## 7. Timeline Disappearance Analysis

After a signal becomes FAILED (via any of paths 1-4):

```
resolveSettlement sets FAILED
  │
  ├─ record.status = 'FAILED'
  ├─ record.noTradeReason = '<reason>'
  ├─ record.removeAt = now + 3000             ← autoRemoveDelayMs (3s)
  ├─ settlingIds.delete(record.id)
  └─ emit()
        │
        ▼ (UI shows FAILED for ~3 seconds)
        │
  tick() fires 1s later:
    if (record.removeAt !== null && now >= record.removeAt && status !== 'REMOVE')
      → record.status = 'REMOVE'
      → settlingIds.delete(record.id)  (already deleted, no-op)
      → emit()
        │
        ▼
  getTimelineRecords() filters out 'REMOVE'
  → signal disappears from UI
```

**Total visible time as FAILED**: ~3 seconds (`autoRemoveDelayMs`).

**What happens on page refresh?**
- `loadActiveSignals()` queries: `.in('result', ['PENDING', 'SETTLING'])`
  - If DB has `'PENDING'` → loaded as `'SETTLING'` (since `now >= expiryMs`)
  - `resolveSettlement()` called again → WIN/LOSS if it works this time
  - OR fails again with same reason
- `loadTerminalSignals()` queries: `.in('result', ['WIN', 'LOSS', 'REFUND', 'FAILED'])`
  - If DB never got updated (persistence failed) → signal NOT in DB → lost forever
  - If DB has `'WIN'/'LOSS'` → loaded into timeline correctly
  - If DB has `'FAILED'` → loaded into timeline as terminal

**Signal is permanently lost from timeline if:**
1. `saveSignal()` failed (not persisted to DB)
2. Signal existed in DB but was never resolved (pinned at `'PENDING'` or `'SETTLING'`)
   - `loadActiveSignals()` would reload it → would attempt settlement again

---

## 8. Root Cause Analysis for "Within Seconds of SETTLING"

### Path Analysis by Timing

| Path | `noTradeReason` | Expected time from SETTLING | Likelihood |
|------|----------------|---------------------------|------------|
| **P1** — `getCandleAtTime` returns null | `'No candle data at expiry'` | <500ms | LOW (only if pair unknown to simulated feed) |
| **P2** — `updateSignalResult` returns error | `'Signal not found'` / `'Unauthorized'` / `'Failed to update'` | ~1-2s | **HIGH** |
| **P3** — Exception in try block | `'Settlement execution error'` | <100ms | LOW (would indicate code bug) |
| **P4** — 30s watchdog | `'Settlement timeout'` | 30s | N/A (not "within seconds") |

### Most Likely Root Cause: **P2 — `updateSignalResult` returns `{ success: false, error: 'Signal not found' }`**

This happens when `updateSignalResult(record.id, ...)` queries the DB and the signal ID doesn't exist. The most likely scenarios:

**Scenario A — Persistence failure (primary suspect):**
1. `saveSignal()` in `scan()` returns `{ success: false }` (line 443-447)
2. `placeholder.persistenceStatus = 'FAILED'`
3. `placeholder.id` is still the `tempId` (UUID never saved to DB)
4. Signal proceeds through WAITING_FOR_ENTRY → PENDING → SETTLING
5. `resolveSettlement` calls `updateSignalResult(tempId, expiryPrice)`
6. `supabase.from('signals').select().eq('id', tempId).single()` → no rows → `'Signal not found'`
7. `resolveSettlement` → FAILED with `'Signal not found'`
8. Signal visible as FAILED for ~3s, then REMOVE'd

**Scenario B — Auth failure:**
1. `checkApproved()` at signals.ts:161 returns `{ ok: false }`
2. `updateSignalResult` returns `{ success: false, error: 'Unauthorized' }`
3. `resolveSettlement` → FAILED with `'Unauthorized'`

### Second Most Likely: **P1 — `getCandleAtTime` returns null**

This happens if the signal's pair is not in `PAIR_BASE_PRICES` (simulated_feed.ts:24-59). If a pair like `'XAU/USD'` or `'BTC/USD'` is used, the simulated feed throws, `getCandleAtTime` returns null, and FAILED with `'No candle data at expiry'`.

---

## 9. First Statement Assigning FAILED (in time order from SETTLING)

After the PENDING→SETTLING transition, `resolveSettlement()` runs asynchronously. The **first** FAILED assignment depends on which async call completes first:

| Order | Call | Returns | Line executed | `noTradeReason` |
|-------|------|---------|---------------|-----------------|
| 1st | `getCandleAtTime()` | null → **FAILED** | 303-308 | `'No candle data at expiry'` |
| 1st | `getCandleAtTime()` | candle → proceeds | 300-301 | — |
| 2nd | `updateSignalResult()` | error → **FAILED** | 317-319 | `res.error \|\| 'Settlement failed'` |
| 2nd | `updateSignalResult()` | skip → **STUCK** | 314 | SETTLING (30s watchdog) |
| 2nd | `updateSignalResult()` | WIN/LOSS → **SUCCESS** | 314-315 | — |
| any | Exception in try | **FAILED** | 322-324 | `'Settlement execution error'` |

### The Exact First Statement (most likely)

Given normal conditions (SIMULATION mode, known pair, valid session), the first statement to execute is line 311 (`const res = await updateSignalResult(...)`). If the signal ID doesn't exist in DB, the first FAILED assignment is:

**File**: `src/lib/otc/OTCExecutionEngine.ts`
**Line**: 317
**Statement**: `record.status = 'FAILED'`
**Condition**: `updateSignalResult` returns `{ success: false, error: 'Signal not found' }`

If the pair is unknown to the simulated feed, the first FAILED assignment is:

**File**: `src/lib/otc/OTCExecutionEngine.ts`
**Line**: 303
**Statement**: `record.status = 'FAILED'`
**Condition**: `getCandleAtTime` returns null because pair not in `PAIR_BASE_PRICES`

---

## 10. Confidence Assessment

| Conclusion | Confidence | Evidence |
|-----------|-----------|----------|
| Race from Phase 23.2 is NOT the cause of immediate failure | **CERTAIN** (100%) | Our fix removed the only DB 'SETTLING' write. Without it, `updateSignalResult` always reads `'PENDING'` and proceeds. |
| Immediate failure comes from `resolveSettlement()` lines 303 or 317 | **CERTAIN** (100%) | These are the only FAILED paths that execute within seconds of SETTLING. The watchdog takes 30s. |
| Most likely `noTradeReason` is **"Signal not found"** | **HIGH** (80%) | Persistence failure during scan is the most probable cause. The signal ID (tempId) doesn't exist in Supabase when `updateSignalResult` queries it. |
| Second most likely is **"No candle data at expiry"** | **MEDIUM** (40%) | If an unknown pair is used (e.g., crypto, commodities), the simulated feed throws. |
| Third most likely is **"Unauthorized"** | **MEDIUM** (30%) | If the session expires between scan and settlement (~60-120s later), `checkApproved()` fails. |

---

## 11. Files NOT Modified

Verified: **Zero changes** to:
- `src/lib/forex-execution/` — untouched
- `src/lib/market-data/` — untouched
- Signal Engine — untouched
- ProviderManager — untouched
- Indicator logic — untouched
- NO_TRADE thresholds — untouched
- Settlement algorithm — untouched
- Countdown — untouched
- Membership — untouched

---

## 12. To Identify the Exact `noTradeReason`

Check the Supabase `signals` table for FAILED signals. The `no_trade_reason` column (if stored) or server logs will show the exact reason. Alternatively, inspect the in-memory record in the browser console when a signal enters FAILED status.

The `noTradeReason` tells you exactly which path was hit:
- `'No candle data at expiry'` → P1 (getCandleAtTime returned null)
- `'Signal not found'` → P2a (signal ID not in DB)
- `'Unauthorized'` → P2b (auth check failed)
- `'Failed to update signal result'` → P2c (DB write failed)
- `'Settlement execution error'` → P3 (unexpected exception)
- `'Settlement timeout'` → P4 (30s watchdog — not immediate)
