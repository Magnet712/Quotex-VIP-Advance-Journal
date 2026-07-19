# Phase 19 — Forex Manual Scan Engine Rebuild

## Architecture Overview

The entire Manual Scan lifecycle has been replaced with a deterministic institutional-grade execution engine. The engine is the **only** source of truth for execution state. Popup, Timeline, and Statistics are read-only consumers.

### New Files

| File | Purpose |
|------|---------|
| `src/lib/forex-execution/types.ts` | All types, enums, valid transition map |
| `src/lib/forex-execution/ExecutionEngine.ts` | Singleton state machine + scheduler |
| `src/app/dashboard/signals/useForexExecution.ts` | React hook wrapping the engine |

### Modified Files

| File | Changes |
|------|---------|
| `src/app/dashboard/signals/page.tsx` | Removed 300+ lines of manual state management. Uses `useForexExecution()` hook. |
| `src/app/dashboard/signals/ManualScanResultCard.tsx` | Rewritten as pure visual component. Zero logic, zero state, zero timers. |

### Deleted State (from page.tsx)

- `activeScans` → engine `getActiveScans()`
- `popupNotifications` → engine `getPopupRecords()`
- `scanningPairs` → engine `getActiveScans()`
- `clockTime` → engine internal clock
- `settlingIdsRef` → engine internal guard
- `entryCaptureQueueRef` → engine internal scheduler
- `frontendCooldowns` → removed (engine handles all timing)
- `nextCandleRemaining` → replaced by `forex.runningCount/3`
- `syncedServerTimeRef`, `syncPerfTimeRef`, `getPerfNow` → engine clock

---

## State Machine

```
IDLE
  │
  ├──→ SCANNING ──→ FAILED ──→ REMOVE
  │       │
  │       ├──→ NO TRADE ──→ REMOVE
  │       │
  │       └──→ WAITING_FOR_ENTRY
  │               │
  │               └──→ PENDING
  │                       │
  │                       └──→ SETTLING
  │                               │
  │                               ├──→ WIN ──→ REMOVE
  │                               ├──→ LOSS ──→ REMOVE
  │                               └──→ REFUND ──→ REMOVE
```

### Transition Rules

Each transition is validated by `VALID_TRANSITIONS` map. Invalid transitions throw at runtime.

```
SCANNING → FAILED          // Scan error or timeout
SCANNING → NO TRADE        // Engine returned WAIT
SCANNING → WAITING_FOR_ENTRY // Engine returned CALL/PUT, future entry

WAITING_FOR_ENTRY → PENDING // M1 boundary reached
WAITING_FOR_ENTRY → FAILED  // Error during entry capture

PENDING → SETTLING          // Expiry reached (entryTime + 60s)
PENDING → FAILED            // Error during settlement

SETTLING → WIN              // Entry < Exit (CALL) or Entry > Exit (PUT)
SETTLING → LOSS             // Entry > Exit (CALL) or Entry < Exit (PUT)
SETTLING → REFUND           // Entry === Exit
SETTLING → FAILED           // Settlement fetch failed

WIN/LOSS/REFUND/FAILED/NO TRADE → REMOVE  // Auto-remove after 3s
```

---

## Slot Counting

Only **SCANNING**, **WAITING_FOR_ENTRY**, and **PENDING** count toward the 3-slot limit.

- **FAILED**: Slot released immediately on transition
- **NO TRADE**: Slot released immediately on transition
- **SETTLING**: Slot released (no longer PENDING)
- **WIN/LOSS/REFUND**: Slot was already released at SETTLING

When a slot is released, a fourth scan becomes available immediately.

---

## Next-Candle Execution

### Scheduling

```
User clicks ANALYZE at 12:20:43
  ↓
Engine computes next M1 boundary: 12:21:00
  ↓
Entry scheduled for 12:21:00
  ↓
Expiry = 12:22:00 (exactly 60 seconds after entry)
```

### Entry Price

Official entry price is always the **OPEN** of the entry candle (12:21:00).

### Exit Price

Official exit price is always the **CLOSE** of the expiry candle (12:22:00).

### WIN/LOSS Calculation

```
CALL: WIN if Exit(Close) > Entry(Open), else LOSS
PUT:  WIN if Exit(Close) < Entry(Open), else LOSS
      REFUND if Exit(Close) === Entry(Open)
```

---

## Countdown

| State | Display |
|-------|---------|
| WAITING_FOR_ENTRY | `Starts in MM:SS` (time until M1 boundary) |
| PENDING | `Remaining 01:00` → `00:59` → ... → `00:00` |

The countdown transitions from `Starts in` to `Remaining` **exactly** at the M1 boundary, guaranteeing it always starts at 01:00.

---

## Popup (Visual Only)

- Receives execution record as prop
- Cannot affect execution
- Closing the popup never cancels a trade
- Shows scan stages during SCANNING
- Shows countdown during WAITING_FOR_ENTRY/PENDING
- Shows terminal result (WIN/LOSS/REFUND/FAILED/NO TRADE)

---

## Timeline (History Only)

- Reads from engine's record store
- Sorted newest → oldest
- Never disappears, never duplicates, never reorders
- Shows every record including active ones (as they update)

---

## Recovery

On page reload:

1. Engine starts tick loop
2. Calls `getPendingManualSignals()` to restore running executions
3. Calls `getManualSignalAudits()` to restore full history
4. Any PENDING records that have already expired are settled immediately
5. Orphaned SCANNING rows are auto-failed by the server action

Only running executions (SCANNING, WAITING_FOR_ENTRY, PENDING) are restored as active. Terminal states populate the timeline.

---

## Race Condition Elimination

| Risk | Mitigation |
|------|------------|
| Duplicate timers | Single 1-second tick loop |
| Duplicate settlement | `settlingIds` Set guard |
| Duplicate entry capture | Engine checks record status before transition |
| Duplicate popup | Single engine records map |
| Duplicate timeline | Single engine records map |
| Concurrent state mutations | All transitions through single `processState()` |
| Stale clock | Engine re-anchors on every scan response |
| Background tab drift | Engine clock uses `performance.now()` offset |

---

## Concurrency

- 3 concurrent slots verified by `getRunningCount()`
- Each scan is independent per pair
- Failed/scans don't affect each other
- Slot released immediately on terminal transition

---

## File Listing

```
src/lib/forex-execution/
  ├── types.ts              (81 lines)
  └── ExecutionEngine.ts    (513 lines)

src/app/dashboard/signals/
  ├── useForexExecution.ts  (83 lines)
  ├── ManualScanResultCard.tsx (rewritten, 277 lines)
  └── page.tsx              (modified, 1291 lines)
```

---

## Invariants

1. Engine is the **only** source of truth for execution state
2. Popup is **visual only** — never owns execution
3. Timeline is **history only** — never owns execution
4. All transitions are validated against `VALID_TRANSITIONS`
5. Entry price is always **OPEN** of entry candle
6. Exit price is always **CLOSE** of expiry candle
7. Countdown always starts at **01:00**
8. Max **3** concurrent running executions
9. Slot released immediately on FAILED/NO TRADE
10. Slot released at SETTLING for WIN/LOSS/REFUND
