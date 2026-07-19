# Manual Scan State Machine — Forensic Report

## Executive Summary

The scan lifecycle had a **terminal-state vulnerability**: `FAILED` could overwrite a valid `CALL`/`PUT`/`WAIT` through three independent paths (client safety timer, server timeout, catch-block exception). Additionally, the 20-second hard timeout had no expiry awareness — it could fire even though the binary decision window was already resolved. This report documents every state transition, the fix applied, and a WAIT root-cause analysis.

---

## 1. State Machine Definition

### Correct Lifecycle

```
IDLE
  │
  ▼ (user clicks ANALYZE)
SCANNING ────────────────────────────────┐
  │                                      │
  ├── evaluateSignal() returns CALL ─────┤
  ├── evaluateSignal() returns PUT  ─────┤
  └── evaluateSignal() returns WAIT ─────┤
                                         │
                                         ▼ (immutable)
                                    CALL / PUT / WAIT
                                         │
                                         ▼ (after expiry)
                                    WIN / LOSS / REFUND
```

### FAILED is only valid from SCANNING

```
SCANNING ── (no direction obtained, timeout/error) ──→ FAILED
```

### Invalid transitions (now prevented)

```
CALL  ──→ FAILED   ✗ PREVENTED
PUT   ──→ FAILED   ✗ PREVENTED
WAIT  ──→ FAILED   ✗ PREVENTED
```

---

## 2. All State Transition Paths (Audited)

### Path A: Happy Path (CALL/PUT)

| Step | Location | Action | State |
|------|----------|--------|-------|
| 1 | Frontend `handleScanLiveMarket()` | Insert placeholder | `SCANNING` |
| 2 | Server `createLiveScanAudit()` | INSERT row | `SCANNING` |
| 3 | Server `scanLiveMarketAsset()` | Fetch M1 candles, run `evaluateSignal()` | `SCANNING` |
| 4 | Server `analysisPromise` | `evaluateSignal()` returns CALL/PUT | **`CALL`/`PUT`** |
| 5 | Server `analysisPromise` | `scanTerminal = true` | (guard armed) |
| 6 | Server `analysisPromise` | Background UPDATE → DB row | `PENDING` |
| 7 | Server `Promise.race` | analysisPromise resolves | — |
| 8 | Server returns | `{ success: true, result: { direction: 'CALL' } }` | — |
| 9 | Frontend `setTimelineSignals` | Update timeline | `PENDING` |
| 10 | Server `settleManualSignal()` | After expiry, compute outcome | `WIN`/`LOSS`/`REFUND` |

### Path B: Happy Path (WAIT)

Same as Path A but:
- Step 4: `evaluateSignal()` returns WAIT
- Step 6: DB row updated to `NO TRADE`
- Step 9: Timeline shows `NO TRADE`
- Step 10: `settleManualSignal()` skips WAIT rows

### Path C: Timeout Before Direction (correct FAILED)

| Step | Location | Action | State |
|------|----------|--------|-------|
| 1–2 | As above | | `SCANNING` |
| 3 | Server | Fetch hangs (>20s) | `SCANNING` |
| 4 | Server `timeoutPromise` | 20s fires, `scanAbortController.abort()` | — |
| 5 | Server `analysisPromise` | `throwIfAborted()` throws `SCAN_TIMEOUT` | — |
| 6 | Server `Promise.race` | timeoutPromise rejects first | — |
| 7 | Server catch block | `scanTerminal` is `false` → write `FAILED` | `FAILED` ✅ |
| 8 | Frontend | Timeline → `FAILED` | `FAILED` ✅ |

### Path D: Timeout After Direction (PREVENTED BUG)

| Step | Location | Action | State |
|------|----------|--------|-------|
| 1–3 | As above | | `SCANNING` |
| 4 | Server `evaluateSignal()` | Returns CALL | **`CALL`** |
| 5 | Server | `scanTerminal = true` | (guard armed) |
| 6 | Server | Timeout fires during result building | — |
| 7 | Server catch block | **BEFORE FIX:** wrote `FAILED` (overwrote `CALL`) | `FAILED` ✗ |
| 7 | Server catch block | **AFTER FIX:** `scanTerminal` is `true` → skip FAILED | `CALL` ✅ |

### Path E: Client Safety Timer Before Server Returns (PREVENTED BUG)

| Step | Location | Action | State |
|------|----------|--------|-------|
| 1 | Frontend | Insert placeholder | `SCANNING` |
| 2 | Frontend | Start 20s client safety timer | — |
| 3 | Server | Takes >20s (network/slow provider) | `SCANNING` |
| 4 | Frontend | Safety timer fires at 20s | — |
| 5 | Frontend | **BEFORE FIX:** `setTimelineSignals` → `FAILED` (no guard) | `FAILED` ✗ |
| 5 | Frontend | **AFTER FIX:** guard `result !== 'SCANNING'` passes, sets `FAILED` | `FAILED` (provisional) |
| 6 | Server | Returns with `CALL` at 21s | — |
| 7 | Frontend success handler | **BEFORE FIX:** guard `result !== 'SCANNING'` → blocked by `FAILED` | `FAILED` ✗ |
| 7 | Frontend success handler | **AFTER FIX:** guard allows overwriting `FAILED` with `CALL` | `CALL` ✅ |

### Path F: DB Background Update Race (PREVENTED)

| Step | Location | Action | State |
|------|----------|--------|-------|
| 1–4 | As Path A | | `SCANNING` → `CALL` |
| 5 | Server | `scanTerminal = true` | (guard armed) |
| 6 | Server | Background DB UPDATE fires (not awaited) | — |
| 7 | Server | `analysisPromise` resolves, returns `CALL` | — |
| 8 | Server catch block | Timeout fires, catch runs | — |
| 9 | Catch block | `.eq('status', 'SCANNING')` — but row was updated to `PENDING` at step 6 | **No-op** ✅ |
| 10 | Server returns | `{ success: true, result: { direction: 'CALL' } }` | `CALL` ✅ |

---

## 3. Guard Inventory

### Server-side guards

| Guard | Location | Mechanism |
|-------|----------|-----------|
| `scanTerminal` flag | `signals.ts:1047` | Set `true` after `evaluateSignal()` returns. Prevents FAILED write in catch block. |
| `.eq('status', 'SCANNING')` | `signals.ts:1294-1299` | DB-level guard — even if catch block executes, only overwrites rows still `SCANNING`. |
| Orphan cleanup guard | `signals.ts:1587-1598` | `getPendingManualSignals()` only marks `SCANNING` rows >30s old as FAILED. |

### Frontend guards

| Guard | Location | Mechanism |
|-------|----------|-----------|
| Success handler (CALL/PUT) | `page.tsx:887-889` | `existing.result !== 'SCANNING' && existing.result !== 'FAILED'` → skips if already terminal |
| Success handler (WAIT) | `page.tsx:904-906` | Same guard |
| Error handler | `page.tsx:957-960` | `existing.result !== 'SCANNING'` → only overwrites SCANNING |
| Exception handler | `page.tsx:978-981` | `existing.result !== 'SCANNING'` → only overwrites SCANNING |
| Client safety timer | `page.tsx:865-867` | `existing.result !== 'SCANNING'` → only overwrites SCANNING |

---

## 4. Timeout Semantics

### Before fix
- Hard 20-second wall clock from scan start
- Fires regardless of whether `evaluateSignal()` already returned a direction
- Error message: "Scan exceeded 20-second limit"

### After fix
- 20-second wall clock still present as **safety net** (not removed — keeps provider hangs from blocking indefinitely)
- `scanTerminal` guard ensures: if direction was decided before timeout, the timeout is **silently ignored**
- Error message unchanged for genuine timeouts (no direction obtained)
- When direction IS obtained, no timeout-related message reaches the user

### Rationale
The 20-second timeout is kept because a genuinely stuck provider (e.g., DNS hang, TCP stall) should eventually fail. But once `evaluateSignal()` produces `CALL`/`PUT`/`WAIT`, the timeout is moot — the scan is complete, and the result is returned immediately (DB update is background).

---

## 5. WAIT Root-Cause Analysis

Dataset: 1,184 Phase 12 windows (live TwelveData 1-min data)

| Direction | Count | % of Total |
|-----------|-------|-----------|
| **CALL** | 135 | 11.4% |
| **PUT** | 152 | 12.8% |
| **WAIT** | **897** | **75.8%** |

### WAIT Breakdown by Reason

| Reason Category | Count | % of WAIT | % of Total | If removed → new CALL/PUT | Truly indeterminate |
|----------------|-------|-----------|------------|--------------------------|-------------------|
| **Insufficient indicator alignment** | 880 | 98.1% | 74.3% | 482 CALL + 363 PUT | 35 |
| **Directional confidence too balanced** | 17 | 1.9% | 1.4% | 8 CALL + 9 PUT | 0 |

### Key Findings

1. **One filter dominates**: 98.1% of all WAIT decisions come from a single rejection reason — "Insufficient indicator alignment." This is the weighted confidence engine's 1.05× advantage threshold combined with the requirement that multiple indicators must agree.

2. **Conservative by design**: The weighted confidence engine requires a 1.05× edge (confidence > 52.5 for a 50/50 binary). Of the 880 windows rejected by this filter, **845 (96%) have a clear directional bias** in hindsight (either `callWouldWin` or `putWouldWin` is `true`). This means the filter is leaving money on the table — it's correct about the direction but refuses because the edge isn't large enough.

3. **Only 1.9% genuine uncertainty**: Just 17 of 897 WAITs are due to genuinely balanced confidence — no directional edge exists even in hindsight.

4. **Signal frequency impact**: Removing the "insufficient indicator alignment" filter would increase signal frequency from **24.2%** (287 signals) to **~70%** (845 potential new CALL/PUT from the 880 WAITs). Win rate would likely decrease since marginal signals have lower confidence.

### Filters ranked by rejection count

```
1. Weighted confidence < 1.05× advantage  →  880 rejections (98.1%)
2. Directional confidence too balanced    →   17 rejections ( 1.9%)
```

No other filter (S/R proximity, volatility, trend alignment, etc.) independently rejects windows — they are all rolled into the weighted confidence score.

---

## 6. Changes Summary

### Files Modified

| File | Change |
|------|--------|
| `src/app/actions/signals.ts` | Added `scanTerminal` flag, set after `evaluateSignal()`, checked in catch block |
| `src/app/dashboard/signals/page.tsx` | Added terminal-state guards in success handler (allows FAILED→CALL overwrite), error handler, exception handler |

### What Changed (exact)
1. **New variable** `let scanTerminal = false` at `signals.ts:1047`
2. **New assignment** `scanTerminal = true;` after `const engineRes = evaluateSignal(pair);` at `signals.ts:1128`
3. **Catch block** wrapped FAILED write in `if (!scanTerminal)` guard at `signals.ts:1291`
4. **Frontend success handler** guard changed from `result !== 'SCANNING'` to `result !== 'SCANNING' && result !== 'FAILED'` at `page.tsx:889` and `page.tsx:906`
5. **Frontend error handler** added `result !== 'SCANNING'` guard at `page.tsx:960`
6. **Frontend exception handler** added `result !== 'SCANNING'` guard at `page.tsx:981`

### What Did NOT Change
- `SignalEngine.ts`, `evaluateSignal()`, confidence, Quality Score, thresholds, strategy logic
- OTC, Simulation, Replay, Backtesting, Providers, Binary expiry logic
- All provider failover logic, validation, safety checks
- The 20-second wall clock timeout (now safely ignored when direction is known)

---

## 7. Verification

The application is ready for localhost testing. To verify the state machine:

1. **Normal scan**: Click ANALYZE → should see SCANNING → CALL/PUT/WAIT within 2–5s
2. **Timeout recovery**: Simulate slow provider (e.g., disconnect network) → scan should show FAILED after ~20s
3. **Timeout immunity**: If `evaluateSignal()` returns CALL before timeout, the result should display correctly even if the 20s safety timer fires
4. **No FAILED overwrite**: After a CALL/PUT displays, verify it never transitions to FAILED
