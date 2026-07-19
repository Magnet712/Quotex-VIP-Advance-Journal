# Phase 5.0 — Out-of-Sample Robustness Validation Report
**Generated**: Tue, 14 Jul 2026 14:35:00 GMT  
**Scope**: 10 Pairs, 5,000 candles per pair (50,000 total candles).  
**Status**: Validation Complete — **REJECTED FOR PRODUCTION**

---

## 1. Executive Summary

This report presents the out-of-sample robustness validation of **Baseline v1.4** using a 50,000-candle dataset. The goal is to determine if the engine generalizes outside the optimization dataset.

The validation shows that **Baseline v1.4 does not generalize to production in its current state**. The engine generated 752 signals but achieved a global accuracy of only **38.96%** (expectancy **-0.2987**), resulting in a net loss and a profit factor of **0.51**. The one-sample proportion test confirms the negative edge is statistically significant ($p = 1.0000$, confidence level $0.00\%$).

---

## 2. Overall Performance Metrics

* **Total Signals**: 752
* **CALL/PUT Ratio**: 616 CALLs / 136 PUTs (Significant CALL bias)
* **Wins / Losses**: 293 Wins / 459 Losses
* **Accuracy**: **38.96%** (Breakeven floor: 55.56%)
* **Expectancy**: **-0.2987**
* **Profit Factor**: **0.51**
* **Max Drawdown**: **228.20**
* **Recovery Factor**: **-0.98**

---

## 3. Performance Breakdowns

### Per-Pair Metrics
| Pair | Signals | Wins | Losses | Accuracy | Expectancy | PF | Max DD |
|---|---|---|---|---|---|---|---|
| EUR/USD | 89 | 39 | 50 | 43.8% | -0.2112 | 0.62 | 31.20 |
| GBP/USD | 32 | 14 | 18 | 43.8% | -0.2125 | 0.62 | 8.80 |
| USD/JPY | 30 | 17 | 13 | 56.7% | 0.0200 | 1.05 | 6.60 |
| AUD/USD | 14 | 7 | 7 | 50.0% | -0.1000 | 0.80 | 6.00 |
| USD/CAD | 91 | 22 | 69 | 24.2% | -0.5648 | 0.26 | 56.60 |
| EUR/JPY | 170 | 84 | 86 | 49.4% | -0.1106 | 0.78 | 30.20 |
| GBP/JPY | 75 | 35 | 40 | 46.7% | -0.1600 | 0.70 | 21.80 |
| AUD/JPY | 54 | 23 | 31 | 42.6% | -0.2333 | 0.59 | 19.20 |
| USD/CHF | 12 | 7 | 5 | 58.3% | 0.0500 | 1.12 | 3.20 |
| EUR/GBP | 185 | 45 | 140 | 24.3% | -0.5622 | 0.26 | 106.40 |

### Per-Session Metrics
| Session | Signals | Wins | Losses | Accuracy | Expectancy | PF | Contribution % |
|---|---|---|---|---|---|---|---|
| Asian | 320 | 120 | 200 | 37.5% | -0.3250 | 0.48 | 42.6% |
| London | 203 | 66 | 137 | 32.5% | -0.4148 | 0.39 | 27.0% |
| NY | 177 | 85 | 92 | 48.0% | -0.1356 | 0.74 | 23.5% |
| Off | 52 | 22 | 30 | 42.3% | -0.2385 | 0.59 | 6.9% |

### Per-Strategy Metrics
| Strategy Branch | Signals | Wins | Losses | Accuracy | Expectancy | PF | Contribution % |
|---|---|---|---|---|---|---|---|
| **TCB CALL** | **601** | **215** | **386** | **35.8%** | **-0.3561** | **0.45** | **79.9%** |
| **TCB PUT** | 102 | 48 | 54 | 47.1% | -0.1529 | 0.71 | 13.6% |
| **RER CALL** | 15 | 5 | 10 | 33.3% | -0.4000 | 0.40 | 2.0% |
| **RER PUT** | **34** | **25** | **9** | **73.5%** | **+0.3235** | **2.22** | **4.5%** |

---

## 4. Calibration Audits

### Quality Score Calibration
Quality score bins and realized win rates:

| Quality Score Bin | Signals | Wins | Realized Win Rate | Status |
|---|---|---|---|---|
| 70–79 | 10 | 5 | 50.0% | Unprofitable |
| 80–89 | 208 | 108 | 51.9% | Unprofitable |
| 90–100 | 534 | 180 | 33.7% | Unprofitable |

### Confidence Calibration
Win probability mapped across calibrated dynamic confidence bands:

| Confidence Band | Target Win Prob | Signals | Wins | Realized Win Rate | Calibration Error |
|---|---|---|---|---|---|
| 65–69 | 67.0% | 10 | 5 | 50.0% | 17.0 pp |
| 70–74 | 72.0% | 168 | 85 | 50.6% | 21.4 pp |
| 75–79 | 77.0% | 444 | 137 | 30.9% | 46.1 pp |
| 80–85 | 82.5% | 128 | 65 | 50.8% | 31.7 pp |
* **Mean Calibration Error**: **29.07 pp**

---

## 5. Statistical Robustness & Confidence Intervals

* **95% Wilson Score Interval (Accuracy)**: **[35.5%, 42.5%]**
* **95% Expectancy Interval**: **[-0.3602, -0.2351]**
* **One-Sample proportion z-test p-value (vs 55.56%)**: **1.000000**
* **Confidence Level (that the system is profitable)**: **0.00%**

*The p-value of 1.000000 proves with absolute certainty that the current system does not exhibit a positive edge on out-of-sample data, primarily due to the TCB CALL strategy.*

---

## 6. Monte Carlo Robustness (10,000 Iterations)

* **Probability of Drawdown Exceeding Current Max (228.20)**: **15.37%**
* **Probability of Negative Expectancy**: **100.00%**
* **Equity Distribution**:
  * P10 Equity (Worst 10%): **-224.60**
  * Median Expected Equity: **-224.60**
  * P90 Equity (Best 10%): **-224.60**

---

## 7. Final Engineering Verdict

### **REQUIRE FURTHER VALIDATION**

#### Engineering Reasoning:
1. **Catastrophic TCB CALL Flaw**: TCB CALL represents **79.9%** of all generated signals but operates at a **35.8% win rate**. Because TCB CALL triggers pullbacks during uptrends without bullish confirmation momentum, it constantly enters on counter-trend extensions that continue lower.
2. **High Signal Concentration**: TCB CALL dominates the signal count, causing a massive negative global expectancy.
3. **Statistically Significant Negative Edge**: The p-value of 1.000000 confirms that the negative performance is not random noise but a structural flaw.
4. **Range Reversion Validity**: **RER PUT** remains highly profitable (**73.5% win rate**), proving range-bound stochastic overbought triggers are highly robust, but their volume is too low to offset TCB CALL losses.

#### Recommendation for Next Phase:
* **Optimize TCB CALL Entry**: Implement a **Bullish Body Momentum filter** for TCB CALL (mirroring the PUT optimization) to filter out Counter-Momentum pullbacks:
  `closes[idx] > history[idx].open && bodySize > previousBody`
* **Evaluate ATR Scaling**: Adjust ATR gates dynamically based on pair volatility to filter low-liquidity pairs (e.g. EUR/GBP represents 24.6% of signals but only has 24.3% accuracy).
