# Phase 23.5 — Persistence Failure Fix & Upstream Investigation

**Date**: 2026-07-18
**Status**: COMPLETE
**Scope**: OTC persistence/lifecycle only — Live FOREX untouched

---

## 1. Root Cause Summary

```
saveSignal() fails (auth / Supabase error / exception)
  ↓
placeholder.persistenceStatus = 'FAILED'
placeholder.id = tempId (NEVER replaced — line 437 SKIPPED)
  ↓
tick() → processState():
  WAITING_FOR_ENTRY → PENDING (no persistence check — BUG)
  PENDING → SETTLING (no persistence check — BUG)
  ↓
resolveSettlement() → updateSignalResult(tempId) → "Signal not found"
  ↓
FAILED
```

**The fix: three layers of protection prevent tempId from ever reaching SETTLING.**

---

## 2. Exact Code Changes

### Change 1 — Fix saveSignal error message masking (signals.ts:141-145)

**Before:**
```ts
console.error('[getSignalPerformance] Error:', errorObj.message);
return { success: false, error: 'Failed to fetch signal performance' };
```

**After:**
```ts
console.error('[saveSignal] Error:', errorObj.message);
return { success: false, error: 'Failed to save signal' };
```

**Why**: Copy-paste bug masked real errors. Now the error tag and message match the function name.

---

### Change 2 — Immediate failure on saveSignal failure (OTCExecutionEngine.ts:455-461)

**Before:**
```ts
} else {
  placeholder.persistenceStatus = 'FAILED';
  placeholder.persistenceError = saveRes.error || 'Failed to persist signal';
  this.emit();
}
```

**After:**
```ts
} else {
  placeholder.persistenceStatus = 'FAILED';
  placeholder.persistenceError = saveRes.error || 'Failed to persist signal';
  placeholder.status = 'FAILED';
  placeholder.noTradeReason = saveRes.error || 'Signal persistence failed';
  placeholder.removeAt = this.now() + this.config.autoRemoveDelayMs;
  this.emit();
}
```

**Why**: The moment saveSignal fails, the signal is terminated immediately. It never waits for entry time to continue the lifecycle. The catch block (lines 463-469) receives the same treatment.

---

### Change 3 — Guard WAITING_FOR_ENTRY → PENDING (OTCExecutionEngine.ts:248-256)

**Before:**
```ts
case 'WAITING_FOR_ENTRY': {
  const entryMs = new Date(record.entryTime).getTime();
  if (now >= entryMs) {
    this.transitionToPending(record);
    return 'PENDING';
  }
  return 'WAITING_FOR_ENTRY';
}
```

**After:**
```ts
case 'WAITING_FOR_ENTRY': {
  const entryMs = new Date(record.entryTime).getTime();
  if (now >= entryMs) {
    if (record.persistenceStatus === 'SAVED') {
      this.transitionToPending(record);
      return 'PENDING';
    }
    record.status = 'FAILED';
    record.noTradeReason = record.persistenceError || 'Signal persistence failed';
    record.removeAt = this.now() + this.config.autoRemoveDelayMs;
    return 'FAILED';
  }
  return 'WAITING_FOR_ENTRY';
}
```

**Why**: Entry barrier. If persistence hasn't confirmed by entry time, the signal fails instead of continuing. Blocking WAITING → PENDING prevents PENDING → SETTLING → updateSignalResult(tempId).

---

### Change 4 — Guard PENDING → SETTLING (OTCExecutionEngine.ts:262-268)

**Before:**
```ts
case 'PENDING': {
  const expiryMs = new Date(record.expiryTime).getTime();
  if (now >= expiryMs) {
    this.transitionToSettling(record);
    return 'SETTLING';
  }
  return 'PENDING';
}
```

**After:**
```ts
case 'PENDING': {
  const expiryMs = new Date(record.expiryTime).getTime();
  if (now >= expiryMs) {
    if (record.persistenceStatus !== 'SAVED') {
      record.status = 'FAILED';
      record.noTradeReason = record.persistenceError || 'Signal not persisted';
      record.removeAt = this.now() + this.config.autoRemoveDelayMs;
      return 'FAILED';
    }
    this.transitionToSettling(record);
    return 'SETTLING';
  }
  return 'PENDING';
}
```

**Why**: Defense in depth. Even if a record somehow reaches PENDING without being saved, it cannot enter SETTLING. This is the last barrier before `updateSignalResult(tempId)`.

---

## 3. Lifecycle Before vs After

### Before (broken)

```
SCANNING
  ↓
WAITING_FOR_ENTRY  ← saveSignal may have failed silently
  ↓  (tick: WAITING_FOR_ENTRY → PENDING — NO PERSISTENCE CHECK)
PENDING
  ↓  (tick: PENDING → SETTLING — NO PERSISTENCE CHECK)
SETTLING
  ↓
resolveSettlement() → updateSignalResult(tempId) → "Signal not found"
  ↓
FAILED (Settlement timeout / Signal not found)
```

### After (fixed)

```
SCANNING
  ↓
WAITING_FOR_ENTRY
  │  ┌─ persistenceStatus == 'SAVED'  → PENDING ✓
  │  └─ persistenceStatus == 'FAILED' → FAILED ✗ (GUARD)
  ↓
PENDING
  │  ┌─ persistenceStatus == 'SAVED'  → SETTLING ✓
  │  └─ persistenceStatus != 'SAVED'  → FAILED ✗ (GUARD)
  ↓
SETTLING  ← ONLY reached by persisted signals with real dbId
  ↓
resolveSettlement() → updateSignalResult(dbId) → WIN/LOSS ✓
```

---

## 4. Why tempId Can No Longer Reach SETTLING

| Layer | Check | Effect |
|-------|-------|--------|
| 1 — saveSignal failure handler | `else` branch sets `status='FAILED'` | Signal terminated at source |
| 2 — WAITING_FOR_ENTRY | `persistenceStatus === 'SAVED'` required | Entry barrier |
| 3 — PENDING | `persistenceStatus !== 'SAVED'` blocks | Safety barrier before SETTLING |

**Three independent barriers.** No single code path can bypass all three.

---

## 5. Verification Scenarios

### Scenario A — saveSignal succeeds

```
saveSignal() → { success: true, signalId: "uuid-123" }
  ↓
placeholder.id = "uuid-123" (tempId replaced)
placeholder.persistenceStatus = 'SAVED'
  ↓
WAITING_FOR_ENTRY → PENDING → SETTLING
  ↓
resolveSettlement → updateSignalResult("uuid-123", price) → WIN/LOSS ✓
```

### Scenario B — saveSignal fails (auth error)

```
saveSignal() → { success: false, error: 'Unauthorized' }
  ↓
placeholder.persistenceStatus = 'FAILED'
placeholder.status = 'FAILED'
placeholder.noTradeReason = 'Unauthorized'
  ↓
tick() → status is 'FAILED' → no further transitions
  ↓
resolveSettlement() NEVER called
updateSignalResult() NEVER called
✓ Signal shows as FAILED (Unauthorized) in UI
```

### Scenario C — saveSignal fails (Supabase error)

```
saveSignal() → { success: false, error: 'Failed to save signal' }
  ↓
placeholder.persistenceStatus = 'FAILED'
placeholder.status = 'FAILED'
placeholder.noTradeReason = 'Failed to save signal'
  ↓
tick() → status is 'FAILED' → no further transitions
  ↓
resolveSettlement() NEVER called
updateSignalResult() NEVER called
✓ Signal shows as FAILED (Failed to save signal) in UI
```

### Scenario D — saveSignal succeeds but delayed past entry time

```
saveSignal() takes 65 seconds (network latency)
entryTime reached at 30 seconds
  ↓
tick() at 30s: persistenceStatus = 'SAVING' (in-flight)
  ↓
persistenceStatus !== 'SAVED' → FAILED (Signal persistence failed)
  ↓
saveSignal() completes at 65s: { success: true, signalId: "uuid-456" }
  ↓
placeholder already FAILED — server action result ignored
✓ Signal is FAILED — DB may contain orphan PENDING record (acceptable edge case)
```

---

## 6. Upstream Investigation: Why saveSignal() Fails

### 6A — Failure modes identified

| Failure mode | Where | Error returned |
|---|---|---|
| Session expired / not logged in | `checkApproved()` line 107-108 | `'Unauthorized'` |
| User not approved | `checkApproved()` line 81 | `'Unauthorized'` |
| Supabase insert error | `supabase.from('signals').insert()` line 114-133 | `'Failed to save signal'` |
| Exception (any) | `catch (err)` line 141 | `'Failed to save signal'` (previously mislabeled `'Failed to fetch signal performance'`) |

### 6B — RLS analysis

**Signals table policies** (from `supabase/migrations/001_otc_signal_tables.sql`):
- `"Authenticated users can insert signals"`: `FOR INSERT TO authenticated WITH CHECK (true)` — allows any authenticated user to insert
- `"Authenticated users can update signal results"`: `FOR UPDATE TO authenticated USING (true) WITH CHECK (true)` — allows any authenticated user to update any row

**RLS is NOT the cause.** The insert policy grants full access to all authenticated users.

### 6C — CHECK constraint analysis

**Current constraint** (from migration 001):
```sql
CHECK (result IN ('PENDING', 'WIN', 'LOSS'))
```

The `saveSignal()` INSERT uses `result: 'PENDING'` which is valid. The `updateSignalResult()` UPDATE uses `'WIN'` or `'LOSS'` which are also valid. **Constraint is not the cause.**

### 6D — Most likely root cause

Based on code analysis:

1. **Session/auth issue** — Most probable cause for production failures. The OTC engine runs in the browser via singleton module imported by `useOTCExecution.ts` (`'use client'`). Server actions (`saveSignal`, `updateSignalResult`) execute via fetch/RPC, requiring cookies. If:
   - Session cookie expires mid-session
   - Background tab loses cookie access
   - Rate limiting blocks the request
   → `checkApproved()` returns `{ ok: false }` → `'Unauthorized'`

2. **Network/timeout** — Supabase API transient failures

3. **The copy-paste bug** (now fixed) masked real exceptions, making determination harder

### 6E — Recommended monitoring

To identify the exact production cause, add before implementing further `saveSignal` improvements:

- Log the `saveRes.error` value in the failure handler (already accessible as `saveRes.error || 'Failed to persist signal'` in `noTradeReason`)
- Check Supabase logs for failed INSERT queries from the application
- Verify session expiry time against average user session duration

---

## 7. Regression Checklist

| Check | Status | Evidence |
|-------|--------|----------|
| Signal History unchanged | ✓ | No changes to queries, views, or timeline |
| Performance unchanged | ✓ | No new DB calls; existing fire-and-forget pattern preserved |
| Admin unchanged | ✓ | No changes to admin routes or API |
| Timeline unchanged | ✓ | Terminal records loaded from DB unaffected |
| Refresh recovery unchanged | ✓ | `loadActiveSignals()` / `loadTerminalSignals()` require `persistenceStatus: 'SAVED'` |
| Countdown unchanged | ✓ | Timer logic in page.tsx untouched |
| Live FOREX untouched | ✓ | `src/lib/forex-execution/` not modified |
| Market Data untouched | ✓ | `src/lib/market-data/` not modified |
| Settlement logic unchanged | ✓ | `resolveSettlement()`, `updateSignalResult()`, price comparison untouched |
| WIN/LOSS/REFUND unchanged | ✓ | Result assignment logic untouched |
| TypeScript errors | 0 new | Only 12 pre-existing script errors (baseline from Phase 19) |

---

## 8. Files Modified

| File | Lines | Change |
|------|-------|--------|
| `src/app/actions/signals.ts` | 142-144 | Fix copy-paste error tag and message in catch block |
| `src/lib/otc/OTCExecutionEngine.ts` | 248-256 | Guard WAITING_FOR_ENTRY → PENDING with `persistenceStatus` check |
| `src/lib/otc/OTCExecutionEngine.ts` | 262-268 | Guard PENDING → SETTLING with `persistenceStatus` check |
| `src/lib/otc/OTCExecutionEngine.ts` | 455-468 | Immediate FAILED on saveSignal failure + catch block |

## 9. Files NOT Modified

- `src/lib/forex-execution/` — zero changes
- `src/lib/market-data/` — zero changes
- `src/lib/otc/otc-execution-types.ts` — zero changes (no new status needed)
- Signal Engine — untouched
- ProviderManager — untouched
- Indicator Engine — untouched
- NO_TRADE thresholds — untouched
- Settlement calculation — untouched
- Countdown — untouched
- Membership — untouched
