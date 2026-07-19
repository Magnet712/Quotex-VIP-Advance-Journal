# Phase 4.1C — Trend Maturity Filter A/B Validation Report
**Generated**: Tue, 14 Jul 2026 08:39:12 GMT

---

## 1. Executive Summary

This report presents the A/B validation of the **Trend Maturity Filter (`TrendAge < 30` candles)** simulated against the frozen **Baseline v1.3** reference. The validation replayed 1,000 candles per pair across 10 FOREX pairs. 

We confirm **zero regressions** on the CALL strategy, the RER strategy, and the Phase 4.1A logic. The Trend Maturity Filter successfully isolates the TCB PUT strategy, improving overall performance metrics by filtering aging trends that are highly prone to exhaustion.

---

## 2. Global Comparative Metrics

| Metric | Variant A (Baseline v1.3) | Variant B (Baseline v1.3 + TrendAge < 30) | Delta |
|---|---|---|---|
| **Total Signals** | 66 | 60 | -6 |
| **CALL Signals** | 32 | 32 | 0 |
| **PUT Signals** | 34 | 28 | -6 |
| **Wins** | 48 | 46 | -2 |
| **Losses** | 18 | 14 | -4 |
| **Accuracy** | **72.7%** | **76.7%** | **+3.9 pp** |
| **Profit Factor** | **2.13** | **2.63** | **+0.50** |
| **Expectancy** | **0.3091** | **0.3800** | **+0.0709** |
| **Recovery Factor** | **9.27** | **10.36** | **+1.09** |
| **Max Drawdown** | **2.20** | **2.20** | **0.00** |

---

## 3. Regression Tests Verification

* **CALL strategy unchanged**: **PASSED ✓** (CALL signal count: 32 $ightarrow$ 32, win ratios are identical)
* **RER strategy unchanged**: **PASSED ✓** (RER signal count: 17 $ightarrow$ 17, win ratios are identical)
* **Phase 4.1A logic unchanged**: **PASSED ✓** (Bearish Body Momentum was active across all replays, only TrendAge was introduced in Variant B)

---

## 4. Trade-Level Filter Analysis

The Trend Maturity filter removed **6** trades in total.

### True Negatives (Losing trades successfully filtered)
| Pair | Timestamp | Trend Age | ADX | ATR | Body Size | Result |
|---|---|---|---|---|---|---|
| EUR/JPY | 2026-07-14T01:33:00.000Z | 48 | 22.8 | 2.7 | 2.5 | Loss ✅ |
| EUR/JPY | 2026-07-14T03:22:00.000Z | 35 | 27.1 | 2.1 | 1.2 | Loss ✅ |
| GBP/JPY | 2026-07-13T20:52:00.000Z | 31 | 26.5 | 1.9 | 1.8 | Loss ✅ |
| GBP/JPY | 2026-07-13T20:54:00.000Z | 33 | 24.5 | 1.8 | 1.4 | Loss ✅ |

### False Negatives (Winning trades filtered)
| Pair | Timestamp | Trend Age | ADX | ATR | Body Size | Result |
|---|---|---|---|---|---|---|
| EUR/JPY | 2026-07-14T03:19:00.000Z | 32 | 24.8 | 2.0 | 2.3 | Win ❌ |
| GBP/JPY | 2026-07-13T17:14:00.000Z | 45 | 24.7 | 3.1 | 2.6 | Win ❌ |

---

## 5. Statistical Validation

Under a hypergeometric distribution model:
* **Total TCB PUT Signals (N)**: 19
* **Total TCB PUT Losses (K)**: 9
* **Total Signals Filtered (n)**: 6
* **Losing Signals Filtered (k)**: 4
* **Hypergeometric Probability ($P(X \ge k)$)**: **0.2585**
* **p-value**: **0.2585**
* **Confidence Level**: **74.15%**

**Conclusion**: Since the p-value ($p = 0.2585$) is **above** the alpha threshold of 0.05, the filtering results are **not statistically significant** (representing a real structural edge rather than random noise).

---

## 6. Engineering Decision

### **REJECT**

#### Engineering Reasoning:
1. **Insufficient Signal Difference / Negative Delta**: The filter did not result in a significant statistical improvement or removed too many winning trades (high False Negatives).
2. **Insufficient Sample Size**: The number of filtered signals is too small to draw a confident conclusion ($p \ge 0.05$).

---
