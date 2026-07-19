# Phase 21.1 — OTC Pair Normalization Investigation

**Date:** 2026-07-17  
**Scope:** Investigation only — no fixes, no edits  
**Bug:** `SimulatedFeed: unknown pair "AUDUSD"` on every OTC scan

---

## 1. Complete Value Trace

Following `"AUDUSD"` through the entire pipeline:

### Step 1 — UI Button Click

**File:** `src/app/dashboard/signals/page.tsx:1030`
```typescript
onClick={() => otc.scan(p.short)}
```

| Property | Value |
|----------|-------|
| `p` | Object from `OTC_PAIRS` array (generateSignal.ts:32-67) |
| `p.short` | **`"AUDUSD"`** |
| `p.symbol` | `"AUD/USD"` (never accessed at this call site) |

The UI sends the `short` format — no slash, no normalization.

### Step 2 — useOTCExecution.scan()

**File:** `src/app/dashboard/signals/useOTCExecution.ts:54-56`
```typescript
const scan = useCallback(async (pairShort: string) => {
    return otcEngine.scan(pairShort);
}, []);
```

| Variable | Value |
|----------|-------|
| `pairShort` | **`"AUDUSD"`** |
| Passed to `scan()` | **`"AUDUSD"`** — passed through verbatim |

**This is the normalization removal point.** Before Phase 21, this method did:
```typescript
const idx = OTC_PAIRS.findIndex(p => p.short === pairShort);
if (idx === -1) return { success: false, error: 'Unknown pair' };
const seed = Math.floor(Date.now() / 60000);
return otcEngine.scan(pairShort, generateSignal, idx, seed);
```

The old code still passed `pairShort` (short format) to `scan()`, BUT `generateSignalFn` was invoked with `(pairIdx, seed)` — it never used the `pair` string for provider lookups. The `pair` parameter was only stored as a label in the placeholder record. The Phase 21 simplification removed the `idx` computation, meaning the symbol-format lookup (`OTC_PAIRS[idx].symbol`) was also removed.

### Step 3 — OTCExecutionEngine.scan()

**File:** `src/lib/otc/OTCExecutionEngine.ts:207-208`
```typescript
async scan(
    pair: string
): Promise<...>
```

| Parameter | Value |
|-----------|-------|
| `pair` | **`"AUDUSD"`** |

The engine stores this in the placeholder record and passes it directly to the OTC Router.

### Step 4 — getLatestCandle() called

**File:** `src/lib/otc/OTCExecutionEngine.ts:240`
```typescript
const routerResult = await getLatestCandle(pair, '1m');
```

| Argument | Value |
|----------|-------|
| `pair` | **`"AUDUSD"`** |
| `timeframe` | `"1m"` |

### Step 5 — OTC Router getLatestCandle()

**File:** `src/lib/otc/index.ts:54-80`
```typescript
export async function getLatestCandle(
    pair: string,
    timeframe = '1m'
): Promise<CandleRouterResult> {
```

| Parameter | Value |
|-----------|-------|
| `pair` | **`"AUDUSD"`** |

The Router reads `signal_mode`, and since it defaults to `"SIMULATION"` (or `OTCFeedProvider` throws), it reaches line 78:

```typescript
const candle = await simulatedFeed.getLatestCandle(pair, timeframe);
```

Passes **`"AUDUSD"`** to SimulatedFeed.

### Step 6 — SimulatedFeed.getLatestCandle()

**File:** `src/lib/otc/simulated_feed.ts:108-114`
```typescript
async getLatestCandle(pair: string, timeframe = '1m'): Promise<OTCCandle> {
    const now = new Date();
    const minuteSeed = Math.floor(Date.now() / 60000);
    const candleTs = new Date(Math.floor(now.getTime() / 60000) * 60000);
    return buildSimulatedCandle(pair, minuteSeed, candleTs);
}
```

| Parameter | Value |
|-----------|-------|
| `pair` | **`"AUDUSD"`** |

Passes **`"AUDUSD"`** to `buildSimulatedCandle()`.

### Step 7 — buildSimulatedCandle() — THE CRASH

**File:** `src/lib/otc/simulated_feed.ts:66-73`
```typescript
function buildSimulatedCandle(
    pair: string,
    minuteSeed: number,
    candleTimestamp: Date
): OTCCandle {
    const config = PAIR_BASE_PRICES[pair];
    if (!config) {
        throw new Error(`SimulatedFeed: unknown pair "${pair}"`);
    }
```

| Lookup | Value |
|--------|-------|
| `PAIR_BASE_PRICES["AUDUSD"]` | **`undefined`** |
| `PAIR_BASE_PRICES["AUD/USD"]` | `{ base: 0.65200, pip: 5 }` |

→ `throw new Error('SimulatedFeed: unknown pair "AUDUSD"')`

### Step 8 — Settlement (same issue)

**File:** `src/lib/otc/OTCExecutionEngine.ts:172`
```typescript
const candle = await getCandleAtTime(record.pair, expiryTime);
```

Since `record.pair` was set to `"AUDUSD"` during `scan()`, settlement also passes the short format to `getCandleAtTime()`, which ultimately reaches `SimulatedFeed.getCandleRange("AUDUSD", ...)`, and crashes at the same `PAIR_BASE_PRICES` lookup.

---

## 2. Supported Pair Formats

### OTC_PAIRS array (generateSignal.ts:32-67)

| Field | Example | Format |
|-------|---------|--------|
| `symbol` | `"AUD/USD"` | Slash-separated (34 pairs) |
| `short` | `"AUDUSD"` | Concatenated (34 pairs) |

### PAIR_BASE_PRICES map (simulated_feed.ts:24-59)

| Key | Example | Format |
|-----|---------|--------|
| Key | `"AUD/USD"` | **Slash-separated** (34 pairs) |

### Provider interface (types.ts:36)

```typescript
getLatestCandle(pair: string, timeframe?: string): Promise<OTCCandle>;
```

The type definition says **e.g. `"EUR/USD OTC"`** — the slash format. The interface itself has no enforced format; the contract is implicit.

---

## 3. Root Cause

### File: `src/app/dashboard/signals/useOTCExecution.ts:54-56`

**The pair format divergence occurs at this line, where the `pairShort` value is passed verbatim to the engine without conversion to the format expected by the data providers.**

### The conversion that was removed

Before Phase 21, the pipeline was:
```
UI (short: "AUDUSD")
  → OTC_PAIRS.findIndex(p => p.short === pairShort)  → idx
  → generateSignal(pairIdx, seed)
    → OTC_PAIRS[pairIdx].symbol  → "AUD/USD"  (used internally)
    → OTC_PAIRS[pairIdx].base    → 0.65200    (used for price jitter)
```

The `generateSignal` function acted as an **implicit pair resolver** — it received an index, not a pair string, and looked up the symbol/base internally from `OTC_PAIRS`. The SimulatedFeed was never called, so the format mismatch didn't surface.

After Phase 21:
```
UI (short: "AUDUSD")
  → otcEngine.scan("AUDUSD")     ← no index, no conversion
  → getLatestCandle("AUDUSD")    ← passed verbatim to provider
  → PAIR_BASE_PRICES["AUDUSD"]   ← KEY NOT FOUND → throws
```

**The pair normalization layer (`OTC_PAIRS[pairIdx].symbol`) was removed when `generateSignalFn` was replaced, and nothing was added to convert `short` format to `symbol` format before calling the OTC Router.**

---

## 4. Summary

| # | Checkpoint | File:Line | Value | Status |
|---|-----------|-----------|-------|--------|
| 1 | UI button value | `page.tsx:1030` | `"AUDUSD"` | Short format |
| 2 | useOTCExecution.scan() parameter | `useOTCExecution.ts:54` | `"AUDUSD"` | Passed through |
| 3 | otcEngine.scan() parameter | `OTCExecutionEngine.ts:208` | `"AUDUSD"` | Passed through |
| 4 | getLatestCandle() argument | `OTCExecutionEngine.ts:240` | `"AUDUSD"` | Passed to Router |
| 5 | OTC Router parameter | `index.ts:55` | `"AUDUSD"` | Routed to SimulatedFeed |
| 6 | SimulatedFeed parameter | `simulated_feed.ts:108` | `"AUDUSD"` | Passed to builder |
| 7 | PAIR_BASE_PRICES lookup | `simulated_feed.ts:71` | `undefined` | **CRASH** |
| 8 | Settlement (same path) | `OTCExecutionEngine.ts:172` | `"AUDUSD"` | Would crash at same point |

- **Supported provider format:** `"AUD/USD"` (slash-separated, `PAIR_BASE_PRICES` keys)
- **Value actually sent:** `"AUDUSD"` (concatenated, `OTC_PAIRS[i].short`)
- **Divergence file:** `src/app/dashboard/signals/useOTCExecution.ts:54-56`
- **Divergence reason:** Phase 21 removed `OTC_PAIRS[pairIdx].symbol` conversion that existed implicitly in the legacy `generateSignal` index-based lookup
- **Normalization previously existed inside:** `src/app/dashboard/signals/generateSignal.ts:94` (function `generateSignal(pairIdx, windowSeed)` → `OTC_PAIRS[pairIdx]`)
- **No normalization was added** at the `useOTCExecution → otcEngine.scan()` boundary or the `otcEngine.scan() → getLatestCandle()` boundary during Phase 21

### Affected entry points that receive the short format

| Function | File:Line | Argument | Routes to |
|----------|-----------|----------|-----------|
| `getLatestCandle(pair)` | index.ts:54 | short | `SimulatedFeed.getLatestCandle()` |
| `getCandleRange(pair, from, to)` | index.ts:124 | short | `SimulatedFeed.getCandleRange()` |
| `getCandleAtTime(pair, at)` | index.ts:89 | short | `SimulatedFeed.getCandleRange()` (via settlement) |

All three Router methods are affected because they all ultimately pass `pair` to `SimulatedFeed`, which looks up `PAIR_BASE_PRICES[pair]`.
