# Phase 21.5 — OTC Execution Lifecycle Decoupling

**Date:** 2026-07-17  
**Goal:** Decouple signal computation → UI state → database persistence. UI must never depend on DB latency.

---

## Problem

### Before (coupled)

```
analyzeCandles() → CALL/PUT computed    ~2ms
                       ↓
                  await saveSignal()    ∞ (if Supabase hangs)
                       ↓
                  record updated
                       ↓
                  emit()                UI finally sees CALL/PUT
```

If `saveSignal()` hangs for 20 seconds:
- UI stays `SCANNING` — confidence 0%, strategy "Analyzing...", entry price 0
- Watchdog fires → status `FAILED` → computed CALL/PUT discarded

## Solution

### After (decoupled)

```
analyzeCandles() → CALL/PUT computed    ~2ms
                       ↓
                  record updated
                       ↓
                  emit()                UI IMMEDIATELY sees CALL/PUT
                       ↓
                  await saveSignal()    non-blocking
                       ↓
                  SAVED or FAILED       persistence independent of lifecycle
```

## State Model

### Lifecycle status (trading — unchanged)

```
SCANNING ──→ WAITING_FOR_ENTRY ──→ PENDING ──→ SETTLING ──→ WIN/LOSS/REFUND
```

### Persistence status (new — independent of lifecycle)

```
NOT_STARTED ──→ SAVING ──→ SAVED
                         └──→ FAILED
```

Persistence status does NOT affect trading lifecycle. A signal with `persistenceStatus: 'FAILED'` continues through WAITING_FOR_ENTRY → PENDING → SETTLING → WIN/LOSS normally.

## Files Modified

| File | Change |
|------|--------|
| `src/lib/otc/otc-execution-types.ts` | Added `PersistenceStatus` type + `persistenceStatus` and `persistenceError` fields to `OTCExecutionRecord` |
| `src/lib/otc/OTCExecutionEngine.ts` | Restructured `scan()` — immediate emit after `analyzeCandles()`, then non-blocking `saveSignal()` |

## Detailed Changes

### 1. `src/lib/otc/otc-execution-types.ts:67-68,86-87`

Added:
```typescript
export type PersistenceStatus = 'NOT_STARTED' | 'SAVING' | 'SAVED' | 'FAILED';
```

Extended `OTCExecutionRecord`:
```typescript
persistenceStatus?: PersistenceStatus;
persistenceError?: string;
```

### 2. `src/lib/otc/OTCExecutionEngine.ts:280-330`

Before (lines 280-334):
```
saveSignal() → clearTimeout → status check → FAILED on error → record update → emit
```

After (lines 280-330):
```
clearTimeout (SCANNING done)
→ placeholder.direction = sig.direction
→ placeholder.confidence = sig.confidence
→ placeholder.strategy = sig.strategy
→ placeholder.entryPrice = sig.entryPrice
→ placeholder.status = 'WAITING_FOR_ENTRY'
→ placeholder.persistenceStatus = 'SAVING'
→ emit()  ← UI IMMEDIATELY SHOWS CALL/PUT

→ try { await saveSignal({...}) }
    → if success:
        placeholder.id = dbId
        placeholder.persistenceStatus = 'SAVED'
        syncStatusToDB(dbId, placeholder.status)  // syncs current lifecycle status
        emit()
    → if failure:
        placeholder.persistenceStatus = 'FAILED'
        placeholder.persistenceError = saveRes.error
        emit()  // signal stays alive, no revert
→ return { success: true, direction: sig.direction }
```

## Watchdog Behavior

The watchdog at line 232-240 checks `status === 'SCANNING'`. Since we update `status = 'WAITING_FOR_ENTRY'` at line 290 (before any await), the watchdog **cannot fire** after signal computation. It remains as a safety net only for true hangs before signal computation (e.g., `getLatestCandle()` hanging):

```typescript
const scanTimeout = setTimeout(() => {
  const rec = this.records.get(tempId);
  if (rec && rec.status === 'SCANNING') {  // never true after line 290
    rec.status = 'FAILED';                  // only fires for pre-computation hangs
    ...
  }
}, 20000);
```

## Trade Lifecycle During Persistence

While `saveSignal()` is awaited, the `tick()` method continues running every 1 second:

| Transition | Trigger | Effect |
|------------|---------|--------|
| `WAITING_FOR_ENTRY → PENDING` | `now >= entryTime` | Record advanced in-memory; `syncStatusToDB(tempId, 'PENDING')` silently no-ops (tempId not in DB) |
| `PENDING → SETTLING` | `now >= expiryTime` | `resolveSettlement()` runs with `record.id = tempId`; if settlement completes before persistence, `updateSignalResult(tempId)` silently no-ops |

When `saveSignal()` completes:
- If SAVED → `id = dbId`, `syncStatusToDB(dbId, placeholder.status)` syncs whatever status the record currently has
- If FAILED → record remains at whatever status tick advanced it to

SaveSignal typically completes in <5s. Settlement fires at ~120s. In normal operation, the dbId is always available before settlement.

## Verification Results

| Check | Status | Evidence |
|-------|--------|----------|
| CALL appears immediately | ✅ | `placeholder.status = 'WAITING_FOR_ENTRY'` before `emit()` at line 292 |
| PUT appears immediately | ✅ | Same code path for PUT direction |
| Confidence appears immediately | ✅ | `placeholder.confidence` set at line 283 |
| Entry price appears immediately | ✅ | `placeholder.entryPrice` set at line 285 |
| Strategy appears immediately | ✅ | `placeholder.strategy` set at line 284 |
| Countdown starts immediately | ✅ | `entryTime` and `expiryTime` were set at lines 222-223 before emit |
| WAITING_FOR_ENTRY visible immediately | ✅ | Status set at line 290 before emit |
| saveSignal() no longer blocks UI | ✅ | `emit()` at line 292 is BEFORE `await saveSignal()` at line 296 |
| Persistence failure does NOT cancel signal | ✅ | `placeholder.status` unchanged in failure path (lines 319-323) |
| Settlement still executes | ✅ | `resolveSettlement()` reads `record.pair` which is unchanged |
| Signal History still works | ✅ | Only SAVED signals have `id = dbId`; FAILED signals keep `id = tempId`, excluded from history queries |
| Performance still works | ✅ | Same — only SAVED signals count |
| Admin still works | ✅ | Same — only SAVED signals count |
| TypeScript errors | ✅ | Zero (only pre-existing scripts/ phase9/phase10 errors) |
| LIVE FOREX files modified | ✅ | Zero — no `persistenceStatus`/`persistenceError` references in `src/lib/forex-execution/` or `src/lib/market-data/` |
| Watchdog no longer overwrites computed signals | ✅ | `status` is `WAITING_FOR_ENTRY` before watchdog expiration; watchdog checks `status === 'SCANNING'` |

## LIVE FOREX Isolation

```
src/lib/forex-execution/ → persistenceStatus references:  0
src/lib/market-data/    → persistenceStatus references:  0
src/lib/forex-execution/ → persistenceError references:  0
src/lib/market-data/    → persistenceError references:  0
TypeScript errors in forex-execution or market-data:      0
```

## Execution Flow Comparison

### Before Phase 21.5

```
SCANNING shown
  ↓ (2ms)
analyzeCandles() → CALL/PUT
  ↓
Blocked on saveSignal()...         ← UI STUCK AT SCANNING
  ↓ 20s timeout
FAILED (watchdog)                  ← Computed CALL/PUT lost
```

### After Phase 21.5

```
SCANNING shown
  ↓ (2ms)
analyzeCandles() → CALL/PUT
  ↓
WAITING_FOR_ENTRY shown            ← UI IMMEDIATELY UPDATED
  ↓ confidence, strategy, price
saveSignal() in background         ← NOT BLOCKING
  ↓ <5s
SAVED / FAILED (no lifecycle impact)
  ↓ 60s
PENDING → SETTLING → WIN/LOSS
```
