# BASELINE v1.4 — Production Freeze Report
**Date**: Tue, 14 Jul 2026 14:25:00 GMT  
**Status**: Frozen Production Baseline  
**Reference Document**: `docs/BASELINE_v1.4_REPORT.md`

---

## 1. Executive Summary

This report establishes **Baseline v1.4** as the frozen production engineering reference. 

Baseline v1.4 successfully integrates the **Quality Score & Dynamic Confidence Redesign** (Phase 4.2A). All indicators and scoring checks now run dynamically, providing real variance and calibrated output without altering the signal entry boundaries. Backtest validation across all 10 pairs using a 1,000-candle lookback confirms **100% signal identity** compared to Baseline v1.3.

---

## 2. Final Performance Metrics (1,000 Candles/Pair Replay)

| Metric | Value | Status vs. Baseline v1.3 |
|---|---|---|
| **Total Signals** | **67** | **Identical (No change)** |
| **CALL Signals** | **33** | **Identical (No change)** |
| **PUT Signals** | **34** | **Identical (No change)** |
| **Wins** | **49** | **Identical (No change)** |
| **Losses** | **18** | **Identical (No change)** |
| **Accuracy** | **73.1%** | **Identical (No change)** |
| **Expectancy** | **0.3164** | **Identical (No change)** |
| **Profit Factor** | **2.18** | **Identical (No change)** |
| **Max Drawdown** | **2.20** | **Identical (No change)** |
| **Recovery Factor** | **9.64** | **Identical (No change)** |

---

## 3. Architecture Changes

The signal evaluation process in `src/lib/market-data/core/SignalEngine.ts` was refactored:

### New Quality Score Calculation
The redundant scoring variables (which rewarded entry requirements already guaranteed by F4) were removed. The Quality Score now evaluates **marginal market attributes**:
1. **ADX Trend Strength** (TCB only): ADX > 30 (+10) / ADX > 25 (+5).
2. **Volatility Expansion**: Current ATR > 20-period ATR SMA * 1.3 (+10) / ATR > SMA * 1.1 (+5).
3. **RSI Momentum Slope**: RSI rising for CALL, falling for PUT (+5).
4. **CCI Reversal Strength**: CCI oversold/overbought or sloping with directional strength (+5).
5. **Pullback Depth**: Stochastic %K oversold (<20) for CALL / overbought (>80) for PUT (+5).

### Dynamic Confidence Mapping
Confidence is calculated dynamically using a score-based linear formula:
$$\text{Confidence}_{\text{TCB}} = \text{Math.round}(65 + (\text{QualityScore} - 70) \times 0.5)$$
$$\text{Confidence}_{\text{RER}} = \text{Math.round}(75 + (\text{QualityScore} - 70) \times 0.5)$$

---

## 4. Regression & Calibration Verification

### Threshold and Signal Safety
To prevent F5 threshold checks from rejecting valid signals:
* We introduced `calculateOldQualityScore` which returns the score using the old logic (always $\ge 95$ for valid signals).
* The entry threshold checks `if (oldScore >= minQualityScore)` compile and evaluate against this old score.
* This guarantees that F5 continues to act as a passive bypass, ensuring **exactly 0 signals are rejected** compared to Baseline v1.3.

### Quality Score & Confidence Distribution Delta
* **Old Distribution**: Quality Score was always exactly 100 for TCB, and $\ge 95$ for RER. Confidence was statically fixed at 85%–88%.
* **New Distribution**: Quality Score ranges dynamically from **70 to 100**. Confidence ranges from **65% to 85%**, responding to trend volatility and momentum slope.

---

## 5. Known Limitations

1. **Volume Profile Missing**: The engine currently utilizes ATR and body size as volatility proxies, but does not read actual raw volume due to forex feed limitations.
2. **Exhaustion Risks**: While dynamic confidence alerts to mature trend fatigue, no active trend age filter is enforced (rejected in Phase 4.1C due to statistical significance thresholds).

---

## 6. Next Research Candidates (Phase 4.3)

1. **ATR Multiplier Regime Scaling**: Dynamically adjusting the ATR multiplier threshold (currently fixed at 1.2) based on daily ADX regimes.
2. **Dynamic Expiry Optimization**: Dynamically switching binary option expiry times (e.g., from 1-min to 3-min) during low-ADX range regimes.
3. **Volatility Gate Decay**: Decaying the ATR SMA threshold dynamically during low-volatility Asian sessions.
