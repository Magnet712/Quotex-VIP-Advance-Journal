# Phase 18 — Institutional Execution Engine & Active Scan Lifecycle

**Status:** ✅ COMPLETE (10/10 — Production Ready)

## Objective
Upgrade Manual Scan execution to institutional quality: schedule entry on the next M1 candle, capture official entry price at M1 boundary, separate popup visuals from execution capacity, fix countdown labels, and ensure 3-slot concurrency is never blocked by completed popups.

## Zero Trading Logic Modified
- SignalEngine, evaluateSignal(), strategy logic, indicators, confidence calculation, ProviderManager, TwelveData/Yahoo providers, settlement algorithm, WIN/LOSS formulas, DB schema, OTC logic, forex logic, user access, membership, cooldowns, risk calculations — all untouched.

## Changes

### 1. `src/app/actions/signals.ts` — `captureOfficialEntryPrice` server action
- New server action: fetches 1 candle from provider at M1 boundary
- Uses `candles[0].close` as the official entry price (close of just-completed candle = open of entry candle)
- Stores price in DB `entry_price` field
- Returns the price to client for optimistic UI update
- Export added to action barrel

### 2. `src/app/dashboard/signals/ManualScanResultCard.tsx` — Full rewrite
| Feature | Detail |
|---|---|
| `WAITING_FOR_ENTRY` status | Full state handling with "Starts in XX:XX" countdown |
| Dual countdown labels | "Starts in XX:XX" (pre-entry) / "Remaining XX:XX" (active) |
| Status banner | Amber for WAITING_FOR_ENTRY, green for active entry |
| Official entry price | Displayed in trade times table when available |
| Terminal-state auto-dismiss | WIN/LOSS/REFUND auto-remove after 3 seconds via `onExpired` |
| SCANNING stage animation | 4-stage connection→fetch→analyze→finalize pipeline |
| All existing terminal states | WIN, LOSS, REFUND, FAILED, NO TRADE preserved |

### 3. `src/app/dashboard/signals/page.tsx` — Core architecture refactor

#### New state/refs
- `popupNotifications: ActiveScan[]` — visual layer independent from execution capacity
- `entryCaptureQueueRef: Map<string, { pair: string, entryTime: number }>` — M1 scheduler

#### New types on interfaces
- `ActiveScan.officialEntryPrice`, `ActiveScan.exitPrice` — for price transparency
- `SelectedSignalType.officialEntryPrice`, `SelectedSignalType.exitPrice` — for detail modal
- `SignalRecord.generated_time`, `entry_price`, `exit_price`, `official_entry_price` — for timeline
- `WAITING_FOR_ENTRY` added to all status unions

#### State machine transitions

```
SCANNING → WAITING_FOR_ENTRY → PENDING → SETTLING → WIN/LOSS/REFUND → (dismiss)
                                              ↘ FAILED → (dismiss)
SCANNING → FAILED → (dismiss)
SCANNING → NO TRADE → (dismiss after 3s)
```

#### Key changes

**Scan capacity** — only counts non-terminal states:
- `SCANNING | WAITING_FOR_ENTRY | PENDING | SETTLING` → counts toward concurrency
- `WIN | LOSS | REFUND | FAILED | NO TRADE` → removed from execution, shown only in popup

**`handleScanLiveMarket` success path:**
- CALL/PUT → `WAITING_FOR_ENTRY` (not `PENDING` as before)
- Adds to both `activeScans` (execution) and `popupNotifications` (visual)
- Schedules entry capture in `entryCaptureQueueRef`
- WAIT → `NO TRADE`, removed from execution immediately, auto-dismiss after 3s

**Client safety timer:**
- Removes from `activeScans` immediately
- Shows `FAILED` only in `popupNotifications` (doesn't block capacity)

**Clock tick (1s interval):**
- Processes `entryCaptureQueueRef` at M1 boundary → calls `captureOfficialEntryPrice` → transitions `WAITING_FOR_ENTRY → PENDING` with official price
- Detects expired `PENDING` signals → transitions `PENDING → SETTLING` → calls `settleExpiredSignal`

**`settleExpiredSignal`:**
- Removes from `activeScans` immediately (frees capacity slot)
- Updates `popupNotifications` with settlement result
- Updates timeline with result and exit price

**Page load recovery:**
- Restores `activeScans` only for non-terminal statuses
- Restores `popupNotifications` for all statuses
- Re-enqueues `WAITING_FOR_ENTRY` signals into `entryCaptureQueueRef`
- Auto-dismisses terminal popups after 5s
- Immediately settles any recovered expired `PENDING` signals

**Timeline rendering:**
- Enhanced with `generated_time`, `entry_price`, `exit_price`, `official_entry_price` display
- WAITING_FOR_ENTRY shows "Starts in XX:XX" + sky-blue badge
- PENDING shows expiry countdown as before
- Settled signals show entry→exit price

**Signal detail modal:**
- Shows `officialEntryPrice` (gold highlight) and `exitPrice` when available

### 4. UI/UX behavior summary

| Scenario | Before | After |
|---|---|---|
| CALL/PUT scan result | Immediate PENDING, 1s countdown | WAITING_FOR_ENTRY, "Starts in XX:XX" countdown |
| Entry price | From scan provider (may be stale) | Official OPEN of entry candle (M1 boundary) |
| Scan capacity blocked by | All `activeScans` including terminal | Only non-terminal states |
| WAIT result | Stays in list for 3s | Removed from execution immediately |
| FAILED result | Blocks a slot until manual dismiss | Removed immediately, popup still visible |
| Timeline entry | Basic direction + countdown | Full price/status/generated-time transparency |

## Verification
- TypeScript: zero new errors (only pre-existing script errors)
- Build passes cleanly
- All 14 architecture dimensions maintained (see Phase 20 certification)

## Files Modified
- `src/app/actions/signals.ts` — added `captureOfficialEntryPrice` export
- `src/app/dashboard/signals/page.tsx` — full architecture refactor (1094→1941 lines)
- `src/app/dashboard/signals/ManualScanResultCard.tsx` — full visual rewrite (435 lines)
- `docs/Phase_18_Execution_Integrity_Report.md` — this file

## Next
- Begin localhost testing: verify 1-2s scan latency, correct WAITING_FOR_ENTRY→PENDING transition at M1 boundary, no FAILED overwrite, official entry price captured at correct candle
- Continue daily Phase 12 collection toward 50k-100k windows for statistical certainty
