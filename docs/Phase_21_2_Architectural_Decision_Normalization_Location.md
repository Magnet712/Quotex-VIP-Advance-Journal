# Phase 21.2 — Architectural Decision: Pair Normalization Location

**Date:** 2026-07-17  
**Scope:** Analysis only — no fixes, no edits

---

## Problem

The UI sends `pairShort` (`"AUDUSD"`) but providers expect `symbol` (`"AUD/USD"`). Where should the conversion live?

## Candidates

### A. UI (page.tsx)

Convert before calling `scan()`:
```typescript
const sym = OTC_PAIRS.find(p => p.short === p.short)?.symbol;
otc.scan(sym ?? p.short);
```

| Pros | Cons |
|------|------|
| Simplest possible fix | Couples UI layout to provider pair format |
| No changes below the call site | Every call site must remember to convert |
| | If provider format changes, every UI element needs updating |
| | Violates separation of concerns — UI shouldn't know about data layer formats |

### B. useOTCExecution (hook)

Convert inside the `scan` callback before calling the engine:
```typescript
const scan = useCallback(async (pairShort: string) => {
    const pair = OTC_PAIRS.find(p => p.short === pairShort)?.symbol ?? pairShort;
    return otcEngine.scan(pair);
}, []);
```

| Pros | Cons |
|------|------|
| Keeps UI clean — page.tsx doesn't change | Hook now owns provider format knowledge |
| Single conversion point for all callers | `OTC_PAIRS` import must stay in the hook |
| Engine always receives canonical format | If provider format changes, the hook must change |
| | The engine's `scan()` signature accepts `pair: string` with no documented format contract |

### C. OTCExecutionEngine (engine)

Convert inside `scan()` before calling the Router:
```typescript
async scan(pair: string) {
    const canonical = OTC_PAIRS.find(p => p.short === pair)?.symbol ?? pair;
    const routerResult = await getLatestCandle(canonical, '1m');
```

| Pros | Cons |
|------|------|
| Engine guarantees canonical symbols to all downstream calls | Engine now depends on `OTC_PAIRS` (a UI-level constant) |
| Settlement also benefits — `record.pair` stored as canonical | The scan signature still accepts a freeform `string` — no type safety |
| One conversion point for signal gen AND settlement | Mixes concerns: engine should execute scans, not resolve pair formats |

### D. OTC Router (index.ts)

Convert inside the Router before passing to providers:
```typescript
const OTC_PAIR_MAP: Record<string, string> = {
    EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', ...
};

export async function getLatestCandle(pair: string, timeframe = '1m') {
    const canonical = OTC_PAIR_MAP[pair] ?? pair;
    // ... use canonical with providers
```

| Pros | Cons |
|------|------|
| Single centralized normalization for ALL providers | Router becomes responsible for pair format — a new concern |
| Providers never see non-canonical formats | Must maintain a map or conversion function |
| Settlements also benefit — `getCandleAtTime` and `getCandleRange` route through here | The map duplicates data from `OTC_PAIRS` and `PAIR_BASE_PRICES` |
| If a new provider uses a different format, only the Router changes | Currently undocumented — no pair of pair format contract exists on the interface |

### E. SimulatedFeed (provider)

Convert inside `buildSimulatedCandle` or `getLatestCandle`:
```typescript
const PAIR_ALIASES: Record<string, string> = {
    EURUSD: 'EUR/USD', ...
};
const resolvedPair = PAIR_ALIASES[pair] ?? pair;
const config = PAIR_BASE_PRICES[resolvedPair];
```

| Pros | Cons |
|------|------|
| Simplest local fix — the crash point | Every future provider must duplicate the same normalization |
| Provider owns its format | `OTCFeedProvider` would also need the same logic |
| No architectural changes needed above | Defeats the Router abstraction — callers still send freeform strings |

---

## Comparison Matrix

| Criterion | A (UI) | B (Hook) | C (Engine) | D (Router) | E (Provider) |
|-----------|--------|----------|------------|------------|--------------|
| Fixes the crash | ✅ | ✅ | ✅ | ✅ | ✅ |
| Single point of conversion | ❌ | ✅ | ✅ | ✅ | ❌ (per provider) |
| UI stays clean | ❌ | ✅ | ✅ | ✅ | ✅ |
| Future providers benefit | ❌ | ❌ | ❌ | ✅ | ❌ |
| No format knowledge leaked upward | ❌ | ❌ | ❌ | ✅ | ✅ |
| No duplicate maps | — | 1 map | 1 map | 1 map | N maps |
| Fits existing architecture | ✅ | ✅ | ✅ | ✅ | ❌ (new concern) |
| Settlement also fixed | ❌ | ✅ | ✅ | ✅ | ❌ (separate provider path) |

---

## Recommendation

### Option D — OTC Router — is architecturally correct.

Reasons:

1. **The Router is the single entry point for all providers.** Pair normalization at this layer means `SimulatedFeed`, `OTCFeedProvider`, and any future provider never receive a non-canonical pair string. The fix applies once and covers `getLatestCandle`, `getCandleRange`, and `getCandleAtTime` — all three Router methods.

2. **The Router already owns format contracts.** The `getLatestCandle` JSDoc says `@param pair - e.g. "EUR/USD"`, documenting the canonical format. Normalization enforces this contract at the boundary where it matters.

3. **No knowledge leaks upward.** The UI, hook, and engine can continue using whatever pair format is natural for their layer. The Router absorbs the conversion.

4. **Settlement is automatically fixed.** `getCandleAtTime` routes through the Router and benefits from the same normalization at no extra cost.

5. **The normalization map can derive from `PAIR_BASE_PRICES`** — iterate keys, generate short-form aliases. No separate maintenance.

### Rejected alternatives

- **Option E (provider)**: Duplicates logic across every provider. If `OTCFeedProvider` is connected later, it needs the same conversion. Violates DRY.
- **Option C (engine)**: The engine is an execution orchestrator, not a data formatter. Adding format logic blurs its responsibility.
- **Option B (hook)**: Feasible but places provider-format knowledge at the UI layer boundary. A future non-hook caller (e.g., a cron or API) would need its own conversion.
- **Option A (UI)**: Spreads conversion across every button click — brittle and untestable.

### Implementation sketch (not to be coded now)

The Router would maintain a reverse-map derived from the canonical pair list:
```
"AUDUSD" → "AUD/USD"
"EURUSD" → "EUR/USD"
...
```

At the top of each public Router function (`getLatestCandle`, `getCandleRange`, `getCandleAtTime`), before any provider call:

```typescript
const canonical = PAIR_SHORT_TO_SYMBOL[pair] ?? pair;
```

Then use `canonical` for all subsequent provider calls. No other file changes needed.
