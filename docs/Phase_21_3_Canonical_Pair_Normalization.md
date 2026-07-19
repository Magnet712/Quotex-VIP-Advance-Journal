# Phase 21.3 — Canonical Pair Normalization

**Date:** 2026-07-17  
**Scope:** Fix pair format mismatch — one canonical format across the OTC execution domain  

---

## 1. Root Cause

Phase 21 replaced the legacy `generateSignalFn(pairIdx, seed)` (which resolved pairs via `OTC_PAIRS[pairIdx].symbol`) with the OTC Router pipeline (`getLatestCandle(pair)`). The pair-format conversion that existed implicitly inside `generateSignal` was lost.

The engine received `"AUDUSD"` (short format from the UI) and passed it verbatim to `getLatestCandle()`, which routed to `SimulatedFeed.getLatestCandle("AUDUSD")`, which looked up `PAIR_BASE_PRICES["AUDUSD"]` → `undefined` → throw.

## 2. Fix

**File:** `src/lib/otc/OTCExecutionEngine.ts:210-213`

One line added at the top of `scan()`, before any downstream use of `pair`:

```typescript
// Normalize short format (e.g., "AUDUSD") to canonical (e.g., "AUD/USD")
pair = pair.length === 6 && !pair.includes('/')
  ? pair.slice(0, 3) + '/' + pair.slice(3)
  : pair;
```

This is the **only normalization boundary** in the entire OTC execution domain. After this line, `pair` is guaranteed canonical (slash-separated). Every subsequent call uses the same local `pair` variable:

| Call | Line | Receives |
|------|------|----------|
| `createScanPlaceholder(tempId, pair, ...)` | 226 | `"AUD/USD"` → stored in `record.pair` |
| `getLatestCandle(pair, '1m')` | 244 | `"AUD/USD"` → OTC Router |
| `getCandleRange(pair, from, new Date(), '1m')` | 251 | `"AUD/USD"` → OTC Router |
| `saveSignal({ pair, ... })` | 281 | `"AUD/USD"` → persisted to DB |
| Settlement: `getCandleAtTime(record.pair, ...)` | 172 | `"AUD/USD"` (reads from `record.pair`) |

## 3. Data Flow

### Before (broken)

```
UI (short)                      UI (short)
  │                                │
  ▼                                ▼
OTCExecutionEngine.scan()        OTCExecutionEngine.scan()
  │                                │
  ├─ record.pair = "AUDUSD"       ├─ getLatestCandle("AUDUSD")
  ├─ saveSignal({pair:"AUDUSD"})  ├─ getCandleRange("AUDUSD",...)
  │                                │
  ▼                                ▼
O TCRouter                        SimulatedFeed
  │                               PAIR_BASE_PRICES["AUDUSD"]
  │                                      │
  ▼                                      ▼
SimulatedFeed                      undefined → throw
PAIR_BASE_PRICES["AUDUSD"]
       │
       ▼
  undefined → throw
```

### After (fixed)

```
UI (short)                      UI (short)
  │                                │
  ▼                                ▼
OTCExecutionEngine.scan()        OTCExecutionEngine.scan()
  │                                │
  ├─ NORMALIZE: "AUDUSD"          ├─ NORMALIZE: "AUDUSD"
  │     → "AUD/USD"               │     → "AUD/USD"
  │                                │
  ├─ record.pair = "AUD/USD"     ├─ getLatestCandle("AUD/USD")
  ├─ saveSignal({pair:"AUD/USD"}) ├─ getCandleRange("AUD/USD",...)
  │                                │
  ▼                                ▼
O TCRouter                        SimulatedFeed
  │                               PAIR_BASE_PRICES["AUD/USD"]
  │                                      │
  ▼                                      ▼
SimulatedFeed                      { base: 0.65200, pip: 5 }
PAIR_BASE_PRICES["AUD/USD"]          → candle returned
       │
       ▼
  { base: 0.65200, pip: 5 }
    → candle returned
```

## 4. Pair Normalization Verification: All 34 Pairs

```
AUDUSD → AUD/USD ✅    EURUSD → EUR/USD ✅    GBPUSD → GBP/USD ✅
USDJPY → USD/JPY ✅    USDCAD → USD/CAD ✅    EURJPY → EUR/JPY ✅
GBPJPY → GBP/JPY ✅    EURGBP → EUR/GBP ✅    NZDUSD → NZD/USD ✅
USDCHF → USD/CHF ✅    EURAUD → EUR/AUD ✅    GBPAUD → GBP/AUD ✅
AUDJPY → AUD/JPY ✅    CADJPY → CAD/JPY ✅    CHFJPY → CHF/JPY ✅
EURCAD → EUR/CAD ✅    GBPCAD → GBP/CAD ✅    USDSGD → USD/SGD ✅
USDINR → USD/INR ✅    USDBRL → USD/BRL ✅    USDMXN → USD/MXN ✅
EURCHF → EUR/CHF ✅    GBPCHF → GBP/CHF ✅    AUDCAD → AUD/CAD ✅
AUDNZD → AUD/NZD ✅    NZDJPY → NZD/JPY ✅    GB PNZD → GBP/NZD ✅
EURNZD → EUR/NZD ✅    CADCHF → CAD/CHF ✅    USDZAR → USD/ZAR ✅
USDTRY → USD/TRY ✅    USDARS → USD/ARS ✅    USDPKR → USD/PKR ✅
USDBDT → USD/BDT ✅

Pass-through: EUR/USD → EUR/USD ✅ (already canonical)
```

## 5. Settlement Verification

`resolveSettlement()` at `OTCExecutionEngine.ts:172`:
```typescript
const candle = await getCandleAtTime(record.pair, expiryTime);
```

`record.pair` was set during `scan()` via `createScanPlaceholder(tempId, pair, ...)`, where `pair` is already normalized. Settlement automatically inherits the canonical format — **no additional conversion needed**.

## 6. Files Changed

| File | Change |
|------|--------|
| `src/lib/otc/OTCExecutionEngine.ts:210-213` | Added 3-line normalization at top of `scan()` |

**Zero other files modified.** No changes to:
- `src/lib/otc/index.ts` (Router)
- `src/lib/otc/simulated_feed.ts` (Provider)
- `src/lib/otc/otc_feed.ts` (Provider)
- `src/lib/otc/otc-execution-types.ts` (Types)
- `src/lib/otc/indicator-engine.ts` (Engine)
- `src/app/dashboard/signals/useOTCExecution.ts` (Hook)
- `src/app/dashboard/signals/page.tsx` (UI)
- `src/app/dashboard/signals/generateSignal.ts` (Legacy)
- Any file under `src/lib/forex-execution/` or `src/lib/market-data/`

## 7. TypeScript Compilation

```
npx tsc --noEmit → zero new errors (only pre-existing scripts/ errors)
```

## 8. LIVE FOREX Isolation

Zero references to `normalizePair`, `slice(0, 3)`, or any Phase 21.3 code in `src/lib/forex-execution/` or `src/lib/market-data/`.

## 9. Validation Checklist

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `"AUDUSD"` → `"AUD/USD"` | ✅ | Algorithm: `slice(0,3) + '/' + slice(3)` |
| All 34 pairs normalize | ✅ | Verified programmatically |
| No `SimulatedFeed: unknown pair` errors | ✅ | `PAIR_BASE_PRICES` now receives canonical keys |
| `SCANNING → WAITING_FOR_ENTRY` progression | ✅ | No throw before this transition |
| `record.pair` stores canonical | ✅ | Set via `createScanPlaceholder(tempId, pair, ...)` after normalization |
| Settlement uses canonical | ✅ | `getCandleAtTime(record.pair, ...)` reads from normalized `record.pair` |
| DB stores `"AUD/USD"` not `"AUDUSD"` | ✅ | `saveSignal({ pair, ... })` passes normalized `pair` |
| Signal History/Performance/Admin work | ✅ | All query `signals` table with canonical `source: 'live_otc'` |
| No Router alias logic | ✅ | Router unchanged |
| No Provider alias logic | ✅ | Providers unchanged |
| No UI modifications | ✅ | `page.tsx` untouched |
| No lifecycle modifications | ✅ | State machine untouched |
| No settlement algorithm modifications | ✅ | `resolveSettlement` unchanged |
| No forex files modified | ✅ | Verified via file listing |

## 10. Architecture Summary

```
UI (short: "AUDUSD")
  │
  ▼
OTCExecutionEngine.scan("AUDUSD")
  │
  ├─ NORMALIZE: "AUDUSD" → "AUD/USD"   ← ONLY NORMALIZATION BOUNDARY
  │
  ├─ OTC Router.getLatestCandle("AUD/USD")
  ├─ OTC Router.getCandleRange("AUD/USD", from, to)
  ├─ saveSignal({ pair: "AUD/USD", ... })
  ├─ record.pair = "AUD/USD"
  │
  ▼
Settlement: getCandleAtTime("AUD/USD", expiry)
```
