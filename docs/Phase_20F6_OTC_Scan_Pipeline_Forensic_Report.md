# Phase 20F.6 — OTC Scan Pipeline: Forensic Investigation

**Date:** 2026-07-17  
**Scope:** Trace actual code paths vs. expected pipeline  
**Rule:** Investigation only — no fixes, no edits  

---

## 1. Expected Pipeline (from Phase 20F.5)

```
ANALYZE button
  → otc.scan(pair)
    → otcEngine.scan()
      → [1] Concurrency slot reserved (pendingReservations++)
      → [2] canScan() check passed
      → [3] Placeholder created (status: SCANNING)
      → [4] Requesting latest OTC candle
      → [5] OTC Router entered
      → [6] OTC Provider request started
      → [7] OTC Provider response received
      → [8] Candle validated
      → [9] generateSignal() entered
      → [10] generateSignal() completed
      → [11] saveSignal() entered
      → [12] saveSignal() completed
      → [13] WAITING_FOR_ENTRY transition
```

## 2. Actual Code Path (Reconstructed from Source)

### 2.1 Entry Point

```
useOTCExecution.scan(pairShort)
  → OTCExecutionEngine.scan(pair, generateSignal, pairIdx, seed)
```

**Source:** `src/lib/hooks/useOTCExecution.ts` → passes `generateSignal` imported from `src/components/signals/generateSignal.ts`

### 2.2 Engine Scan Method — Line-by-Line Trace

| Step | Line(s) | Action | Async? | Elapsed |
|------|---------|--------|--------|---------|
| [1] | 212 | `pendingReservations++` | Sync | ~0ms |
| [2] | 213-216 | `canScan()` check | Sync | ~0ms |
| [3] | 218-228 | Create placeholder (`status: 'SCANNING'`), store, emit | Sync | ~0ms |
| — | 230 | `setTimeout(20000)` — arm timeout | Sync | ~0ms |
| [4]-[8] | ❌ | **NOT PRESENT** — no candle request, no OTC Router, no provider | — | — |
| [9] | 241 | `generateSignalFn(pairIdx, seed)` | **Sync** | ~0ms |
| [10] | 241 | Returns immediately with CALL/PUT/WAIT or null | Sync | ~0ms |
| [11] | 253-266 | `await saveSignal({...})` | **Async** | **variable** |
| [12] | 268 | `clearTimeout(scanTimeout)` | Sync | after saveSignal |
| [13] | 283-306 | Status → `WAITING_FOR_ENTRY` or `PENDING`, emit | Sync | after saveSignal |

**Source:** `src/lib/otc/OTCExecutionEngine.ts:210-317`

### 2.3 What `generateSignal()` Actually Does

File: `src/components/signals/generateSignal.ts`

- **Zero async operations** — no `async/await`, no `fetch`, no `getLatestCandle()`
- **Zero imports** from OTC module, Supabase, or any data source
- **Purely deterministic math:** seeded RSI, stochastic, SMA, wick calculations from a seed integer
- Called with `(pairIdx, seed)` — both are integers, no pair name string involved until mapping back

**Conclusion:** `generateSignal()` **cannot block**. It returns synchronously in <1ms.

### 2.4 What `saveSignal()` Actually Does

File: `src/app/actions/signals.ts:89-129`

```typescript
export async function saveSignal(input: SaveSignalInput) {
  const { ok } = await checkApproved();            // 2 Supabase calls
  if (!ok) return { success: false, error: 'Unauthorized' };

  const supabase = await createClient();            // 1 cookies() call
  const { data, error } = await supabase           // 1 Supabase call
    .from('signals').insert({...}).select('id').single();

  if (error) return { success: false, error: 'Failed to save signal' };
  return { success: true, signalId: data.id };
}
```

Network operations performed:
1. `checkApproved()` → `supabase.auth.getUser()` — **HTTP to Supabase Auth**
2. `checkApproved()` → `supabase.from('users').select('status')` — **HTTP to Supabase DB**
3. `supabase.from('signals').insert(...)` — **HTTP to Supabase DB**

Total: **3 sequential HTTP round-trips** to Supabase.

### 2.5 Timeout Mechanism

```typescript
const scanTimeout = setTimeout(() => {          // Line 230
  const rec = this.records.get(tempId);
  if (rec && rec.status === 'SCANNING') {       // Still SCANNING after 20s?
    rec.status = 'FAILED';
    rec.noTradeReason = 'OTC scan exceeded 20-second limit';
    rec.removeAt = this.now() + this.config.autoRemoveDelayMs;
    this.emit();                                // UI shows FAILED
  }
}, 20000);
```

Fixed in Phase 20F.5: timeout is now set **after** placeholder creation and **before** `saveSignal()`, and cleared **after** `saveSignal()` returns (line 268).

## 3. Root Cause Analysis

### 3.1 The Only Possible Blocking Point

The interval between `[11]` (saveSignal entered) and `[12]` (saveSignal completed) is the **sole async gap** in the pipeline. If this interval exceeds 20 seconds, the timeout fires.

### 3.2 Why `saveSignal()` Might Exceed 20s

| Cause | Mechanism | Evidence in Code |
|-------|-----------|-----------------|
| Supabase Auth hang | `getUser()` makes HTTP request to Supabase Auth endpoint | `signals.ts:72` |
| Supabase DB hang | Profile query or insert times out | `signals.ts:75-79`, `signals.ts:97-116` |
| Serverless cold start | Next.js server action cold start + Supabase connection init | Implicit in `createClient()` |
| Auth cookie resolution | `cookies()` reads from `next/headers` | `server.ts:5` |
| Network latency | Client→Next.js→Supabase round-trips × 3 | Architectural |

### 3.3 What Is NOT the Cause

| Hypothesis | Verdict | Evidence |
|------------|---------|----------|
| OTC Provider hangs | ❌ NOT CALLED | `OTCExecutionEngine.ts:241` calls `generateSignalFn` directly |
| OTC Router | ❌ NOT CALLED | No import of `otc/index.ts` in engine |
| SimulatedFeed | ❌ NOT CALLED | No import in engine or generateSignal |
| Candle fetch | ❌ NOT CALLED | `generateSignal()` is pure math |
| Race condition | ❌ Fixed in 20F.5 | Timeout cleared after `saveSignal()` returns (line 268) |

## 4. Timeline Mismatch

### Expected vs. Actual Steps

```
Expected [1-13]          Actual [1-13]           Status
────────────────────────────────────────────────────────
[1]  Concurrency slot    ✅ Same
[2]  canScan() check     ✅ Same
[3]  Placeholder SCANNING ✅ Same
[4]  Request OTC candle  ❌ DOES NOT EXIST       — not in code path
[5]  OTC Router entered  ❌ DOES NOT EXIST       — not in code path
[6]  OTC Provider request ❌ DOES NOT EXIST      — not in code path
[7]  OTC Provider resp.  ❌ DOES NOT EXIST       — not in code path
[8]  Candle validated    ❌ DOES NOT EXIST       — not in code path
[9]  generateSignal()    ✅ Same (sync, instant)
[10] generateSignal done ✅ Same
[11] saveSignal() entered ✅ Same
[12] saveSignal() done   ⚠ BLOCKING POINT       — only async gap
[13] WAITING_FOR_ENTRY   ✅ After saveSignal
```

## 5. OTC Infrastructure Status

| Component | File | Status |
|-----------|------|--------|
| `OTCFeedProvider` (live) | `src/lib/otc/otc_feed.ts` | Stub — always throws `OTCFeedUnavailableError` |
| `SimulatedFeed` | `src/lib/otc/simulated_feed.ts` | Working — synchronous math, but NOT integrated into scan pipeline |
| `OTC Router` | `src/lib/otc/index.ts` | Working — routes between live/simulated feeds, but NOT integrated into scan pipeline |
| `CandleProvider` interface | `src/lib/otc/types.ts` | Defined, implemented by both feeds |

**Key insight:** The entire OTC data layer (`otc_feed.ts`, `simulated_feed.ts`, `index.ts`) is **structurally complete but functionally disconnected** from the scan pipeline. The `generateSignal()` function bypasses the OTC data layer entirely.

## 6. Conclusion

**SCANNING → FAILED (Timeout) occurs exclusively because `saveSignal()` does not resolve within the 20-second window.**

The expected pipeline steps [4]-[8] (OTC candle request → Router → Provider → response → validation) **do not exist in the actual code path**. They represent a desired future state where the scan pipeline fetches live OTC candles. Currently:

- `generateSignal()` generates signals from pure mathematics with no data dependency
- The OTC data layer (Router + feeds) is fully built but disconnected from the scan pipeline
- `saveSignal()` bears the entire async burden of the pipeline

### Recommendation (Out of Scope)

If production scans hang at SCANNING:
1. Measure `saveSignal()` round-trip time — if >5s, address Supabase connectivity or add a client-side timeout
2. Consider integrating `SimulatedFeed.getLatestCandle()` into the scan pipeline to validate candle data before signal generation
3. When a live OTC provider is connected, the OTC Router is ready to be plugged in without code changes elsewhere
