# BASELINE v1.2 — Engineering Reference
## Quotex VIP Advance Journal — Signal Engine

> **Baseline v1.2 is the official engineering reference. Every future optimization must be measured against this baseline.**

**Frozen**: 2026-07-14  
**Status**: Production validation complete — pre-Phase 4  
**Engine file**: `src/lib/market-data/core/SignalEngine.ts` (651 lines)

---

## 1. Architecture Overview

```
User (browser)
    │
    ├── signals/page.tsx — handleScanLiveMarket()
    │       └── Server Action: scanLiveMarketAsset() [signals.ts]
    │               ├── Auth check: checkApproved()
    │               ├── ProviderManager
    │               │   ├── TwelveDataProvider (primary)
    │               │   └── YahooProvider (failover)
    │               ├── CircuitBreaker (5 failures / 10min / 5min reset)
    │               ├── AbortController (20s timeout)
    │               ├── CandleCache (200 bars/pair, in-memory ring buffer)
    │               ├── SignalEngine.evaluateSignal()
    │               └── saveSignal() → Supabase manual_signal_audits
    │
    └── Result displayed in timeline (local state — no re-query)
```

---

## 2. Signal Pipeline (evaluateSignal)

**Input**: OHLCV candles (1-min), pair identifier, minQualityScore (83)  
**Output**: `{ direction, confidence, qualityScore, strategy, noTradeReason }`

```
evaluateSignal(pair, history, minQualityScore)
    │
    ├── F0: Candle count ≥ 52 (warm-up guard)
    │
    ├── F1: Null indicator check
    │       └── Compute: EMA(21), SMA(50), RSI(14), CCI(14),
    │                    Stoch(14), ATR(14), SuperTrend(10,3), ADX(14)
    │       └── If any null → WAIT ("Provider data stale/insufficient")
    │
    ├── F2: Volatility gate [BASELINE v1.2]
    │       ├── pipSize = pair.includes('JPY') ? 0.01 : 0.0001
    │       ├── atrInPips = currentATR / pipSize
    │       ├── atrSma = SMA(ATR, 20)
    │       └── PASS: atrInPips >= 1.2 && currentATR > atrSma * 0.9
    │            FAIL → WAIT ("Volatility too low")
    │
    ├── F3: Body expansion
    │       ├── bodySize = |close - open|
    │       ├── bodySma = SMA(bodySize, 20)
    │       └── PASS: bodySize > bodySma * 0.85
    │            FAIL → WAIT ("Body not expanding")
    │
    ├── F4: Strategy conditions
    │       ├── TRENDING (ADX > 22):
    │       │   ├── CALL: isBullish && stochK>D && stochK<70 &&
    │       │   │         CCI>0 && SuperTrend=UP && SR_room>0.5×ATR
    │       │   └── PUT:  isBearish && stochK<D && stochK>30 &&
    │       │             CCI<0 && SuperTrend=DOWN && SR_room>0.5×ATR
    │       └── RANGING (ADX ≤ 22):
    │           ├── CALL: stochK>D && stochK<30 (oversold) && CCI>0 && SR_room>0.5×ATR
    │           └── PUT:  stochK<D && stochK>70 (overbought) && CCI<0 && SR_room>0.5×ATR
    │
    └── F5: Quality score ≥ 83
            └── calculateQualityScore() → 70–100 based on indicator alignment
                NOTE: F5 never rejects a signal that passes F4 (confirmed Phase 3.5)
```

---

## 3. Active Filters — Exact Thresholds

| Filter | Condition | Threshold | Location |
|---|---|---|---|
| F0 | Candle count | ≥ 52 | `evaluateSignal` entry |
| F1 | Null indicators | any null → reject | Lines 438–449 |
| F2 pip gate | `atrInPips >= 1.2` | **1.2 pip** | Line 469 ✅ v1.2 |
| F2 momentum | `atr > atrSma × 0.9` | 90% of 20-period SMA | Line 469 |
| F3 body | `bodySize > bodySma × 0.85` | 85% of 20-period body SMA | Line 492 |
| F4 ADX regime | `adx > 22` → trending | 22 | Line 455 |
| F4 stoch call | `stochK > stochD && stochK < 70` | — | Line 495 |
| F4 stoch put | `stochK < stochD && stochK > 30` | — | Line 502 |
| F4 SR buffer | `distance > atr × 0.5` | 50% ATR | Lines 485–486 |
| F5 quality | `qScore >= 83` | 83 | Lines 519, 526, 538, 544 |

---

## 4. Strategy Models

### Trend Corridor Breakout (TCB)
- **Regime**: ADX > 22 (trending)
- **CALL**: Bullish trend (EMA21 > SMA50) + stoch cross up + CCI positive + SuperTrend UP + SR room
- **PUT**: Bearish trend (EMA21 < SMA50) + stoch cross down + CCI negative + SuperTrend DOWN + SR room
- **Confidence**: CALL=86, PUT=85
- **Phase 3.5 accuracy**: 48.3% (29 signals) — below breakeven

### Range Extreme Reversion (RER)
- **Regime**: ADX ≤ 22 (ranging)
- **CALL**: Stoch oversold (K < 30, K > D) + CCI positive + SR room
- **PUT**: Stoch overbought (K > 70, K < D) + CCI negative + SR room
- **Confidence**: CALL=88, PUT=87
- **Phase 3.5 accuracy**: 100% (5 signals — small sample)

---

## 5. Confidence Model

Fixed values — not computed dynamically:

| Signal | Confidence |
|---|---|
| TCB CALL | 86 |
| TCB PUT  | 85 |
| RER CALL | 88 |
| RER PUT  | 87 |

---

## 6. Quality Score Model

Base: 70 points. Add:
- +10 trend alignment (EMA21 vs SMA50 direction matches signal)
- +10 SuperTrend alignment
- +5 stochastic aligned
- +5 RSI in valid zone (45–65 CALL, 35–55 PUT)
- +5 body expanding
- +5 S/R room available
- +10 ranging regime bonus (for RER signals)

Max: 100. Minimum to pass: 83.

**Note**: F5 never rejects an F4-passing window. Every F4-passing signal scores 100.

---

## 7. Supported FOREX Pairs

| Pair | Pip size | Avg ATR (Phase 3.5) | Active signals |
|---|---|---|---|
| EUR/USD | 0.0001 | 1.163 pip | ✅ |
| GBP/USD | 0.0001 | 1.190 pip | ✅ |
| USD/JPY | 0.01   | 1.515 pip | ✅ |
| AUD/USD | 0.0001 | 0.973 pip | ⚠ Below 1.2 pip gate |
| USD/CAD | 0.0001 | 0.925 pip | ⚠ Below 1.2 pip gate |
| EUR/JPY | 0.01   | 2.243 pip | ✅ |
| GBP/JPY | 0.01   | 2.193 pip | ✅ |
| AUD/JPY | 0.01   | 1.650 pip | ✅ |
| USD/CHF | 0.0001 | 0.904 pip | ⚠ Below 1.2 pip gate |
| EUR/GBP | 0.0001 | 0.877 pip | ⚠ Below 1.2 pip gate |

---

## 8. Replay Methodology

All phase validation was performed using:
- **Data source**: TwelveData REST API (`/time_series`, 1-min, 500 bars)
- **Window**: 60-candle sliding window (oldest to newest)
- **Win/loss**: Next candle close vs open direction (1-bar binary expiry)
- **Engine functions**: Exact exported functions from `SignalEngine.ts` (no duplication)
- **Rate limiting**: 7 pairs/minute batch → 60s pause → 3 pairs/minute batch

---

## 9. Phase Findings

### Phase 2 (Completed 2026-07-13)
- **Root cause**: `normalizedAtr >= 0.00015` price-ratio formula was pair-unaware
- **Impact**: Effective threshold ranged 0.97–2.93 pip across pairs (3× variance)
- **Fix**: Replaced with `atrInPips >= 1.0` (pip-normalized)
- **Change**: `SignalEngine.ts:469` — one line

### Phase 3 Validation (Completed 2026-07-14)
- **Replay**: 4,390 windows (439 × 10 pairs, `atrInPips >= 1.0` baseline)
- **Finding**: 1.0–1.2 pip signals: 44.4% accuracy; ≥1.2 pip: 67.2% (+22.7 pp delta)
- **Decision**: Threshold raised to 1.2 pips
- **Change**: `SignalEngine.ts:469` — `>= 1.0` → `>= 1.2`

### Phase 3.5 Statistical Audit (Completed 2026-07-14)
- **Replay**: 4,390 windows, `atrInPips >= 1.2` engine
- **Signals**: 34 / 4,390 windows (0.77% generation rate)
- **Accuracy**: 55.9% (19W/15L) — marginally above 55.56% breakeven
- **95% CI**: [39.2%, 72.6%] — edge statistically unconfirmed
- **TCB**: 48.3% (loss-making at 29 signals)
- **RER**: 100% (5 signals — insufficient sample)
- **F5**: 0 rejections — permanently redundant
- **Production readiness**: 60/100

---

## 10. Production Readiness Assessment

| Metric | Value |
|---|---|
| Engine stability       | ✅ 100% F1 pass — no null indicator failures |
| Pip normalization      | ✅ Pair-aware (JPY 0.01, others 0.0001) |
| Strategy coverage      | ✅ TCB + RER both active |
| Statistical edge       | ⚠ Marginally above breakeven (n=34, CI includes sub-breakeven) |
| Sample size            | ❌ 34 trades — statistically insufficient |
| F5 gate                | ❌ Redundant — never rejects (all F4-passing = score 100) |
| TCB accuracy           | ❌ 48.3% — loss-making at current sample |

**Production Readiness Score: 60/100**

---

## 11. Known Limitations

1. **F5 is redundant**: Quality score filter never rejects post-F4. Has no discriminating power.
2. **Low signal frequency**: 0.77% generation rate — F4 rejects 96.8% of F2+F3 windows.
3. **TCB trailing PUT**: 37.5% accuracy (10 signals, 6 losses) — worst performing category.
4. **4 pairs produce no signals** when market volatility drops below 1.2 pip.
5. **No Asian session baseline**: Phase 3.5 data covered Asian session only — London/NY unvalidated.
6. **Sample size**: 34 trades cannot confirm a 0.3 pp edge over breakeven.
7. **Confidence values are constants**: Not dynamically computed from market state.
8. **CandleCache is in-memory**: Not persistent across serverless invocations.

---

## 12. Future Optimization Candidates (Phase 4)

Priority order based on Phase 3.5 evidence:

| # | Candidate | Evidence | Risk |
|---|---|---|---|
| 1 | Replace/remove F5 quality score | 0% rejection rate — redundant code | Low |
| 2 | Investigate TCB trending PUT | 37.5% accuracy, negative expectancy | Medium |
| 3 | Session-aware signal filtering | NY 69.8% vs London 52.2% in Phase 3 | Medium |
| 4 | Signal frequency improvement | F4 rejects 96.8% — stochastic gate is #1 blocker | High |
| 5 | Expand sample size | Need 200+ signals for statistical significance | — |

**Rule**: Every optimization must be validated against this baseline using the same replay methodology.

---

## 13. Rollback Procedure

To roll back to BASELINE v1.2:

1. Open `src/lib/market-data/core/SignalEngine.ts`
2. Find line 469
3. Confirm: `const isVolatilityHealthy = atrInPips >= 1.2 && currentAtr > currentAtrSma * 0.9;`

This is the exact state of BASELINE v1.2. No other production file was modified in Phase 2/3/3.5.

To roll back to pre-Phase 2 (original):
```diff
- const isVolatilityHealthy = atrInPips >= 1.2 && currentAtr > currentAtrSma * 0.9;
+ const isVolatilityHealthy = normalizedAtr >= 0.00015 && currentAtr > currentAtrSma * 0.9;
// (normalizedAtr = currentAtr / currentPrice)
```

---

*Baseline v1.2 is the official engineering reference. Every future optimization must be measured against this baseline.*
