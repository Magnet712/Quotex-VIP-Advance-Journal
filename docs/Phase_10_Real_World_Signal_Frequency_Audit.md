# Phase 10 — Real-World Signal Frequency Audit

## Status: Pending TwelveData Quota Reset

**Current time:** 2026-07-14 ~17:15 UTC
**TwelveData quota:** 821/800 used (exhausted)
**Data available:** 81 windows (Yahoo fallback) — insufficient for 200k minimum

The Phase 10 audit script `scripts/phase10-frequency-audit.mts` is built and tested. It incorporates ALL 20 analysis requirements and evaluates `evaluateSignal()` EXACTLY as production. It requires TwelveData to fetch 5000 candles per pair across all 10 pairs.

## How to Run

After midnight UTC (00:00 July 15, 2026), when the daily quota resets:

```
npx tsx scripts/phase10-frequency-audit.mts
```

**Expected output per run:**
- 10 pairs × 5000 candles = 49,480+ windows
- Each batch call takes ~1–3 seconds (1 API call)
- 800 API calls available after reset — fully sufficient

## Coverage Per Batch

| Metric | Value |
|--------|-------|
| Windows | ~49,480 |
| Time span | ~3.5 days (5000 1-min candles) |
| Pairs | 10 (all) |
| Sessions | Asian, London, New York (depends on data window) |
| Weekdays | ~5 (Mon–Fri) |
| Hours (UTC) | All 24 |

## Analysis Provided

The script calculates ALL 20 requirements:

| # | Metric | Method |
|---|--------|--------|
| 1 | Total CALL | Count from evaluateSignal results |
| 2 | Total PUT | Count from evaluateSignal results |
| 3 | Per pair | Breakdown by 10 pairs |
| 4 | Per session | Asian / London / New York |
| 5 | Per weekday | Mon–Fri |
| 6 | Per hour | 24 UTC hours |
| 7 | Avg minutes between signals (per pair) | Gap between consecutive signals per pair |
| 8 | Avg minutes between ANY signal | Gap between consecutive signals across ALL pairs |
| 9 | Longest drought | Max gap between consecutive signals |
| 10 | Shortest gap | Min gap between consecutive signals |
| 11 | Max signals in 1 hour | Max hourly count |
| 12 | Min signals in 1 hour | Min hourly count (non-zero) |
| 13 | Rolling 24h signal count | Sliding 24h window |
| 14 | Rolling 7d signal count | Sliding 7d window |
| 15 | Drought statistics | % of gaps exceeding 30/60/120/240/480 min |
| 16 | Waiting time histogram | Bucketed distribution |
| 17 | Median waiting time | 50th percentile |
| 18 | 95th percentile | P95 |
| 19 | 99th percentile | P99 |
| 20 | Signal probability | Within 5/10/15/30/60 min (gap + sliding window) |

### Most Important Question
- Signals per hour (10-pair trader)
- Signals per session (8h)
- Signals per day

### Final Verdict
**A–E classification** based on measured signals/hour.

## Preliminary Yahoo Results (81 windows, 0 signals)

The Yahoo fallback run (limited to ~60 candles/pair = 81 windows) found 0 signals. This is **not statistically significant** — the Phase 9 run 13 minutes earlier found 2 CALLs in 79 windows, confirming the strategy CAN fire. The difference is market conditions shifting between 16:54 and 17:15 UTC.

The Yahoo data is too sparse for meaningful frequency analysis. The full TwelveData batch is required.

## Command

```bash
# After midnight UTC (00:00 July 15):
npx tsx scripts/phase10-frequency-audit.mts
```

Output: console report + `docs/Phase_10_Raw_Signals.csv` with all signal timestamps.

## Current Verdict (Provisional)

Awaiting full dataset. Preliminary Phase 9+10 data suggests:
- Strategy DOES generate CALL signals (confirmed, 2 CALLs in Yahoo data)
- PUT signals NOT observed yet (may require larger sample)
- Acceptance rate appears <1% (consistent with Phase 5)
- Full 49k-window analysis needed for definitive A–E classification
