# CHANGELOG — Quotex VIP Advance Journal

---

## v1.5 — 2026-07-14 — BASELINE FREEZE (Post-Phase 5.2)

### Summary
Implemented TCB CALL strategy multi-filter optimization consisting of EMA Corridor Separation (\`EMA Distance > 0.25 * ATR\`) and Positive CCI Slope (\`CCI Slope > 0\`). Verified raising TCB CALL accuracy to **68.64%** and expectancy to **+0.2356** on a completely unseen independent 50,000-candle dataset.

### Phase 5.2 — TCB CALL Multi-Filter (2026-07-14)
- Modified \`evaluateSignal\` in \`src/lib/market-data/core/SignalEngine.ts\` to add \`isTcbCallFilterSatisfied\` named boolean.
- Appended \`isTcbCallFilterSatisfied\` to TCB CALL setup entry criteria, checking EMA-SMA separation and positive CCI slope direction.
- Verified zero regressions on PUT, RER, and confidence/QS calculations.
- Passed all 7 validation criteria on unseen dataset ($p = 0.0021 < 0.05$).

**Files modified**:
- \`src/lib/market-data/core/SignalEngine.ts\` — lines 555-575
- \`AI_HANDOVER.md\` — updated completion status and trading models
- \`Current_task.md\` — updated current sprint status and checklists
- \`graphify.md\` — updated architecture documentation and references
- \`docs/Phase_5.2_Independent_Validation_Report.md\` — created validation report
- \`docs/CHANGELOG.md\` — this file

---

## v1.4 — 2026-07-14 — BASELINE FREEZE (Post-Phase 4.2A)

### Summary
Implemented a new non-redundant Quality Score calculation using marginal indicator strength and trend slopes, and replaced the fixed confidence values with dynamic score-based confidence mapping. Verified 100% signal identity (zero regressions) across 1,000 candles/pair backtesting.

### Phase 4.2A — Quality Score & Calibrated Dynamic Confidence (2026-07-14)
- Modified `calculateQualityScore` in `src/lib/market-data/core/SignalEngine.ts` to score ADX trend strength, ATR expansion, RSI momentum slope, CCI slope, and stochastic pullback depth.
- Implemented `calculateOldQualityScore` for threshold checks to maintain F5 bypass compatibility.
- Implemented Dynamic Confidence mapping formula: TCB base 65% / RER base 75%, scaled by `(qScore - 70) * 0.5`.
- Verified 100% signal count, win/loss outcome, and performance metric parity against Baseline v1.3.

**Files modified**:
- `src/lib/market-data/core/SignalEngine.ts` — lines 264-326, 520-560
- `AI_HANDOVER.md` — updated status, trading models, and update logs
- `Current_task.md` — updated status and verification checklist
- `graphify.md` — updated architecture documentation and statistics
- `docs/BASELINE_v1.4_REPORT.md` — created baseline v1.4 engineering reference report
- `docs/archive/phase42a_implementation_report.md` — archived implementation report
- `docs/CHANGELOG.md` — this file

---

## v1.3 — 2026-07-14 — BASELINE FREEZE (Post-Phase 4.1A)

### Summary
TCB PUT strategy optimized by introducing Variant C (Bearish Body Momentum) to filter out counter-momentum pullback entries. Global accuracy improved from 65.5% to 73.2% (+7.7 pp) on 1,000 candles/pair validation.

### Phase 4.1A — TCB PUT Bearish Body Momentum (2026-07-14)
- Modified `src/lib/market-data/core/SignalEngine.ts` to implement `isBearishBodyMomentum` check (`Close < Open && Body > Prev Candle Body`).
- Created `scripts/phase41-ab-validate.ts` to perform multi-variant backtesting.
- Created `docs/Phase4_1_Implementation_Report.md` documenting validation results.
- Verified zero regression on CALL signals and RER strategy.

**Files modified**:
- `src/lib/market-data/core/SignalEngine.ts` — lines 508-512, 524
- `AI_HANDOVER.md` — updated status, trading models, rollback reference, and update logs
- `Current_task.md` — updated status and verification checklist
- `graphify.md` — updated architecture documentation and statistics
- `docs/CHANGELOG.md` — this file

---

## v1.2 — 2026-07-14 — BASELINE FREEZE (Pre-Phase 4)

### Summary
Production validation complete through Phase 3.5. Project frozen as official BASELINE v1.2 before any Phase 4 optimization begins.

### Phase 3.5 — Statistical Audit (2026-07-14)
- Created `scripts/phase35-audit.ts` — 4,390-window replay with full AuditSnap capture
- Created `scripts/phase35-report.ts` — 14-section production validation report
- Archived: `docs/archive/phase35_statistical_audit.md`
- **No production code modified**

**Key findings**:
- 34 signals / 4,390 windows (0.77% generation rate)
- Overall accuracy: 55.9% (n=34, 95% CI [39.2%, 72.6%])
- TCB accuracy: 48.3% (loss-making); RER accuracy: 100% (n=5)
- F5 quality score confirmed redundant (0 rejections of F4-passing windows)
- Production Readiness Score: 60/100
- 4 pairs (AUD/USD, USD/CAD, USD/CHF, EUR/GBP) produce 0 signals below 1.2 pip gate

### Phase 3 — Volatility Threshold Validation (2026-07-14)
- Historical replay: 4,390 windows across 10 FOREX pairs
- Compared 1.0 pip vs 1.2 pip thresholds
- 1.0–1.2 pip band: 44.4% accuracy; ≥1.2 pip: 67.2% (+22.7 pp)
- **Decision**: Threshold raised to 1.2 pips

**Files modified**:
- `src/lib/market-data/core/SignalEngine.ts` — line 469: `>= 1.0` → `>= 1.2`
- `scripts/phase3-validate.ts` — validation replay script (new)
- `scripts/phase3-supplement.ts` — missing pair supplement (new)
- `scripts/phase3-report.ts` — report generator (new)
- Archived: `docs/archive/phase3_validation_report.md`

---

## v1.1 — 2026-07-13 — Signal Engine Pip-Normalization

### Phase 2 — ATR Normalization Fix

**Root cause identified**: `normalizedAtr >= 0.00015` used price-ratio formula, not pip-normalized.
- Effective threshold: 0.97 pip (AUD/USD) to 2.93 pip (GBP/JPY) — 3× variance across pairs.
- AUD/USD, USD/CAD, USD/CHF, EUR/GBP were passing or failing inconsistently.

**Fix applied**: Replaced with `atrInPips >= 1.0` (pip-normalized, pair-aware).
- JPY pairs: `atrInPips = ATR / 0.01`
- All other pairs: `atrInPips = ATR / 0.0001`

**Files modified**:
- `src/lib/market-data/core/SignalEngine.ts` — line 469

**Validation**: Phase 3 historical replay confirmed pip-normalized gate produces consistent behavior across all 10 pairs.

---

## v1.0 — 2026-07-13 — Premium Access Fix

### Phase 1 — Authentication Reliability

**Root cause identified**: `getUser()` makes a live Supabase Auth API call (`GET /auth/v1/user`).
When the API was temporarily unreachable or rate-limited, `getUser()` returned null, poisoning the downstream access state check.
`getSession()` reads from local cookie storage (no API call) and worked correctly in the same context.

**Fix applied**: Added `getSession()` fallback after `getUser()` returns null.

**Files modified**:
- `src/app/actions/admin_optimization.ts` — `getUserAccessState()` (lines 29–36) + `verifyAdmin()` (lines 10–16)

**Verification**: TypeScript 0 errors. Premium dashboard, Timeline, Asset Filter, Live FOREX page all operational. No auth regression.

---

*All versions measured against BASELINE v1.2 going forward.*
