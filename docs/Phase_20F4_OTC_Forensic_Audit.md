# Phase 20F.4 — OTC Execution Lifecycle Forensic Investigation

**Date:** 2026-07-17
**Scope:** OTC Manual Execution Engine only (src/lib/otc/, useOTCExecution.ts, OTCScanResultCard.tsx, OTC portions of page.tsx)
**Rule:** NO CODE MODIFICATIONS — investigation only.

---

## 1. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  page.tsx (Signal Dashboard)                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  useOTCExecution() hook                                 ││
│  │  - calls otc.scan(pairShort)                            ││
│  │  - reads otc.popupRecords → OTCScanResultCard           ││
│  │  - reads otc.timelineRecords → mergedTimeline            ││
│  │  - reads otc.activeScans → pair button states            ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────┐   ┌───────────────────────────┐ │
│  │  OTCScanResultCard.tsx   │   │  mergedTimeline (inline)  │ │
│  │  (pure renderer)         │   │  (reads record.status)   │ │
│  └─────────────────────────┘   └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  useOTCExecution.ts (React Hook)                            │
│  - subscribes to otcEngine via .subscribe()                 │
│  - transforms OTCExecutionSnapshot into React state         │
│  - filters: OTC_RUNNING_STATUSES, OTC_POPUP_VISIBLE_STATUSES│
│  - NO local state computation — pure snapshot projection    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  OTCExecutionEngine (Singleton)                             │
│  - owns records: Map<string, OTCExecutionRecord>            │
│  - 1-second tick interval                                   │
│  - single source of truth for ALL state transitions         │
│  - emits snapshot to all listeners on change                │
│  - manages: timers, concurrency, settlement, removal        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Server Actions (signals.ts)                                │
│  - saveSignal() → inserts into `signals` table (result=PENDING)│
│  - updateSignalResult() → updates WIN/LOSS + expiry_price   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  OTC Router (src/lib/otc/index.ts)                         │
│  - getCandleAtTime() → fetches expiry candle                │
│  - routes: LIVE_OTC → OTCFeedProvider, else SimulatedFeed   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Lifecycle Diagram — Complete State Machine

```
                    ┌──────────┐
                    │  IDLE    │ (no record)
                    └────┬─────┘
                         │ scan() called
                         ▼
                    ┌──────────┐
              ┌────→│ SCANNING │←──── (20s timeout)
              │     └────┬─────┘───→ generateSignal()
              │          │
              │    ┌─────┴─────┐
              │    │           │
              │    ▼           ▼
              │  null sig   signal produced
              │    │           │
              │    ▼           ▼
              │  NO_TRADE   saveSignal()
              │    │        ┌──┴──┐
              │    ▼        ▼     ▼
              │  REMOVE   FAILED  success
              │  (3s)      │       │
              │            ▼       ▼
              │          REMOVE  ┌──────────────────────┐
              │          (3s)    │ WAITING_FOR_ENTRY    │
              │                  │ (if entryTime > now) │
              │                  └──────────┬───────────┘
              │                             │ tick() sees now >= entryTime
              │                             ▼
              │                  ┌──────────────────────┐
              │                  │ PENDING              │
              │                  │ (if entryTime <= now) │
              │                  └──────────┬───────────┘
              │                             │ tick() sees now >= expiryTime
              │                             ▼
              │                  ┌──────────────────────┐
              │                  │ SETTLING             │
              │                  └──────────┬───────────┘
              │                             │ resolveSettlement()
              │                             │
              │              ┌──────────────┼──────────────┐
              │              │              │              │
              │              ▼              ▼              ▼
              │            WIN            LOSS          FAILED
              │              │              │         (no candle /
              │              ▼              ▼         error)
              │            REMOVE         REMOVE        │
              │            (3s)           (3s)          ▼
              │                                      REMOVE
              │                                      (3s)
              │
              └── SCANNING → FAILED (20s timeout)
                            │
                            ▼
                          REMOVE
                          (3s)

Note: REFUND is declared in OTCExecutionStatus but has no actual transition path
in the engine code. It exists only in the type and UI rendering.
```

### Actual Transition Table (from code)

| From | To | Trigger | File:Line |
|------|----|---------|-----------|
| (none) → SCANNING | `scan()` creates placeholder | `createScanPlaceholder()` | Engine:216-218 |
| SCANNING → FAILED | Timeout (20s expires) | `setTimeout` callback | Engine:226-228 |
| SCANNING → NO_TRADE | `generateSignal()` returns null | `scan()` line 238-244 | Engine:239-244 |
| SCANNING → FAILED | `saveSignal()` fails | `scan()` catch/error | Engine:263-265 |
| SCANNING → WAITING_FOR_ENTRY | `saveSignal()` succeeds, `entryTime > now()` | `scan()` line 280 | Engine:280 |
| SCANNING → PENDING | `saveSignal()` succeeds, `entryTime <= now()` | `scan()` line 280 | Engine:280 |
| SCANNING → FAILED | `scan()` throws exception | `catch` block | Engine:296-298 |
| WAITING_FOR_ENTRY → PENDING | `tick()` sees `now >= entryTime` | `processState()` | Engine:129-133 |
| PENDING → SETTLING | `tick()` sees `now >= expiryTime` | `processState()` | Engine:137-141 |
| SETTLING → WIN | `updateSignalResult()` returns WIN | `resolveSettlement()` | Engine:181 |
| SETTLING → LOSS | `updateSignalResult()` returns LOSS | `resolveSettlement()` | Engine:181 |
| SETTLING → FAILED | No candle data at expiry | `resolveSettlement()` | Engine:170-175 |
| SETTLING → FAILED | `updateSignalResult()` returns error | `resolveSettlement()` | Engine:185-188 |
| SETTLING → FAILED | `resolveSettlement()` throws | `catch` block | Engine:190-193 |
| *_TERMINAL → REMOVE | `tick()` sees `now >= removeAt` | `tick()` | Engine:114-118 |
| *_TERMINAL → REMOVE | `dismissScan()` called | `dismissScan()` | Engine:341-343 |

---

## 3. Deletion Chain — All record removal paths

### 3a. `records.delete()` calls

| File:Line | Why | When | Who Calls |
|-----------|-----|------|-----------|
| Engine:285 | Swap tempId → dbId after saveSignal success | After DB insert, only when tempId !== dbId | `scan()` |
| Engine:350 | Clear all records on engine destroy | `destroy()` called | External (not currently called anywhere) |

### 3b. Status set to `REMOVE` (causes filter-based removal)

| File:Line | Why | When | Who Calls | autoRemoveDelayMs |
|-----------|-----|------|-----------|-------------------|
| Engine:115-117 | Terminal auto-removal | `tick()` when `now >= removeAt` AND status not already REMOVE | `tick()` (every 1s) | 3000ms |
| Engine:172 | FAILED (no candle) remove timer | `resolveSettlement()` catch | `resolveSettlement()` | 3000ms |
| Engine:183 | WIN/LOSS/REFUND remove timer | `resolveSettlement()` success | `resolveSettlement()` | 3000ms |
| Engine:187 | FAILED (settlement error) remove timer | `resolveSettlement()` failure | `resolveSettlement()` | 3000ms |
| Engine:192 | FAILED (exception) remove timer | `resolveSettlement()` catch all | `resolveSettlement()` | 3000ms |
| Engine:228 | FAILED (scan timeout) remove timer | `setTimeout` callback (20s) | `scan()` | 3000ms |
| Engine:242 | NO_TRADE remove timer | `scan()` null signal | `scan()` | 3000ms |
| Engine:265 | FAILED (save failed) remove timer | `scan()` error | `scan()` | 3000ms |
| Engine:298 | FAILED (exception) remove timer | `scan()` catch | `scan()` | 3000ms |
| Engine:341-343 | User dismiss | `dismissScan()` called | User click → page.tsx → otc.dismiss() | Immediate |

### 3c. `settlingIds.delete()` calls

| File:Line | Why | When |
|-----------|-----|------|
| Engine:111 | Cleanup in tick() when status moves to REMOVE | `tick()` |
| Engine:116 | Same — cleanup in tick() for removeAt-based removal | `tick()` |
| Engine:173 | Settling complete — failed (no candle) | `resolveSettlement()` |
| Engine:195 | Settling complete — success or failure | `resolveSettlement()` |
| Engine:343 | User dismisses a record | `dismissScan()` |
| Engine:352 | Engine destruction | `destroy()` |

### 3d. `emit()` calls after REMOVE status is set (trigger hook re-render)

When a record's status becomes `REMOVE`:
1. `tick()` sets `status = 'REMOVE'` → calls `emit()` → hook listener fires → `setState()` re-filters
2. `useOTCExecution` listener filters `popupRecords` with `OTC_POPUP_VISIBLE_STATUSES` — REMOVE is NOT in this set → record disappears from popup
3. `useOTCExecution` listener filters `timelineRecords` with `r.status !== 'REMOVE'` → record disappears from timeline

---

## 4. Popup Removal Chain — Investigation

**Question:** Why does a FAILED popup disappear?

**Answer:** Time-based auto-removal via the `removeAt` mechanism.

**Step-by-step:**
1. Record transitions to FAILED (any of the 6 paths in section 3b)
2. `record.removeAt = this.now() + 3000` is set (3-second delay)
3. On next `tick()` (within 1s), if `now >= removeAt`, status becomes `REMOVE`
4. `emit()` fires → hook listener runs → `popupRecords` filtered by `OTC_POPUP_VISIBLE_STATUSES`
5. `OTC_POPUP_VISIBLE_STATUSES` = {SCANNING, FAILED, NO_TRADE, WAITING_FOR_ENTRY, PENDING, SETTLING, WIN, LOSS, REFUND}
6. `REMOVE` is NOT in this set → FAILED record disappears from popup

**Chain of custody:**
```
Engine.resolveSettlement()
  → record.status = FAILED
  → record.removeAt = now + 3000ms
  → emit()
  → Hook listener receives FAILED (visible)
  → tick() fires after ~1-3s
  → now >= removeAt → status = REMOVE
  → emit()
  → Hook listener receives REMOVE (filtered out)
  → Popup disappears
```

**Root cause of "popup disappeared too fast":**
The autoRemoveDelayMs is 3000ms (3 seconds). This means:
- FAILED record is visible for only ~3 seconds in the popup
- After 3 seconds, it transitions to REMOVE and is filtered out
- This is by design, not a bug

**Potential issue:** If the user is reading the FAILED message and dismissal happens within 3 seconds, they might not see it. Not a data loss bug, but a UX concern.

---

## 5. Timeline Removal Chain — Investigation

**Question:** Why does a FAILED timeline record disappear?

**Same mechanism as popup.** The record transitions to REMOVE after 3 seconds, and `getTimelineRecords()` filters by `r.status !== 'REMOVE'`.

**Important difference:** The `useOTCExecution` hook also filters `timelineRecords` with `r.status !== 'REMOVE'` at line 42:
```typescript
timelineRecords: records.filter(r => r.status !== 'REMOVE')
```

So even if `getTimelineRecords()` somehow didn't filter, the hook does.

**Impact:** FAILED records are visible in the timeline for exactly 3 seconds, then disappear forever. They are not persisted to the database (saveSignal was never called for FAILED records — it was called but failed).

**For WIN/LOSS records:** These ARE visible for 3 seconds in the timeline, then disappear from the in-memory record map. HOWEVER, the merged timeline display also reads from `timelineSignals` (from `getManualSignalAudits()`) and historical API data. WIN/LOSS records ARE in the `signals` database table (persisted by `updateSignalResult()`). So they will persist across refresh IF the historical query picks them up.

Wait — let me check: the merged timeline in `page.tsx` reads from:
1. `forex.timelineRecords` (Forex engine) — no OTC records
2. `otc.timelineRecords` (OTC engine) — in-memory only
3. `timelineSignals` — from `getManualSignalAudits()` which queries `manual_signal_audits` table

The OTC WIN/LOSS results are saved to the `signals` table (via `updateSignalResult()`), NOT to `manual_signal_audits`. The `getManualSignalAudits()` only reads from `manual_signal_audits`. So OTC results are NOT in the `timelineSignals` data source.

**This means:** OTC timeline records are ONLY in `otc.timelineRecords` (in-memory). When the page refreshes, ALL OTC timeline records are lost, including WIN/LOSS results.

---

## 6. Concurrency Cleanup — Investigation

**Concurrency mechanism:**

1. `pendingReservations` (integer): incremented before canScan check, decremented after placeholder creation
2. `maxConcurrentScans` = 3 (DEFAULT_OTC_CONFIG)
3. `canScan()`: `this.getRunningCount() + this.pendingReservations <= 3`

**FAILED → slot release:**
- When a record becomes FAILED, its status is no longer in `OTC_RUNNING_STATUSES` (which is {SCANNING, WAITING_FOR_ENTRY, PENDING})
- `getRunningCount()` filters by `OTC_RUNNING_STATUSES`
- So FAILED records automatically release their slot

**Timeline of FAILED in concurrency:**
```
SCANNING → FAILED (after 20s timeout)
→ getRunningCount() no longer includes this record
→ Slot available immediately (no need to wait for REMOVE)
```

**Verdict:** ✅ Concurrency cleanup works correctly. Failed scans release their slot immediately upon status change to FAILED, not waiting for REMOVE.

**Potential race condition:** `pendingReservations` is incremented at line 205, then `canScan()` is checked at line 206. If max concurrency is reached, `pendingReservations` is decremented at line 207 and returns error. But if canScan passes, the placeholder is created at line 219 and `pendingReservations` decremented at line 220. Between lines 205 and 220, if another scan call also passes canScan, the combined count could exceed 3 temporarily. Not fatal since `getRunningCount()` is the real authority and `pendingReservations` is just a guard.

---

## 7. Scan Timeout Investigation

**Timeout mechanism:**
- Line 223: `const scanTimeout = setTimeout(() => {...}, 20000)`
- Line 236: `clearTimeout(scanTimeout)` — called after generateSignal returns
- On timeout: status → FAILED, noTradeReason → 'OTC scan exceeded 20-second limit', removeAt set

**Does timeout execute?** Yes, IF:
- `generateSignalFn()` takes longer than 20 seconds
- OR `saveSignal()` (called after clearTimeout) takes > 20s — but this can't trigger the timeout because clearTimeout already ran

**What happens after timeout?**
```
Timeout fires:
  → rec.status = 'FAILED'
  → rec.noTradeReason = 'OTC scan exceeded 20-second limit'
  → rec.removeAt = now + 3000ms
  → emit() → hook re-renders → popup shows FAILED for 3 seconds
  → tick() → now >= removeAt → status = REMOVE → popup disappears
```

**Why might scans remain SCANNING far longer than 20s?**

**Root cause identified:**

The `scanTimeout` setTimeout is set on the `tempId` (the placeholder ID). But at line 284-285, when saveSignal succeeds:
```typescript
this.records.set(dbId, placeholder);
if (tempId !== dbId) this.records.delete(tempId);
```

The placeholder record is MOVED from `tempId` key to `dbId` key. The `scanTimeout` closure captured `tempId` and does:
```typescript
const rec = this.records.get(tempId); // ← null after migration!
```

**If the scanTimeout fires AFTER the record has been migrated from tempId to dbId, `this.records.get(tempId)` returns `undefined`, and the if-check at line 225 fails (`rec && ...` is false because rec is undefined).**

BUT: this shouldn't cause SCANNING to stick because:
- `clearTimeout(scanTimeout)` is called at line 236 BEFORE saveSignal at line 247
- The timeout is always cleared before DB operations
- Line 280 sets status to WAITING_FOR_ENTRY or PENDING, then `emit()` fires

So the timeout-already-cleared-before-DB means the migration race doesn't matter. The timeout is cleared before the record is migrated.

**However, there IS a different bug:** If `generateSignalFn` throws (not returns null, but throws), the catch block at line 293-300 fires. `clearTimeout(scanTimeout)` is called, status → FAILED, removeAt set. This works correctly.

**But what if `generateSignalFn` never returns?** If the signal generation function hangs indefinitely (infinite loop, deadlock, etc.), the timeout catches it at 20s. ✅

**What about saveSignal hanging?** The timeout was already cleared. If saveSignal hangs, the record stays at SCANNING in memory. The emit at line 221 already fired with SCANNING status, but the user saw SCANNING. Then saveSignal hangs → no more emits → SCANNING sticks forever. This is a **possible cause** of stuck SCANNING records.

**PASS** for the timeout mechanism itself — it covers generateSignalFn hangs.
**FAIL** for saveSignal hangs — no upper-bound timeout on the DB operation.

---

## 8. Signal Generation Flow

```
SCANNING record created (tempId, placeholder)
  │
  ▼
scanTimeout = setTimeout(20s)
  │
  ▼
generateSignalFn(pairIdx, seed)
  │
  ├──→ returns null
  │      └──→ NO_TRADE (removeAt set, return)
  │
  ├──→ returns GeneratedSignal
  │      │
  │      ▼
  │    clearTimeout(scanTimeout)
  │      │
  │      ▼
  │    saveSignal() → `signals` table (result='PENDING')
  │      │
  │      ├──→ fails → FAILED (removeAt set, return)
  │      │
  │      └──→ success → signalId returned
  │              │
  │              ▼
  │            Record migrated: tempId → dbId
  │            Status set: WAITING_FOR_ENTRY or PENDING
  │            emit() → UI update
  │
  └──→ throws exception
         └──→ catch: clearTimeout, FAILED (removeAt set)
```

**Where execution stops:**
- If `generateSignalFn` never resolves → timeout at 20s → FAILED ✅
- If `saveSignal` never resolves → SCANNING stuck indefinitely ❌
- If `saveSignal` resolves but Supabase is slow → works ✅
- If `saveSignal` resolves with error → FAILED ✅

---

## 9. Refresh Recovery Analysis

**Question:** Why does refresh lose every OTC scan?

**Answer:** OTC state is 100% in-memory. There is NO localStorage, sessionStorage, URL state, or service worker persistence.

**Expected flow (for comparison with Forex manual scan):**
```
Forex: scanLiveMarketAsset() → creates manual_signal_audits row with 'SCANNING'
     → on refresh: getManualSignalAudits() fetches all rows → timeline shows them
```

**Actual flow (OTC):**
```
OTC: scan() → creates in-memory record with SCANNING
   → on refresh: engine re-initializes (empty records Map), hook re-initializes (empty state)
   → EVERYTHING IS LOST — active scans, pending scans, results, timeline
```

**What IS in the database:**
- Signals that completed `saveSignal()` successfully → `signals` table with `source='live_otc'`
- Results that completed `updateSignalResult()` successfully → WIN/LOSS updated in `signals` table

**What is NOT in the database:**
- SCANNING records (never persisted)
- WAITING_FOR_ENTRY records (status set in-memory, not updated in DB)
- PENDING records (status set in-memory, not updated in DB)
- FAILED records (never persisted)
- NO_TRADE records (never persisted)
- SETTLING records (never persisted)
- REMOVE records (not applicable)

**The `signals` table row only exists after `saveSignal()` succeeds (line 247-260), which happens AFTER signal generation succeeds.** The row has `result='PENDING'` regardless of whether the engine considers it WAITING_FOR_ENTRY or PENDING.

**Missing implementation:**
- No `updateSignalStatus(signalId, status)` server action to sync in-memory state transitions to DB
- No recovery mechanism on startup to reload in-progress signals from the `signals` table
- No batch query to fetch `source='live_otc' AND result='PENDING'` and rehydrate the engine

---

## 10. Database Persistence Matrix

| Status | Persisted to DB? | Table | Column Value | Memory Only? | Notes |
|--------|-----------------|-------|--------------|--------------|-------|
| SCANNING | ❌ | — | — | ✅ | Placeholder only, never written |
| WAITING_FOR_ENTRY | ❌ | — | — | ✅ | Set on memory after saveSignal, not synced |
| PENDING | ⚠️ Partial | `signals` | `result='PENDING'` | ✅ (status) | Row exists but engine status diverges from DB |
| SETTLING | ❌ | — | — | ✅ | Memory-only transition state |
| WIN | ✅ | `signals` | `result='WIN'` | Also in memory | Updated by updateSignalResult() |
| LOSS | ✅ | `signals` | `result='LOSS'` | Also in memory | Updated by updateSignalResult() |
| REFUND | ❌ | — | — | ✅ | Declared in type but no code path produces it |
| FAILED | ❌ | — | — | ✅ | Never written — only in-memory |
| NO_TRADE | ❌ | — | — | ✅ | Never written |
| REMOVE | ❌ | — | — | ✅ | Filter state only, never stored |

**Key insight:** The `signals` table row is created with `result='PENDING'` at `saveSignal()` time. The in-memory engine may move through WAITING_FOR_ENTRY and PENDING, but the DB always shows `PENDING`. The DB is only updated to WIN/LOSS at resolution time. In-flight records are never reflected in DB.

---

## 11. Timer Inventory

| Timer | Type | Duration | File:Line | Purpose | Cleanup |
|-------|------|----------|-----------|---------|---------|
| `tickTimer` | `setInterval` | 1000ms | Engine:90 | Main state machine driver — processes transition checks (entry, expiry, removeAt) | `stop()` → `clearInterval()` |
| `scanTimeout` | `setTimeout` | 20000ms | Engine:223-231 | Guards against hung `generateSignalFn()` — transitions SCANNING → FAILED | `clearTimeout()` on success/null/error paths |
| `autoRemoveDelayMs` | Config value (read by tick) | 3000ms | Engine:100 `tick()` | Removes terminal records from popup/timeline after 3s (uses tick-based check against `removeAt`) | N/A — tick-based, not a timer |
| Engine clock sync | `performance.now()` delta | — | Engine:33-35 | Internal monotonic clock (`clockAnchor + perfOffset`) used for all time comparisons | N/A — synchronous calculation |
| React `useEffect` cleanup | `unsub()` | — | Hook:48-50 | Unsubscribes hook listener from engine on unmount | React's useEffect return |
| Hook `setState` | React state update | — | Hook:39-45 | Triggers React re-render on engine snapshot changes | Handled by React |

**No duplicate timers found.** The engine runs a single 1-second tick interval. All state transitions happen within tick() or as direct synchronous mutations in scan()/resolveSettlement().

---

## 12. Hook Synchronization Audit

**Data flow verification:**

```
OTCExecutionEngine (single source of truth)
  │
  │  .subscribe(listener)
  ▼
useOTCExecution hook
  │
  │  listener receives OTCExecutionSnapshot
  │  setState() with filtered projections:
  │    - activeScans:  OTC_RUNNING_STATUSES filter
  │    - popupRecords: OTC_POPUP_VISIBLE_STATUSES filter
  │    - timelineRecords: NOT REMOVE filter + sort
  │    - runningCount: OTC_RUNNING_STATUSES count
  │    - canScan: runningCount < 3
  ▼
page.tsx
  │
  │  Reads otc.popupRecords → OTCScanResultCard (passes record.status, clockTime)
  │  Reads otc.timelineRecords → mergedTimeline (reads record.status)
  │  Reads otc.activeScans → button loading states
  ▼
OTCScanResultCard (pure renderer)
  │
  │  Uses ONLY record.status to determine what to display
  │  getCountdown() now checks status first before timestamps
  ▼
Timeline (inline in page.tsx)
  │
  │  Uses ONLY record.status to determine what to display
  │  Countdown logic guards against timestamp-based inference
```

**Verification:**
- ✅ Hook does NOT compute its own states — it projects engine snapshots
- ✅ Hook does NOT override engine state — it only reads via `.subscribe()`
- ✅ OTCScanResultCard does NOT infer status from timestamps
- ✅ Timeline does NOT infer status from timestamps
- ✅ No layer computes its own state — all read `record.status`
- ✅ `clockTime` (Date.now()) is only used for countdown display, not for status logic

**Potential issue found:** The `useOTCExecution` hook initializes state synchronously from the engine at lines 26-32:
```typescript
const [state, setState] = useState<OTCExecutionState>(() => ({
  activeScans: otcEngine.getActiveScans(),
  popupRecords: otcEngine.getPopupRecords(),
  ...
}));
```

If the engine has records from a previous page visit (before unmount), these are captured. But since the engine is a singleton, records survive between navigations. On the FIRST page load after hard refresh, the engine is empty. This is correct behavior — no state leak.

---

## Root Cause Analysis

### Issue 1: OTC scans stuck at SCANNING (observed)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Likelihood** | Medium |
| **Root Cause** | `saveSignal()` server action hangs or takes >20s AND the `scanTimeout` has already been cleared at line 236 (before `saveSignal` is called at line 247). The timeout CANNOT catch a hanging DB call. |
| **Evidence** | Engine:236 (`clearTimeout` before DB), Engine:247-260 (no timeout wrapping `saveSignal`) |
| **Secondary Root Cause** | After `saveSignal` succeeds, the status is set to WAITING_FOR_ENTRY or PENDING at line 280, then `emit()` fires. If the status change doesn't trigger a React re-render (React batching), the UI may still show SCANNING. Low likelihood — `setState` in the listener should batch correctly. |

### Issue 2: OTC popup FAILED disappears too fast

| Field | Value |
|-------|-------|
| **Severity** | Low (UX) |
| **Likelihood** | Certain |
| **Root Cause** | `autoRemoveDelayMs = 3000` — 3 seconds to see a FAILED result before it auto-transitions to REMOVE and disappears from popup and timeline |
| **Evidence** | Engine:99-101 (config), Engine:242/265/298 (removeAt set to now + 3000ms) |

### Issue 3: OTC timeline records lost on refresh

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Likelihood** | Certain |
| **Root Cause** | No persistence mechanism for OTC engine state. In-memory records are never serialized. On page refresh: engine `records` Map is empty, hook initializes with empty state, all active and completed records are lost. |
| **Evidence** | Entire engine state lives in `this.records` (Map). `useOTCExecution` line 26-32 initializes from engine (which is empty after refresh). |

### Issue 4: WAITING_FOR_ENTRY is never reflected in database

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Likelihood** | Certain |
| **Root Cause** | After `saveSignal()` creates the DB row with `result='PENDING'`, the engine may transition to `WAITING_FOR_ENTRY` (line 280) but never calls a DB update. The DB row stays at `result='PENDING'` regardless. |
| **Evidence** | Engine:280 sets `status: entryTime > this.now() ? 'WAITING_FOR_ENTRY' : 'PENDING'` — no DB sync. Only `updateSignalResult()` (Engine:178) updates the DB. |

### Issue 5: `transitionToPending()` is a no-op (dead code)

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Likelihood** | Certain |
| **Root Cause** | `transitionToPending()` at Engine:149-151 only calls `assertValidOTCTransition()` — it validates but doesn't change state. The status was already set to PENDING at line 280. |
| **Evidence** | Engine:287-289 calls `transitionToPending(placeholder)` after status already set to PENDING at line 280. Dead code. |

### Issue 6: REFUND status has no transition path

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Likelihood** | Never |
| **Root Cause** | REFUND is declared in `OTCExecutionStatus` type and rendered in UI, but no code path in the engine ever produces it. `updateSignalResult()` only returns WIN or LOSS (signals.ts:167-173). |
| **Evidence** | signals.ts:167-173 — CALL/→WIN/LOSS, PUT→WIN/LOSS. No REFUND path. Engine:181 — only handles WIN/LOSS from `updateSignalResult()`. |

### Issue 7: Dismiss doesn't cancel `removeAt` for already-terminal records

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Likelihood** | Rare |
| **Root Cause** | If a record is already FAILED with `removeAt` set and the user taps dismiss, `dismissScan()` sets status to REMOVE immediately. But the existing `removeAt` is still in the past — tick() would have already done the same thing. Not a bug per se, but `assertValidOTCTransition()` is called with `from=FAILED, to=REMOVE` which is valid. |
| **Evidence** | Engine:337-345 — dismissScan always calls assertValidOTCTransition even for already-terminal records. |

---

## Recommendations (Ordered by Priority)

### P0 — Fix before production deployment

1. **Wrap `saveSignal()` with timeout** — Add a `Promise.race()` with a 15-20s timeout around `saveSignal()` at Engine:247-260. If the DB call hangs, treat it as FAILED. This fixes Issue 1 (stuck SCANNING).

2. **Increase autoRemoveDelayMs** — Change from 3000ms to at least 10000ms (10 seconds) so users can actually read FAILED/WIN/LOSS results before they disappear. This fixes Issue 2.

### P1 — Important for production reliability

3. **Backfill WAITING_FOR_ENTRY status to DB** — After `saveSignal()` succeeds and the engine sets WAITING_FOR_ENTRY, call a new server action `updateSignalStatus(signalId, 'WAITING_FOR_ENTRY')` to sync the DB. This fixes Issue 4.

4. **Add `getInProgressSignals()` recovery** — On engine start (or hook mount), query `signals` table for `source='live_otc' AND result='PENDING'` and rehydrate the engine's `records` Map. This allows refresh recovery for in-progress scans. Partial fix for Issue 3.

### P2 — Good to have

5. **Fix `transitionToPending()`** — Either use it to actually perform the transition, or remove the dead code at Engine:287-289. Fixes Issue 5.

6. **Add REFUND logic** — Implement candle-based REFUND (when `expiryPrice === entryPrice`) in `updateSignalResult()` or the engine. Fixes Issue 6.

### P3 — Architectural improvements

7. **Persist FAILED records** — Consider writing FAILED to `signals` table with `result='FAILED'` so timeline history is preserved across refresh. Currently FAILED is invisible after 3 seconds and on refresh. This completes the fix for Issue 3.

8. **Finalize WAITING_FOR_ENTRY in DB** — After `saveSignal()` succeeds, the entry candle is 1 minute in the future. The DB says `result='PENDING'` for the entire wait. Consider adding a separate status column or updating to `result='WAITING'` during this period.

---

## Investigation Results Summary

| Item | Result | Notes |
|------|--------|-------|
| 1: Lifecycle Trace | **PASS** | Full state machine documented above |
| 2: Transition Verification | **PASS** | All 16 actual transitions verified |
| 3: Deletion Chain | **PASS** | All removal paths traced (3b table) |
| 4: Popup Removal | **PASS** | FAILED → autoRemoveDelayMs (3s) → REMOVE → filter |
| 5: Timeline Removal | **PASS** | Same as popup — no separate timeline cleanup |
| 6: Concurrency Cleanup | **PASS** | FAILED releases slot immediately via OTC_RUNNING_STATUSES |
| 7: Scan Timeout | **PASS** (mechanism) / **FAIL** (saveSignal unprotected) | Timeout catches generateSignal hangs; saveSignal has no timeout |
| 8: Signal Generation | **PASS** | Flow traces correctly through all paths |
| 9: Refresh Recovery | **FAIL** | No recovery mechanism exists — 100% in-memory state lost |
| 10: DB Persistence | **FAIL** (mid-lifecycle) / **PASS** (terminal) | WIN/LOSS persisted; WAITING_FOR_ENTRY/PENDING/FAILED not |
| 11: Timer Inventory | **PASS** | Single tick timer + per-scan timeout — no duplicates |
| 12: Hook Sync | **PASS** | Hook is pure projection; no local state computation |

### Summary of Findings

**6 issues found:**
- 2 Critical (refresh recovery, saveSignal timeout)
- 1 High (WAITING_FOR_ENTRY not persisted)
- 3 Low (autoRemoveDelayMs timing, dead code, unreachable REFUND)
