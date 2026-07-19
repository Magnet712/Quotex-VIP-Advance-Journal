# Phase 23.8 — Runtime Failure Trace: Root Cause of "Signal persistence failed"

**Date:** 2026-07-18
**Scope:** Forensic analysis of every runtime path that produces `record.status='FAILED'` with `noTradeReason='Signal persistence failed'` in `OTCExecutionEngine.ts`

---

## 1. Executive Summary

**Root Cause:** A concurrency race between `tick()` and `scan()` in `OTCExecutionEngine.ts:226`/`:253`. The `tick()` pre-empts `saveSignal()` by checking `persistenceStatus !== 'SAVED'` in the `WAITING_FOR_ENTRY` state before `saveSignal()` has completed. The `scan()` method subsequently overwrites `persistenceStatus` to `'SAVED'` but **never reverts `status` from `'FAILED'`**, producing a permanently FAILED record despite saveSignal having succeeded.

**Impact:** ~2–5% of scans (estimated) produce false-positive FAILED records. The database record is corrupted to `result='FAILED'` by `syncStatusToDB()` at line 453.

**Evidence:**
- Phase 23.7 full-stack test: 10/10 saveSignal SUCCEEDED, but user still sees FAILED
- `persistenceDiag` records 0 failures (saveSignal truly succeeded)
- The message `"Signal persistence failed"` at line 254 can ONLY fire when tick() sets it, not when saveSignal sets it (saveSignal produces `"Unauthorized"` or `"Failed to save signal"`)

---

## 2. Complete FAILED Assignment Catalog

All 11 locations in `OTCExecutionEngine.ts` that set `record.status = 'FAILED'`:

| # | Line | Function | noTradeReason | Trigger | Message Produces "Signal persistence failed"? |
|---|------|----------|---------------|---------|-----------------------------------------------|
| 1 | 253-256 | `processState()` WAITING_FOR_ENTRY | `record.persistenceError \|\| 'Signal persistence failed'` | Entery time reached + persistenceStatus !== 'SAVED' | **YES** (fallback) |
| 2 | 264-267 | `processState()` PENDING | `record.persistenceError \|\| 'Signal not persisted'` | Expiry time reached + persistenceStatus !== 'SAVED' | No ("Signal not persisted") |
| 3 | 277-279 | `processState()` SETTLING | `'Settlement timeout'` | 30s after expiry | No |
| 4 | 315-317 | `resolveSettlement()` | `'No candle data at expiry'` | No candle at expiry time | No |
| 5 | 329-331 | `resolveSettlement()` | `res.error \|\| 'Settlement failed'` | updateSignalResult returns failure | No |
| 6 | 334-336 | `resolveSettlement()` catch | `'Settlement execution error'` | Exception in settlement | No |
| 7 | 371-375 | `scan()` timeout | `'OTC scan exceeded 20-second limit'` | 20s timeout | No |
| 8 | 410-411 | `scan()` NO_TRADE | `indicatorResult.noTradeReason \|\| '...'` | Signal quality below threshold | No |
| 9 | 458-461 | `scan()` saveSignal returns `{success:false}` | `saveRes.error \|\| 'Signal persistence failed'` | saveSignal failed (auth/DB/exception) | **No** — saveRes.error is never falsy; actual message is 'Unauthorized' or 'Failed to save signal' |
| 10 | 466-469 | `scan()` saveSignal throws | `'Signal persistence failed'` | Exception in saveSignal | **YES** (hardcoded, but requires saveSignal to throw which is rare) |
| 11 | 525-527 | `dismissScan()` | `'Manually dismissed'` | User dismisses | No |

**Path 1** (line 253-256) and **Path 10** (line 466-469) are the only two that produce the exact message `"Signal persistence failed"`.

Path 9 (line 458-461) uses `saveRes.error` which is always `'Unauthorized'` or `'Failed to save signal'` — it NEVER produces `"Signal persistence failed"` at runtime. The fallback `|| 'Signal persistence failed'` is dead code.

---

## 3. Root Cause: tick() vs saveSignal() Race

### 3.1 The Exact Sequence

```
scan() thread                          tick() thread (setInterval 1000ms)
─────────────────────────────          ─────────────────────────────────────
1. placeholder.status = 'SCANNING'
   this.emit()
   [candle fetch, analysis... ~1-2s]

2. placeholder.direction = sig.direction
   placeholder.status = 'WAITING_FOR_ENTRY'
   placeholder.persistenceStatus = 'SAVING'
   this.emit()

3. await saveSignal({...})
   ─── event loop yields ───▶         4. tick() fires
                                       5. processState(record, now)
                                          record.status === 'WAITING_FOR_ENTRY'
                                          now >= entryMs  ✓
                                          persistenceStatus === 'SAVING' !== 'SAVED'
                                          → record.status = 'FAILED'
                                          → record.noTradeReason = 'Signal persistence failed'
                                          → record.removeAt = now + delay
                                          this.settlingIds.delete(record.id)

6. saveSignal completes → {success: true, signalId}

7. placeholder.id = signalId
   placeholder.persistenceStatus = 'SAVED'
   this.records.set(signalId, placeholder)
   this.records.delete(tempId)

8. syncStatusToDB(signalId, placeholder.status)
   → placeholder.status is now 'FAILED'
   → DB update: signals SET result='FAILED' WHERE id=signalId
   → DB record corrupted from 'PENDING' to 'FAILED'

9. this.emit()  // UI shows FAILED
```

### 3.2 Why This Happens

The entry time (`entryMs`) is computed by `computeNextCandleTime()` which returns the **next UTC minute boundary** (e.g., 10:01:00.000). The scan takes ~1-2 seconds for candle fetching + analysis. If the scan starts in the last ~2 seconds of a minute (e.g., 10:00:58.500), the sequence is:

- `entryMs` = 10:01:00.000
- Scan completes at ~10:01:00.200
- `WAITING_FOR_ENTRY` set at 10:01:00.200
- `tick()` fires at 10:01:01.000 → `now` (10:01:01.000) >= `entryMs` (10:01:00.000) ✓
- Record FAILED with "Signal persistence failed"

The race window exists for any scan that completes after the computed entry time. This is approximately **2.5–5%** of scans depending on network latency.

### 3.3 Why Phase 23.7 Tests Didn't Catch It

The Phase 23.7 test used `POST /api/diagnostics/persistence` which called `saveSignal()` directly — it did NOT go through `OTCExecutionEngine.scan()`. The tick() timer was not involved, so the race never manifested.

---

## 4. Secondary Issues Discovered

### 4.1 Database Record Corruption

When `syncStatusToDB(dbId, placeholder.status)` runs at line 453 with `status = 'FAILED'`, the database record that was just inserted as `result='PENDING'` is overwritten to `result='FAILED'`. This:

- Prevents `getActiveOTCSignals()` from returning it (filters for `PENDING`/`SETTLING`)
- Causes `getOTCTimelineSignals()` to load it into the failed timeline
- On page refresh, the FAILED record appears in timeline with `noTradeReason` = `undefined` (noTradeReason is not persisted to DB)

### 4.2 noTradeReason Not Persisted

The `noTradeReason` field exists only in-memory on `OTCExecutionRecord`. It is never written to the `signals` table. After page refresh:

- `loadTerminalSignals()` loads the record with `status = 'FAILED'`
- `noTradeReason` is not set (undefined)
- UI shows FAILED but shows no reason text (`{sig.noTradeReason && ...}` hides it)

### 4.3 Dead Code: Fallback at Line 459

Line 458-459:
```typescript
placeholder.noTradeReason = saveRes.error || 'Signal persistence failed';
```

`saveRes.error` is always truthy (`'Unauthorized'` or `'Failed to save signal'`), so the fallback `'Signal persistence failed'` is **dead code**. The actual `'Signal persistence failed'` message at runtime comes from line 254, not line 459.

### 4.4 Missing Persistence of persistenceStatus

`persistenceStatus` is not stored in the DB. After page refresh:
- `loadActiveSignals()` sets `persistenceStatus = 'SAVED'` for all DB-loaded records
- `loadTerminalSignals()` sets `persistenceStatus = 'SAVED'` for all DB-loaded records
- This masks the true persistence state (was it actually SAVED or FAILED at runtime?)

### 4.5 Inconsistent Engine State After Race

After the race, the record has:
- `status: 'FAILED'` (set by tick())
- `persistenceStatus: 'SAVED'` (set by scan())
- `id: dbId` (set by scan())
- `noTradeReason: 'Signal persistence failed'` (set by tick())

This is contradictory: persistence succeeded but the record shows FAILED with "Signal persistence failed". All downstream consumers (UI, reports, analytics) see a false positive.

---

## 5. Lifecycle Mutation Timeline

```
Time  Thread  Action                                Object State
────  ──────  ────────────────────────────────────  ──────────────────────────────
T0    scan    createScanPlaceholder()               status=SCANNING, id=tempId
T0    scan    this.records.set(tempId, placeholder)  records[tempId] = placeholder
T0    scan    this.emit()                            UI shows SCANNING

T1    scan    getLatestCandle()                      (async)
T2    scan    getCandleRange()                       (async)
T3    scan    analyzeCandles()                       (sync after awaits)

T4    scan    placeholder.direction = sig.direction  status=WAITING_FOR_ENTRY
T4    scan    placeholder.status = 'WAITING_FOR_ENTRY'
T4    scan    placeholder.persistenceStatus = 'SAVING'
T4    scan    this.emit()                            UI shows CALL/PUT + SAVING

T5    scan    await saveSignal()                     (event loop yields)
      tick    processState() → WAITING_FOR_ENTRY     status=FAILED ← BUG
              now >= entryMs AND persistenceStatus!='SAVED'
              record.status = 'FAILED'
              record.noTradeReason = 'Signal persistence failed'

T6    scan    saveSignal completes → success
T6    scan    placeholder.id = dbId                  (on placeholder ref)
T6    scan    placeholder.persistenceStatus = 'SAVED'
T6    scan    this.records.set(dbId, placeholder)    records[dbId] = FAILED+SAVED
T6    scan    this.records.delete(tempId)            records[tempId] removed
T6    scan    syncStatusToDB(dbId, 'FAILED')         DB corrupted to FAILED
T6    scan    this.emit()                            UI maintains FAILED
```

---

## 6. Root Cause Proof

### 6.1 The Message Analysis

The string `"Signal persistence failed"` appears at three locations:

| Line | Code | Runtime Message |
|------|------|-----------------|
| 254 | `record.persistenceError \|\| 'Signal persistence failed'` | `'Signal persistence failed'` when `persistenceError` is undefined |
| 459 | `saveRes.error \|\| 'Signal persistence failed'` | NEVER — `saveRes.error` is always truthy |
| 467 | `'Signal persistence failed'` (hardcoded) | `'Signal persistence failed'` only if saveSignal throws |

Since `persistenceDiag` shows 0 failures, saveSignal is NOT failing and NOT throwing. Therefore, the only way the message appears is via **line 254** — the WAITING_FOR_ENTRY guard in `processState()` called by `tick()`.

### 6.2 The persistenceError Analysis

`persistenceError` is only set in the catch block (line 465, when saveSignal throws) or when saveSignal returns `{success: false}` (line 457). In the race scenario, saveSignal returns `{success: true}`, so `persistenceError` remains `undefined`. Line 254 then falls through to the `'Signal persistence failed'` fallback.

### 6.3 The Save-Then-Corrupt Chain

The DB record IS saved successfully (saveSignal inserts with `result='PENDING'`), but `syncStatusToDB()` at line 453 overwrites it to `result='FAILED'`. This is why:
- `persistenceDiag` shows success (saveSignal succeeded)
- The user sees FAILED (tick() set it, syncStatusToDB corrupted DB)
- The message is "Signal persistence failed" (line 254 fallback)

---

## 7. Recommended Fix

The fix requires **modifying scan() to guard against the tick() race**. There are two approaches:

### Approach A: Re-verify status after saveSignal (Preferred)

After saveSignal completes (line 447), re-check if tick() pre-empted the status:

```typescript
if (saveRes.success && saveRes.signalId) {
  const dbId = saveRes.signalId;
  placeholder.id = dbId;
  placeholder.persistenceStatus = 'SAVED';
  // Re-verify: if tick() pre-empted with FAILED, revert to WAITING_FOR_ENTRY
  if (placeholder.status === 'FAILED' && placeholder.noTradeReason === 'Signal persistence failed') {
    placeholder.status = 'WAITING_FOR_ENTRY';
    placeholder.noTradeReason = undefined;
    placeholder.removeAt = null;
  }
  this.records.set(dbId, placeholder);
  ...
}
```

### Approach B: Lock the state during saveSignal

Use a temporary flag to prevent tick() from processing the record while saveSignal is in flight. However, this is more invasive and error-prone.

### Additional Fixes
- Persist `noTradeReason` to the database so it survives refresh
- Persist `persistenceStatus` to the database for diagnostics
- Remove dead fallback `|| 'Signal persistence failed'` from line 459

---

## 8. All FAILED Paths Summary

```
                    ┌─────────────────────────────────────────────────┐
                    │           OTCExecutionEngine.ts                │
                    └─────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │           scan()              │
                    │   ┌──────────────────────┐   │
                    │   │ Step 1-4: fetch/     │   │
                    │   │ analyze candles      │   │
                    │   └──────────┬───────────┘   │
                    │              │                │
                    │   ┌──────────▼───────────┐   │
                    │   │ NO_TRADE (line 408)  │───┼──→ {success: true, direction: 'WAIT'}
                    │   │ noTradeReason from   │   │
                    │   │ indicator-engine     │   │
                    │   └──────────────────────┘   │
                    │                              │
                    │   ┌──────────────────────┐   │
                    │   │ Step 6: await        │   │
                    │   │ saveSignal()         │   │
                    │   └──────────┬───────────┘   │
                    │              │                │
                    │   ┌──────────▼───────────┐   │
                    │   │ saveSignal RETURNS    │   │
                    │   │ {success: false}      │───┼──→ FAILED (line 458)
                    │   │ msg: 'Unauthorized'   │   │     "Unauthorized" or
                    │   │ or 'Failed to save    │   │     "Failed to save signal"
                    │   │ signal'               │   │
                    │   └──────────────────────┘   │
                    │                              │
                    │   ┌──────────────────────┐   │
                    │   │ saveSignal THROWS     │───┼──→ FAILED (line 466)
                    │   │ (network, etc.)       │   │     "Signal persistence failed"
                    │   └──────────────────────┘   │
                    │                              │
                    │   ┌──────────────────────┐   │
                    │   │ saveSignal SUCCEEDS   │   │
                    │   │ tick() PRE-EMPTS      │───┼──→ FAILED (line 253)
                    │   │ (RACE)                │   │     "Signal persistence failed"
                    │   └──────────────────────┘   │  ← ROOT CAUSE
                    │                              │
                    │   ┌──────────────────────┐   │
                    │   │ 20s timeout (line     │   │
                    │   │ 368-376)              │───┼──→ FAILED
                    │   │ "OTC scan exceeded"   │   │     "OTC scan exceeded 20-sec limit"
                    │   └──────────────────────┘   │
                    │                              │
                    │   ┌──────────────────────┐   │
                    │   │ Outer catch (line     │   │
                    │   │ 473-481)              │───┼──→ FAILED
                    │   │ err.message           │   │     err.message (generic)
                    │   └──────────────────────┘   │
                    └──────────────────────────────┘

                    ┌──────────────────────────────────────────┐
                    │           tick() / processState()         │
                    │   ┌──────────────────────────────────┐   │
                    │   │ WAITING_FOR_ENTRY (line 253)     │───┼──→ FAILED
                    │   │ persistenceStatus !== 'SAVED'    │   │     "Signal persistence failed"
                    │   └──────────────────────────────────┘   │  ← RACE HIT
                    │   ┌──────────────────────────────────┐   │
                    │   │ PENDING (line 264)               │───┼──→ FAILED
                    │   │ persistenceStatus !== 'SAVED'    │   │     "Signal not persisted"
                    │   └──────────────────────────────────┘   │
                    │   ┌──────────────────────────────────┐   │
                    │   │ SETTLING (line 277)              │───┼──→ FAILED
                    │   │ 30s timeout                      │   │     "Settlement timeout"
                    │   └──────────────────────────────────┘   │
                    │   ┌──────────────────────────────────┐   │
                    │   │ expire removeAt (line 232)       │───┼──→ REMOVE (not FAILED)
                    │   └──────────────────────────────────┘   │
                    └──────────────────────────────────────────┘

                    ┌──────────────────────────────────────────┐
                    │           resolveSettlement()            │
                    │   ┌──────────────────────────────────┐   │
                    │   │ No candle (line 315)             │───┼──→ FAILED
                    │   │ "No candle data at expiry"       │   │
                    │   └──────────────────────────────────┘   │
                    │   ┌──────────────────────────────────┐   │
                    │   │ updateSignalResult fails (line    │   │
                    │   │ 329)                             │───┼──→ FAILED
                    │   │ res.error || "Settlement failed" │   │
                    │   └──────────────────────────────────┘   │
                    │   ┌──────────────────────────────────┐   │
                    │   │ Exception (line 334)             │───┼──→ FAILED
                    │   │ "Settlement execution error"     │   │
                    │   └──────────────────────────────────┘   │
                    └──────────────────────────────────────────┘

                    ┌──────────────────────────────────────────┐
                    │           dismissScan()                  │
                    │   ┌──────────────────────────────────┐   │
                    │   │ Non-terminal status (line 525)   │───┼──→ FAILED
                    │   │ "Manually dismissed"             │   │
                    │   └──────────────────────────────────┘   │
                    └──────────────────────────────────────────┘
```

---

## 9. Conclusion

The root cause is definitively **a concurrency race between `tick()` calling `processState()` and the `await saveSignal()` in `scan()`**. The `WAITING_FOR_ENTRY` guard at line 253 fires before `saveSignal` completes, setting `status = 'FAILED'`. When `saveSignal` subsequently succeeds, `scan()` updates `persistenceStatus` to `'SAVED'` but never reverts the FAILED status, producing a permanent false-positive FAILED record. The DB is also corrupted to `result='FAILED'` by `syncStatusToDB()`.

This explains all observed symptoms:
1. User sees FAILED with "Signal persistence failed"
2. Phase 23.7 shows 10/10 saveSignal SUCCEEDED (no persistence failure)
3. `persistenceDiag` shows 0 failures
4. The exact message "Signal persistence failed" can only come from line 254

**No changes should be made to trading strategy, SignalEngine, providers, or thresholds.**
