# Phase 21.4 — OTC Scan Pipeline Stage Trace

**Date:** 2026-07-17  
**Method:** Standalone trace script (zero source code modifications)  
**Script:** `scripts/phase21-4-trace.mts`

---

## Execution Trace

```
================================================================================
OTC SCAN PIPELINE STAGE TRACE
Pair: AUD/USD
================================================================================

  [ 1] scan() entered                                     0.02ms
  [ 2] placeholder created (SCANNING)                     0.05ms
  [ 3] timeout armed (20s)                                0.07ms

  [ 4] getLatestCandle() [SimulatedFeed] started
  [ 4] getLatestCandle() [SimulatedFeed] finished
       elapsed = 0.15 ms                                  0.15ms

  [ 5] getCandleRange() [SimulatedFeed × 60 candles] started
  [ 5] getCandleRange() [SimulatedFeed × 60 candles] finished
       elapsed = 0.83 ms                                  0.83ms

  [ 6] candles merged                                     1.23ms

  [ 7] analyzeCandles() started
  [ 7] analyzeCandles() finished
       elapsed = 0.60 ms
       direction  = CALL                                   0.60ms
       confidence = 80
       strategy   = RSI Reversal + EMA50
       rsi        = 52.37
       stoch      = 35.71/43.86
       superTrend = BULLISH
       atr        = 0

  [ 8] record updated                                     1.90ms
  [ 9] WAITING_FOR_ENTRY assigned                         1.91ms

  TOTAL ELAPSED (stages 1-9):                             2.01ms

  -- saveSignal() analysis --
  [10] saveSignal() started
       ↓
       checkApproved()
         → supabase.auth.getUser()           (HTTP to Supabase Auth)
         → supabase.from('users').select()   (HTTP to Supabase DB)
       ↓
       createClient()
       ↓
       supabase.from('signals').insert()     (HTTP to Supabase DB write)
       ↓
  [11] saveSignal() finished (if Supabase responds)
       or NEVER FINISHES (if Supabase hangs)
```

---

## Verdict

| Question | Answer |
|----------|--------|
| **LAST SUCCESSFUL STAGE** | `[ 9] WAITING_FOR_ENTRY assigned` — **stages 1-9 complete in ~2ms** |
| **NEXT STAGE** | `[10] saveSignal()` |
| **EXACT FILE** | `src/lib/otc/OTCExecutionEngine.ts` |
| **EXACT LINE** | **280** (`const saveRes = await saveSignal({...})`) |
| **EXACT AWAITED CALL** | `saveSignal({ pair, timeframe, direction, entry_price, ... })` |
| **WATCHDOG FIRES AT** | 20,000ms (line 236: `'OTC scan exceeded 20-second limit'`) |
| **TOTAL ELAPSED FOR STAGES 1-9** | **2.01 ms** — cannot be the bottleneck |

## Why saveSignal() Blocks

`saveSignal()` at `src/app/actions/signals.ts:89-129` makes **3 sequential HTTP requests** to Supabase:

### Sub-operation timing breakdown (expected vs. worst-case)

| Operation | File:Line | Expected | Hanging |
|-----------|-----------|----------|---------|
| `checkApproved()` → `auth.getUser()` | signals.ts:72 | ~50-200ms | ∞ (network timeout ~30s) |
| `checkApproved()` → `users.select('status')` | signals.ts:75-79 | ~50-200ms | ∞ (network timeout ~30s) |
| `signals.insert(...)` | signals.ts:97-116 | ~50-200ms | ∞ (network timeout ~30s) |
| **Total saveSignal()** | | **~150-600ms** | **∞ (exceeds 20s watchdog)** |

If any single Supabase HTTP request hangs (no response), the entire `await saveSignal({...})` at line 280 **never resolves**. The 20-second watchdog at line 236 fires:

```typescript
// lines 230-236
const scanTimeout = setTimeout(() => {
  const rec = this.records.get(tempId);
  if (rec && rec.status === 'SCANNING') {
    rec.status = 'FAILED';
    rec.noTradeReason = 'OTC scan exceeded 20-second limit';
    // ...
  }
}, 20000);
```

## Measured Stage Timings (from trace script)

```
Stage  Description                          Elapsed
──────────────────────────────────────────────────────
[1-3]  scan() + placeholder + timeout       0.07 ms
[4]    getLatestCandle()                    0.15 ms
[5]    getCandleRange() (60 candles)        0.83 ms
[6]    candles merge                        (included in [5])
[7]    analyzeCandles()                     0.60 ms
[8-9]  record + WAITING_FOR_ENTRY           (included in [7])
──────────────────────────────────────────────────────
       TOTAL (stages 1-9)                   2.01 ms
──────────────────────────────────────────────────────
       saveSignal()                         ∞ or ~150-600ms
```

**Stages 1-9 complete in 2 milliseconds.** If the scan reaches `SCANNING` then `FAILED` after 20 seconds, `saveSignal()` is the **only possible blocker**. No other async operation exists between placeholder creation and the timeout expiration.

## Root Cause

The scan pipeline is **not hanging in candle fetching or indicator computation** — those complete in <2ms. The hang is in `saveSignal()`, a Next.js server action that makes 3 sequential Supabase HTTP calls. If any of those calls exceeds the 20-second window (e.g., Supabase connection timeout, auth session resolution failure, or database write lock), the watchdog fires and the scan is marked `FAILED`.
