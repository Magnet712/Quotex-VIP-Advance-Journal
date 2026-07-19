# Phase 15 — Manual Scan Synchronization & UX Finalization

**Date:** 2026-07-15
**Objective:** Eliminate every remaining synchronization issue between Manual Scan, Popup, Timeline, Settlement, Frontend State, and Database State.

---

## Changes Summary

### Files Modified

| File | Changes |
|------|---------|
| `src/app/dashboard/signals/page.tsx` | Popup lifecycle, REFUND display, nextCandleRemaining, settleExpiredSignal, timer SETTLING trigger |
| `src/app/actions/signals.ts` | DB UPDATE error handling, settlement fetch timeout |

### Files NOT Modified (unchanged)

- `SignalEngine.ts`, `evaluateSignal()`, confidence, Quality Score
- Binary logic, OTC logic, Market providers, Strategy filters
- Trading logic, thresholds, CALL/PUT/WAIT logic
- UI layout, styling, components (no redesign)
- Any file outside the two listed above

---

## Fix Details

### 1. Popup Alive Until Settlement Completes (Phase 14 BUG-01)

**Before:** `ManualScanResultCard` called `onExpired()` when the countdown reached zero (`isFreshReady`). The card was removed immediately at expiry, before settlement ran. The settlement result was never visible on the popup.

**After:** The popup stays mounted until settlement completes. When `result.status` becomes `WIN`, `LOSS`, or `REFUND`, a 3-second timer starts. After 3 seconds, `onExpired()` removes the card. The user sees:

```
PENDING → (expiry reached) → SETTLING → (settlement finishes) → WIN/LOSS/REFUND → (3s) → removed
```

**Code change** (`page.tsx:2145-2160`):
- Removed `isFreshReady` trigger for `onExpired`
- Added `hasSettled` check (`result.status === 'WIN' | 'LOSS' | 'REFUND'`)
- Added 3-second `setTimeout` before calling `onExpired`
- Added `settlementSeen` state to prevent double-trigger

### 2. REFUND Status Display (Phase 14 BUG-02)

**Before:** REFUND status fell through to the default case in the status bar switch, showing unstyled "OUTCOME: REFUND".

**After:** REFUND has its own styled case:
- Border: `bg-slate-800/40 border-slate-600/30 text-slate-300`
- Icon: `⏹️ REFUND — ENTRY PRICE EQUAL TO EXIT PRICE`

**Code change** (`page.tsx:2223-2224` for color, `page.tsx:2240-2244` for text):
- Added `result.status === 'REFUND'` entry to the ternary color chain
- Added `result.status === 'REFUND'` case with proper icon and message

### 3. nextCandleRemaining State (Phase 14 BUG-03)

**Before:** `setNextCandleRemaining` was declared but never called. The UI always showed "IN 0S".

**After:** `setNextCandleRemaining(secsLeft)` is called in the tick function alongside `setRefreshIn(secsLeft)`.

**Code change** (`page.tsx:1148`):
- Removed `// eslint-disable-line @typescript-eslint/no-unused-vars` from the useState declaration
- Added `setNextCandleRemaining(secsLeft)` in the tick function

### 4. Settlement Optimistic Sync + settlingIdsRef Cleanup (Phase 14 BUG-01, BUG-06)

**Before:** After settlement, only `refreshStats()` was called (fire-and-forget). The timeline updated only after the DB re-fetch completed. `settlingIdsRef` entries were never deleted in the interactive timer flow — only in `loadMeta`.

**After:** After `settleManualSignal` returns WIN/LOSS/REFUND:
1. `setActiveScans` is updated immediately (popup shows result)
2. `setTimelineSignals` is updated immediately (timeline shows result)
3. `refreshStats()` is called (background DB sync)
4. `settlingIdsRef.delete(id)` runs in `finally` (always cleaned up)

**Code change** (`page.tsx:734-748`):
- Added `res.status` check to validate settlement returned a terminal state
- Added `setActiveScans` optimistic update
- Added `setTimelineSignals` optimistic update
- Added `finally` block with `settlingIdsRef.current.delete(id)`

### 5. SETTLING State in Timer (UX improvement)

**Before:** When the timer detected an expired signal, it immediately called `settleExpiredSignal`. The popup showed no intermediate state — it stayed "PENDING" until settlement returned.

**After:** Before calling `settleExpiredSignal`, the timer sets the popup status to `SETTLING`. The user sees "🟡 VERIFYING CANDLE CLOSE... PLEASE WAIT" immediately.

**Code change** (`page.tsx:759-763`):
- Added `setActiveScans(prev => prev.map(s => s.id === sig.id && s.status === 'PENDING' ? { ...s, status: 'SETTLING' as const } : s))` in the timer tick

### 6. Settlement Fetch Timeout (Phase 14 BUG-05)

**Before:** `settleManualSignal` called `manager.fetchHistoricCandles()` with no timeout. A hanging provider would block settlement indefinitely.

**After:** A 15-second timeout wraps the provider fetch. If it times out, the error is caught and Yahoo Finance is tried as fallback.

**Code change** (`signals.ts:1465-1493`):
- Added `SETTLEMENT_FETCH_TIMEOUT_MS = 15000`
- Wrapped fetch in `Promise.race` with a timeout promise
- Added `SETTLEMENT_FETCH_TIMEOUT` error classification
- Yahoo fallback still attempted on timeout

### 7. DB UPDATE Error Handling (Phase 14 BUG-04)

**Before:** The fire-and-forget DB UPDATE used `.then()` without a rejection handler. If the promise rejected (network error, Supabase error), the error was silently swallowed.

**After:** `.then(successHandler, errorHandler)` with both fulfillment and rejection handlers.

**Code change** (`signals.ts:1250-1252`):
- Added rejection handler to `.then()`: `(dbErr: unknown) => console.error(...)`

---

## Before/After Lifecycle Diagram

### Before (Phase 14 State)

```
SCANNING ──→ CALL/PUT ──→ POPUP SHOWN ──→ TIMELINE PENDING
                                                │
                                           (60s expiry)
                                                │
                                           POPUP REMOVED ←── BUG: disappears before settlement
                                                │
                                           SETTLEMENT BEGINS (1-4s later)
                                                │
                                           WIN/LOSS/REFUND
                                                │
                                           TIMELINE UPDATED (after refreshStats RTT)
                                                │
                                           User sees result only in timeline
```

### After (Phase 15 State)

```
SCANNING ──→ CALL/PUT ──→ POPUP SHOWN ──→ TIMELINE PENDING
                                                │
                                           (60s expiry)
                                                │
                                           POPUP → SETTLING ←── immediate feedback
                                                │
                                           SETTLEMENT BEGINS
                                                │
                                           POPUP → WIN/LOSS/REFUND ←── optimistic
                                           TIMELINE → WIN/LOSS/REFUND ←── optimistic
                                                │
                                           (3s display)
                                                │
                                           POPUP REMOVED ←── after settlement visible
                                                │
                                           Background DB sync (refreshStats)
```

### Failure Path

```
SCANNING ──→ (timeout/error) ──→ FAILED ──→ (guard prevents overwrite)
                                                 │
                                            POPUP shows FAILED + Retry button
                                                 │
                                            TIMELINE shows FAILED
```

---

## State Transition Audit (Post-Fix)

### All Valid Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| IDLE | SCANNING | User clicks ANALYZE | Market open, cooldown, concurrency |
| SCANNING | CALL | evaluateSignal() returns CALL | scanTerminal=true |
| SCANNING | PUT | evaluateSignal() returns PUT | scanTerminal=true |
| SCANNING | WAIT | evaluateSignal() returns WAIT | scanTerminal=true |
| SCANNING | FAILED | Timeout/error before direction | scanTerminal=false |
| CALL | PENDING | DB update (fire-and-forget) | `.eq('status', 'SCANNING')` |
| PUT | PENDING | DB update (fire-and-forget) | `.eq('status', 'SCANNING')` |
| WAIT | NO TRADE | DB update (fire-and-forget) | `.eq('status', 'SCANNING')` |
| PENDING | SETTLING (popup) | Timer detects expiry | settlingIdsRef guard |
| PENDING | WIN | Optimistic settlement update | `res.status === 'WIN'` |
| PENDING | LOSS | Optimistic settlement update | `res.status === 'LOSS'` |
| PENDING | REFUND | Optimistic settlement update | `res.status === 'REFUND'` |
| SETTLING | WIN | Optimistic settlement update | `res.status === 'WIN'` |
| SETTLING | LOSS | Optimistic settlement update | `res.status === 'LOSS'` |
| SETTLING | REFUND | Optimistic settlement update | `res.status === 'REFUND'` |
| SETTLING | PENDING | Settlement fails, retry next tick | settlingIdsRef cleanup |
| WIN | (removed) | 3s timeout after settlement | settlementSeen guard |
| LOSS | (removed) | 3s timeout after settlement | settlementSeen guard |
| REFUND | (removed) | 3s timeout after settlement | settlementSeen guard |
| FAILED | (terminal) | — | Guards prevent overwrite |

### All Invalid Transitions (Prevented)

| Transition | Prevention |
|-----------|------------|
| CALL → FAILED | `if (!scanTerminal)` server guard |
| PUT → FAILED | `if (!scanTerminal)` server guard |
| WAIT → FAILED | `if (!scanTerminal)` server guard |
| WIN → SCANNING | `.eq('status', 'SCANNING')` DB guard |
| LOSS → SCANNING | `.eq('status', 'SCANNING')` DB guard |
| REFUND → SCANNING | `.eq('status', 'SCANNING')` DB guard |
| FAILED → CALL | Frontend terminal-state guard `result !== 'SCANNING' && !== 'FAILED'` |

---

## Latency Measurements (Updated)

| Stage | Before | After | Improvement |
|-------|--------|-------|-------------|
| Expiry → popup shows SETTLING | N/A (immediate removal) | 0ms (immediate) | ✅ New: instant feedback |
| Settlement → popup shows result | N/A (popup already gone) | 0ms (immediate) | ✅ New: instant update |
| Settlement → timeline shows result | 200-500ms (refreshStats RTT) | 0ms (immediate) + 200-500ms (sync) | ✅ Optimistic + background sync |
| Popup result visible duration | 0s (removed on expiry) | 3s | ✅ 3-second display window |
| Settlement fetch timeout | ∞ (no timeout) | 15s | ✅ Bounded |

---

## Verification Checklist

- [ ] **Popup appears immediately after scan** — `activeScans` updated in scan success handler
- [ ] **Timeline immediately shows PENDING** — `setTimelineSignals` in scan success handler
- [ ] **Popup stays until settlement** — ManualScanResultCard no longer calls onExpired on expiry
- [ ] **Popup shows SETTLING** — Timer sets `activeScans` status to SETTLING
- [ ] **Popup shows WIN/LOSS/REFUND** — `settleExpiredSignal` updates `activeScans` optimistically
- [ ] **Timeline shows WIN/LOSS/REFUND immediately** — `settleExpiredSignal` updates `timelineSignals` optimistically
- [ ] **Popup remains 3 seconds after settlement** — `setTimeout(3000)` before `onExpired`
- [ ] **REFUND displays correctly** — Proper color and message in status bar
- [ ] **nextCandleRemaining shows correct value** — Updated every second in tick function
- [ ] **No PENDING stuck states** — Settlement timeout prevents indefinite hangs
- [ ] **settlingIdsRef always cleaned up** — `finally` block in `settleExpiredSignal`
- [ ] **DB UPDATE errors logged** — Rejection handler in `.then()`
- [ ] **Settlement fetch has timeout** — 15s Promise.race
- [ ] **No FAILED overwrite of terminal states** — All guards in place
- [ ] **No visual gap between popup removal and timeline display** — Both updated together

---

## Regression Checklist

- [ ] **Normal manual scan** — Click ANALYZE → SCANNING → CALL/PUT result within 5s
- [ ] **WAIT signals** — Show NO TRADE, no popup created
- [ ] **Concurrent scan limit (3)** — Fourth scan blocked
- [ ] **Cooldown** — 30s per-pair, 15s/60s user
- [ ] **Market closed** — Alert shown, scan blocked
- [ ] **Timeout recovery** — FAILED shown if >20s
- [ ] **Settlement accuracy** — WIN/LOSS/REFUND correct (Phase 13 verified)
- [ ] **Duplicate settlement prevention** — settlingIdsRef + DB status guard
- [ ] **Tab switch recovery** — getPendingManualSignals restores state
- [ ] **Orphan cleanup** — SCANNING rows >30s auto-failed on load
- [ ] **20s safety timer** — Client + server independent timeouts
- [ ] **OTC tab** — Unaffected (no changes to OTC flow)
- [ ] **Simulation tab** — Unaffected (no changes to simulation flow)
- [ ] **Signal history page** — Unaffected (no changes to getSignalHistory)
- [ ] **Performance** — No new API calls per scan cycle

---

## Terminal State Immutability Confirmation

All six terminal states are immutable after Phase 13 + Phase 15 guards:

| Terminal State | Guard Layer 1 | Guard Layer 2 | Guard Layer 3 |
|---------------|---------------|---------------|---------------|
| **WIN** | `scanTerminal` (server) | `.eq('status', 'SCANNING')` (DB) | Frontend state guard |
| **LOSS** | `scanTerminal` (server) | `.eq('status', 'SCANNING')` (DB) | Frontend state guard |
| **REFUND** | `scanTerminal` (server) | `.eq('status', 'SCANNING')` (DB) | Frontend state guard |
| **NO TRADE** | `scanTerminal` (server) | `.eq('status', 'SCANNING')` (DB) | Frontend state guard |
| **FAILED** | N/A (no overwrite from non-SCANNING) | `.eq('status', 'SCANNING')` (DB) | Frontend state guard |
| **PENDING** | N/A (expected to transition) | N/A | N/A |

**WIN/LOSS/REFUND** can only be reached from PENDING (settlement), and PENDING is only reached from CALL/PUT (scan). The chain is:

```
SCANNING → CALL/PUT → PENDING → WIN/LOSS/REFUND (immutable)
SCANNING → WAIT → NO TRADE (immutable)
SCANNING → FAILED (immutable)
```

No path exists to overwrite an immutable state.

---

## Files Changed (Diff Summary)

### `src/app/dashboard/signals/page.tsx`

| Line(s) | Change |
|---------|--------|
| 499 | Removed eslint-disable comment from `nextCandleRemaining` |
| 734-748 | Rewrote `settleExpiredSignal`: optimistic updates + try/catch/finally |
| 759-763 | Added `setActiveScans(SETTLING)` before calling settleExpiredSignal |
| 1148 | Added `setNextCandleRemaining(secsLeft)` in tick function |
| 2145-2160 | Rewrote popup lifecycle: keep until settlement + 3s delay |
| 2223-2224 | Added REFUND case to color chain |
| 2240-2244 | Added REFUND case to status text/icon |

### `src/app/actions/signals.ts`

| Line(s) | Change |
|---------|--------|
| 1250-1252 | Added rejection handler to fire-and-forget DB UPDATE |
| 1465-1493 | Added 15s timeout to settlement provider fetch |
