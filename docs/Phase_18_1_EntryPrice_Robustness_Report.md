# Phase 18.1 — Official Entry Price Robustness Refinement

**Status:** ✅ COMPLETE (Production Ready)

## Objective

Improve reliability and auditability of the Official Entry Price capture without changing any trading logic, strategy, provider architecture, settlement algorithm, or database schema.

## Entry Source Priority System

When `captureOfficialEntryPrice` is called at the M1 boundary, it now uses a two-tier priority:

### Priority 1 — OPEN_CANDLE (Preferred)

If the most recently returned candle from the provider started **at or after** the scheduled entry time, it IS the entry candle. Its **OPEN** is used as the official entry price.

```
Entry Time     = 12:21:00
Latest Candle  = 12:21:00 (or later)
         ↓
Use latestCandle.open   ✅ Most accurate
```

### Priority 2 — PREVIOUS_CLOSE_FALLBACK

If the provider has not yet published the entry candle (normal API latency — the most recent candle is still the previous completed candle), its **CLOSE** is used as the official entry price.

```
Entry Time     = 12:21:00
Latest Candle  = 12:20:00 (< entry time)
         ↓
Use latestCandle.close  ✅ Falls back safely
```

In continuous M1 markets, the previous candle's close mathematically equals the entry candle's open, so this fallback is deterministic.

## Changes

### `src/app/actions/signals.ts`

| Change | Detail |
|---|---|
| Signature | Added `entryTime: number` parameter (epoch ms of the scheduled entry time) |
| Fetch count | Increased from `1` to `2` candles for broader window |
| Priority logic | `latestTs >= entryTime` → OPEN, else CLOSE |
| Logging | Server-side `console.log` with signalId, pair, source, timestamp comparison, price |
| Return type | Added `entrySource?: string` field for diagnostics |
| Zero trading logic | `evaluateSignal`, `ProviderManager`, `TwelveData`, settlement — all untouched |
| Zero schema | DB write unchanged (only `entry_price` field, same as before) |

### `src/app/dashboard/signals/page.tsx`

| Change | Detail |
|---|---|
| Call site | Added `capture.entryTime` as third argument to `captureOfficialEntryPrice()` |
| Zero UI changes | No rendering, no state, no lifecycle changes |

## Logging Format

```
[captureOfficialEntryPrice] signal=<uuid> pair=EUR/USD \
source=OPEN_CANDLE latestTs=2026-07-16T12:21:00.000Z \
entryTime=2026-07-16T12:21:00.000Z price=1.0895
```

Two possible source values:
- `OPEN_CANDLE` — official entry price from entry candle OPEN (Priority 1)
- `PREVIOUS_CLOSE_FALLBACK` — entry price from previous candle CLOSE (Priority 2)

## Regression Verification

| Requirement | Status |
|---|---|
| Strategy unchanged | ✅ `SignalEngine`, `evaluateSignal()` untouched |
| SignalEngine unchanged | ✅ Zero modifications |
| Provider architecture unchanged | ✅ Only calls `fetchHistoricCandles(pair, 2)` (was `pair, 1`) |
| Timeline unchanged | ✅ No timeline changes |
| Popup lifecycle unchanged | ✅ No popup changes |
| Countdown unchanged | ✅ No countdown changes |
| WAITING_FOR_ENTRY unchanged | ✅ State machine untouched |
| Active Scan unchanged | ✅ Lifecycle methods untouched |
| Settlement unchanged | ✅ Still compares exit price against `entry_price` in DB |
| Database schema unchanged | ✅ Writes to same `entry_price` column; no migration |
| No TypeScript errors | ✅ Zero new errors |

## Files Modified

| File | Lines | Change |
|---|---|---|
| `src/app/actions/signals.ts` | 1711-1764 | Rewrote `captureOfficialEntryPrice`: added `entryTime` param, 2-candle fetch, OPEN/CLOSE priority, source logging |
| `src/app/dashboard/signals/page.tsx` | 558 | Added `capture.entryTime` to function call |
| `docs/Phase_18_1_EntryPrice_Robustness_Report.md` | — | This file |

## Production Readiness

- No new dependencies
- No provider changes
- No schema migration
- No UI or state machine changes
- Log-based diagnostics only — no performance impact
- Worst case (provider down): returns `{ success: false }`, client falls back to scan-time price (existing behavior)
