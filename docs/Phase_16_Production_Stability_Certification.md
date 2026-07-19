# Phase 16 — Production Stability Certification

**Date:** 2026-07-15  
**Scope:** Manual Scan → Timeline → Settlement lifecycle, React state management, server action orchestration, statistics sync  
**Verdict:** **NOT READY** for UI/UX enhancement phase — 5 confirmed bugs must be resolved first (3 critical, 2 high)

---

## Executive Summary

Three parallel sub-agent analyses (React state, statistics/DB sync, signals.ts server actions) plus manual code review uncovered **10 distinct issues** across the signals codebase. **5 are confirmed bugs** (3 critical, 2 high), and **5 are medium/low concerns** that should be addressed before UI/UX work begins.

The Phase 15 fixes are **functionally correct** in intent, but the `settlementSeen` implementation contains a React effect cleanup bug that **silently breaks the 3-second popup auto-dismiss**. Two unhandled promise rejection sites risk process warnings or crashes under serverless runtimes. Two correctness bugs (double settlement, global abort race) can corrupt signal state under concurrent access.

---

## Scoring

| Category | Score | Notes |
|----------|-------|-------|
| **State management** | 6/10 | `settlementSeen` effect bug breaks auto-dismiss; stale closure risk in 2 `setTimeout(0)` calls (guarded by isMounted — OK) |
| **Network/data sync** | 8/10 | Fire-and-forget pattern correct; optimistic updates before DB; no duplicate requests confirmed |
| **Error resilience** | 5/10 | Critical: unhandled rejections in 2 `Promise.race` sites; TOCTOU race in provider singleton |
| **Performance** | 8/10 | Scan latency ~1-2s; batch debounce 10ms; only concern is unbounded stats query |
| **Memory/leaks** | 9/10 | 3 timer cleanup gaps but guarded by isMounted; global maps never evicted (medium risk) |
| **Correctness** | 6/10 | Double-settlement guard missing; global abort race for concurrent scans; `pairPerfMap` stale after page load |

**Overall Production Readiness Score: 7.0 / 10**

---

## CRITICAL Bugs (must fix before Phase 17)

### C1 — `settlementSeen` state-based cleanup clears 3s popup timer (page.tsx:2173-2182)

**Severity:** Critical — Regression of Phase 15 fix  
**Description:** The 3-second popup auto-dismiss timer is immediately cleared by React's effect cleanup.  
**Root cause:** `settlementSeen` is both a state variable AND a dependency of the effect. When `setSettlementSeen(true)` is called inside the effect:
1. Effect runs: `hasSettled=true`, `settlementSeen=false` → enters block → sets timer + returns cleanup
2. React re-renders with `settlementSeen=true`
3. Effect dependencies changed → React runs **cleanup** → `clearTimeout(timer)` ← timer is killed
4. Effect re-runs: `hasSettled=true`, `settlementSeen=true` → block skipped → no new timer

**Result:** Popup never auto-dismisses. Stays indefinitely until page navigation.

**Fix:** Move `settlementSeen` to a `useRef` or remove it entirely:
```ts
useEffect(() => {
  if (hasSettled) {
    const timer = setTimeout(() => {
      if (onExpiredRef.current) onExpiredRef.current();
    }, 3000);
    return () => clearTimeout(timer);
  }
}, [hasSettled]);
```

### C2 — Unhandled promise rejection in scan `Promise.race` (signals.ts:1269)

**Severity:** Critical — Process stability  
**Description:** When the 20-second timeout wins the `Promise.race`, `analysisPromise` is still running. The `abortController.abort()` call (line 1035) causes `analysisPromise` to reject, but nobody awaits or catches that rejection.

**Trigger:** Any scan that hits the 20-second timeout.  
**Impact:** Node.js emits `unhandledRejection` warnings. In strict modes (Next.js edge/serverless with `--unhandled-rejection=strict`), terminates the process.

**Fix:** Attach a catch handler to the loser of the race:
```ts
analysisPromise.catch(() => { /* timeout already handled */ });
```

### C3 — Unhandled promise rejection in settlement `Promise.race` (signals.ts:1469-1475)

**Severity:** Critical — Process stability  
**Description:** Same pattern as C2 but in `settleManualSignal`. When the 15-second timeout wins, the original `fetchPromise` (from `manager.fetchHistoricCandles`) is leaked. If the provider's fetch rejects after the timeout, it becomes an unhandled rejection.

**Trigger:** Settlement fetch timeout (~15s), where the underlying provider request eventually fails.  
**Impact:** Same as C2 — unhandled rejection warnings or process termination.

**Fix:** Attach `.catch()` to the loser in the race, or use `Promise.withRace` (ES2025) with abort signal propagation.

---

## HIGH Bugs (must fix before Phase 17)

### H1 — Double settlement guard missing (signals.ts:1514-1520)

**Severity:** High — Data correctness  
**Description:** `settleManualSignal` UPDATE lacks `.eq('status', 'PENDING')` guard. If called twice for the same signal (race condition from timer + expired recovery, or manual retry), the second call overwrites the first settlement result.

**Scenario:**
1. Timer fires `settleExpiredSignal` → calls `settleManualSignal` → UPDATE succeeds with WIN
2. Concurrent recovery flow (page.tsx:1076) calls `settleManualSignal` again for same signal
3. Second UPDATE sees id matches → overwrites WIN with a different result

**Fix:** Add status guard to the UPDATE:
```ts
.eq('id', signalId)
.eq('status', 'PENDING')
```

### H2 — `g.__currentScanAbort` global race condition (signals.ts:1027)

**Severity:** High — Concurrent access correctness  
**Description:** `g.__currentScanAbort` is a module-level global variable shared across all scanLiveMarketAsset invocations. Concurrent scans (from different users, or rapid sequential clicks) overwrite each other's abort controller.

**Impact:**
- Batch queue (line 825) checks `g.__currentScanAbort?.signal.aborted` — may see a different scan's abort state
- Cleanup (line 1332) clears the global only if it matches `scanAbortController` — but race may leave stale reference

**Fix:** Use a `Map<string, AbortController>` keyed by scan ID, or store per-scan abort controller in a WeakMap scoped to the request context.

---

## MEDIUM Issues (fix before Phase 17 recommended)

### M1 — `pairPerfMap` never refreshed after page load (page.tsx:1064-1066)

**Description:** Set once from `getPairPerformance()` during initialization. Never re-fetched when new scans complete. The accuracy percentage shown for each pair becomes increasingly stale.  
**Impact:** Users see inaccurate pair accuracy data in the UI.  
**Fix:** Update `pairPerfMap` in `refreshStats()` or after each completed scan.

### M2 — Unbounded stats queries (signals.ts:410-434)

**Description:** `getSignalPerformance()` fetches ALL rows from `manual_signal_audits` and `signals` tables with no date range filter. As the database grows (50k+ rows), this query will slow down proportionally.  
**Impact:** Eventual page load slowdown. Monthly API credit waste (TwelveData calls also unbounded).  
**Fix:** Add `.gte('created_at', lastNdays)` filter (e.g., 90 days).

### M3 — TOCTOU race in `getProviderManager` singleton (signals.ts:782-786)

**Description:** Two concurrent calls to `getProviderManager()` can both see `g.__providerManager` as null and create separate `ProviderManager` instances. The second instance silently replaces the first (no cleanup).  
**Impact:** Rare double-provider initialization, leaked first instance.  
**Fix:** Use a promise-based singleton:
```ts
if (!g.__providerInit) {
  g.__providerInit = initProviderManager().then(mgr => { g.__providerManager = mgr; return mgr; });
}
return g.__providerInit;
```

### M4 — Unused `__batchTimeout` type safety (signals.ts:748-749, 809-813)

**Description:** `g.__batchTimeout` is initialized as `null` but assigned a `setTimeout` return value (`NodeJS.Timeout`). The `g` variable is typed as `Record<string, any>`, so no compile-time error, but the type mismatch indicates the batch debounce could be redesigned.  
**Impact:** Low — function-correct at runtime.  
**Fix:** Define a proper interface for the global state bag.

### M5 — `setTimeout(..., 0)` without explicit cleanup (page.tsx:681, 702)

**Description:** Two `setTimeout(0)` calls inside the live_market effect (lines 681, 702) are not tracked for cleanup. They are guarded by `isMounted` set to false in the effect cleanup, so they won't call setState on unmounted components.  
**Impact:** Low — purely a code quality concern. Timer still fires on unmounted component but `isMounted` prevents state update.  
**Fix:** Store timer IDs in variables and clear them in the cleanup function for consistency.

---

## Pre-existing Issues (not blocking)

- **TypeScript errors in other dashboard pages** (`getUserAccessState()` union type) — unrelated to signals/timeline/settlement code.
- **`console.log` instrumentation** in signals.ts (scan timing, timeout arming, etc.) — intentional for diagnostics.

---

## Resolution Plan

### Blocking (must fix before Phase 17 UI/UX):

| ID | File | Priority | Est. Effort |
|----|------|----------|-------------|
| C1 | page.tsx:2173-2182 | Critical | 5 min |
| C2 | signals.ts:1269 | Critical | 2 min |
| C3 | signals.ts:1469-1475 | Critical | 2 min |
| H1 | signals.ts:1514-1520 | High | 2 min |
| H2 | signals.ts:1027,825,1332 | High | 15 min |

### Non-blocking (fix before Phase 17 recommended):

| ID | File | Priority | Est. Effort |
|----|------|----------|-------------|
| M1 | page.tsx:1064-1066 | Medium | 10 min |
| M2 | signals.ts:410-434 | Medium | 5 min |
| M3 | signals.ts:782-786 | Medium | 10 min |
| M4 | signals.ts:748-749 | Low | 5 min |
| M5 | page.tsx:681,702 | Low | 5 min |

---

## Final Verdict

**NOT READY for UI/UX enhancement (Phase 17).**

Three critical bugs (C1, C2, C3) directly impact user experience and process stability. Two high-severity bugs (H1, H2) can corrupt signal settlement data under concurrent access. These five bugs must be resolved and verified before UI/UX work begins.

Estimated fix time: **~45 minutes** for all blocking issues.

Once fixed, re-certification should confirm a score of **8.5+/10** before proceeding to Phase 17.
