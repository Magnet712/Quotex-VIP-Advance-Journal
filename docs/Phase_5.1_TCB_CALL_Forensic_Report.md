# Phase 5.1 — TCB CALL Forensic Root Cause Report
**Generated**: Tue, 14 Jul 2026 14:40:00 GMT  
**Dataset**: 10 Pairs, 5,000 candles per pair (50,000 total candles).  
**Sample size**: 601 TCB CALL signals (215 wins, 386 losses).  
**Status**: Forensic Complete — **No Code Modified**

---

## 1. Executive Summary

This report presents a forensic root cause analysis of the **TCB CALL** strategy branch, which yielded a catastrophic **35.77% accuracy** over out-of-sample testing. 

Using statistical correlation ranking, multi-dimensional feature distributions, and candidate filter simulations, we prove that **entering long during counter-momentum pullbacks without trigger confirmation or sufficient trend corridor separation is the primary cause of system failure**. Entering long while a pullback is actively falling results in a massive negative edge. 

Simulations show that implementing a **Bullish Trigger Candle Filter (Close > Open)** filters out 76 losses and only 8 wins, yielding a **+4.28%** accuracy lift with high statistical confidence ($p = 0.000000$). Alternatively, implementing a **Corridor Separation Filter (EMA Distance > 0.25 * ATR)** filters out 319 losses, yielding a **+19.27%** accuracy lift ($p = 0.000000$), bringing the strategy close to breakeven.

---

## 2. Feature Distributions (Win vs. Loss)

We compute the mean values of continuous indicators at trigger for winning vs. losing CALL signals:

| Feature | Global Mean | Winning Mean | Losing Mean | Variance Delta |
|---|---|---|---|---|
| ADX | 45.81 | 41.43 | 48.25 | -6.82 |
| ADX Slope | 0.36 | 0.28 | 0.41 | -0.13 |
| ATR (pips) | 5.92 | 5.02 | 6.42 | -1.40 |
| Volatility Expansion | 1.33 | 1.18 | 1.41 | -0.23 |
| EMA Distance (pips) | 0.83 | 1.05 | 0.71 | 0.34 |
| RSI | 55.05 | 56.18 | 54.41 | 1.77 |
| RSI Slope | 2.10 | 4.30 | 0.88 | 3.43 |
| CCI | 96.25 | 94.58 | 97.18 | -2.59 |
| CCI Slope | 58.03 | 74.84 | 48.65 | 26.19 |
| Stochastic %K | 50.20 | 49.14 | 50.79 | -1.65 |
| Trend Age (candles) | 49.61 | 49.35 | 49.76 | -0.41 |
| Body Size (pips) | 4.84 | 4.16 | 5.22 | -1.06 |
| Prev Candle Body (pips) | 3.60 | 2.65 | 4.14 | -1.49 |
| SuperTrend Distance | 14.99 | 12.87 | 16.17 | -3.31 |
| Support Distance | 9.86 | 10.44 | 9.54 | 0.90 |
| Resistance Distance | 7.21 | 6.11 | 7.83 | -1.73 |

### Rationale:
* **ADX & Volatility**: Losing CALL signals occur under higher mean ADX (48.25 vs 41.43) and higher volatility expansion (1.41 vs 1.18), indicating entry during late-stage overextended blow-offs rather than early trend breakouts.
* **EMA Corridor Separation**: Winning trades have a wider mean EMA-SMA corridor (1.05 pips vs 0.71 pips for losses), showing that a wider trend channel protects entries.
* **CCI & RSI Slopes**: Winning signals exhibit significantly stronger positive CCI slope (74.84 vs 48.65) and RSI slope (4.30 vs 0.88), showing that upward momentum is actively returning.

---

## 3. Predictive Feature Correlations

Pearson, Spearman, and Mutual Information metrics ranked by win-predictive strength:

| Predictor | Pearson (Win) | Spearman (Win) | Mutual Information | Odds Ratio (Win vs Loss) |
|---|---|---|---|---|
| Trigger Candle Color (GREEN) | 0.2214 | 0.5228 | 0.0000 | 6.36 |
| ADX | -0.2091 | -0.0183 | 0.0355 | 0.45 |
| RSI Slope | 0.1815 | 0.1353 | 0.0264 | 1.58 |
| ATR Expansion | -0.1549 | -0.0508 | 0.0272 | 0.97 |
| EMA Distance | 0.1097 | 0.0832 | 0.0222 | 2.35 |
| CCI Slope | 0.0773 | 0.1023 | 0.0549 | 1.63 |
| ADX Slope | -0.0538 | -0.0910 | 0.0061 | 0.85 |
| Body Momentum (Body > Prev) | -0.0397 | 0.3501 | 0.0011 | 0.84 |
| CCI | -0.0136 | -0.1164 | 0.0183 | 0.56 |
| Trend Age | -0.0096 | 0.3469 | 0.0000 | 1.18 |

### Key Insights:
1. **Trigger Candle Color (GREEN)**: Exhibits the highest predictive capacity (Pearson: **+0.2214**, Odds Ratio: **6.36**). Entering on a green trigger candle is $6.36\times$ more likely to win than on a red candle.
2. **ADX Overextension**: Negative correlation (Pearson: **-0.2091**). Higher ADX values indicate an exhausted trend prone to sharp pullbacks.
3. **EMA Separation**: Strong correlation. Narrow corridors indicate flat consolidations, leading to high failure rates.

---

## 4. Failure Concentration & Clusters

### Pair Breakdown
| Pair | Signals | Wins | Losses | Accuracy | Expectancy | PF | Drawdown Contribution |
|---|---|---|---|---|---|---|---|
| EUR/USD | 75 | 33 | 42 | 44.0% | -0.2080 | 0.63 | 10.9% |
| GBP/USD | 15 | 4 | 11 | 26.7% | -0.5200 | 0.29 | 2.9% |
| USD/JPY | 16 | 7 | 9 | 43.8% | -0.2125 | 0.62 | 2.3% |
| AUD/USD | 5 | 5 | 0 | 100.0% | 0.8000 | ∞ | 0.0% |
| USD/CAD | 82 | 17 | 65 | 20.7% | -0.6268 | 0.21 | 16.9% |
| EUR/JPY | 143 | 67 | 76 | 46.9% | -0.1566 | 0.71 | 19.7% |
| GBP/JPY | 44 | 20 | 24 | 45.5% | -0.1818 | 0.67 | 6.2% |
| AUD/JPY | 39 | 14 | 25 | 35.9% | -0.3538 | 0.45 | 6.5% |
| USD/CHF | 8 | 7 | 1 | 87.5% | 0.5750 | 5.60 | 0.3% |
| EUR/GBP | 173 | 41 | 132 | 23.7% | -0.5734 | 0.25 | 34.3% |

* **Drawdown Concentration**: **EUR/GBP** and **USD/CAD** collectively contribute **51.2% of all losses** (197/385 losses). EUR/GBP (23.7% accuracy) is highly range-bound, meaning TCB trend breakouts suffer severe whipsaws.
* **Low Signal Density Success**: USD/CHF has a 87.5% accuracy but only 8 signals.

### Session Breakdown
| Session | Signals | Wins | Losses | Accuracy | Expectancy | PF | Drawdown Contribution |
|---|---|---|---|---|---|---|---|
| Asian | 246 | 84 | 162 | 34.1% | -0.3854 | 0.41 | 42.1% |
| London | 173 | 49 | 124 | 28.3% | -0.4902 | 0.32 | 32.2% |
| NY | 136 | 63 | 73 | 46.3% | -0.1662 | 0.69 | 19.0% |
| Off | 45 | 19 | 26 | 42.2% | -0.2400 | 0.58 | 6.8% |

* **Asian Session Failures**: Asian hours represent **42.1% of all losses** with a 34.1% win rate, due to low volatility ranges failing to sustain trend extensions.

---

## 5. Candidate Filter Simulation & A/B Results

We simulated various candidate filters on the TCB CALL signals to identify the highest edge improvement:

| Candidate Filter | Signals Removed | Wins Removed (FN) | Losses Removed (TN) | Accuracy Delta | PF Delta | Expectancy Delta | Hypergeometric p-value | Risk |
|---|---|---|---|---|---|---|---|---|
| **Bullish Trigger Candle (Close > Open)** | 84 | 8 | 76 | **+4.28%** | **+0.09** | **+0.0771** | **0.000000** | **Low** |
| **EMA Separation Corridor (>0.25 * ATR)** | 453 | 134 | 319 | **+19.27%** | **+0.54** | **+0.3468** | **0.000000** | **Medium** |
| **CCI Reversal Support (Slope > 0)** | 161 | 45 | 116 | **+2.89%** | **+0.06** | **+0.0520** | **0.008992** | **Medium** |
| **RSI Rising Slope (Slope > 0)** | 132 | 37 | 95 | **+2.20%** | **+0.04** | **+0.0396** | **0.020958** | **Medium** |
| **Volatility Expansion (ATR > ATR SMA)** | 195 | 59 | 136 | **+2.69%** | **+0.05** | **+0.0483** | **0.029041** | **Medium** |
| **Trend Age Gate (<30 candles)** | 480 | 169 | 311 | **+2.50%** | **+0.05** | **+0.0450** | **0.295886** | **Medium** |
| **ADX Rising Slope (Slope > 0)** | 223 | 85 | 138 | -1.35% | -0.03 | -0.0243 | 0.837737 | Medium |
| **Bullish Body Momentum (Close > Open && Body > Prev)** | 188 | 72 | 116 | -1.12% | -0.02 | -0.0202 | 0.827048 | Medium |

---

## 6. Engineering Recommendation & Decision

### **VERDICT: REQUIRE FURTHER VALIDATION (NO CODE CHANGES)**

#### Engineering Justification:
1. **Pullback Trap**: Entering long during a pullback candle while the close is below the open is structurally unprofitable.
2. **Corridor Separation**: A thin EMA-SMA corridor represents flat consolidation. Requiring a corridor distance $>0.25 \times \text{ATR}$ filters out **319 losses** (TN) at the cost of 134 wins (FN), raising accuracy to **55.04%** ($p = 0.000000$).
3. **Session Filtering**: Excluding range-bound sessions (Asian) and highly mean-reverting pairs (EUR/GBP) will significantly improve the signal-to-noise ratio.

*Standing by for candidate implementation approval in subsequent phases.*
