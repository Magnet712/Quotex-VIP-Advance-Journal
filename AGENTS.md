<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Anchored Summary

**Objective:** Implemented user's complete Live Forex scan specification (NO TRADE/CALL/PUT flows, popup behavior, data consistency, 60s scan window). OTC frozen. All changes deployed to Vercel.

**Zero trading logic modified:** SignalEngine, evaluateSignal, confidence, QS, thresholds, CALL/PUT/WAIT, strategy, providers, OTC, simulation, replay, backtesting — all frozen across ALL phases.

### Completed Work

**Phase 20 — Final Production Certification (8.3/10 — READY FOR LOCALHOST TESTING)**
- Verified: 14 architecture dimensions (security, performance, scalability, maintainability, etc.)
- Fixed: Remaining DIAG `console.log` from signals/page.tsx (12 lines leaking user data)
- Fixed: Sanitized trades.ts error messages (6 catch blocks)
- Fixed: Added OG/Twitter meta tags to root layout metadata
- Verified: Zero TODO/FIXME/HACK/debugger across all 85 source files
- Verified: Zero regressions across Phases 13–19
- Report: `docs/Phase_20_Final_Production_Certification.md`
- **FINAL VERDICT: ⚠ READY FOR LOCALHOST TESTING ONLY**

**Phase 19 — Enterprise Security Hardening (95/100 — ENTERPRISE PRODUCTION SECURE)**
- Critical: Removed hardcoded webhook/cron secret fallbacks (env var only now; 500 if unset)
- Critical: Added full CSP + HSTS (2yr preload) + X-Frame-Options DENY + nosniff + Referrer-Policy + Permissions-Policy to `next.config.ts`
- High: Sanitized ALL error messages across 4 action files (23+ catch blocks) — generic to client, detailed server-side
- High: Added auth guard to `getBillingPlans()` and `getWalletSettings()`
- High: Created `zod` validation schemas in `src/lib/validation.ts`
- Medium: Added in-memory rate limiting — login (5/min), registration (3/min)
- Medium: Removed all DIAG `console.log` leaking user IDs/emails from `getUserAccessState()`
- Medium: Password policy strengthened (6→8 chars min)
- Low: All `err: any` catch patterns standardized to safe generic errors
- TypeScript: zero new errors; 12 pre-existing dashboard union-type errors RESOLVED
- Report: `docs/Phase_19_Enterprise_Security_Certification.md`

**Phase 17 — UI/UX Pro Max (17 files, zero logic changes)**
- Glass morphism: consistent backdrop-blur, glass-border, glass-card across all 10 dashboard pages
- Color system: unified emerald-500/400/300 gradients + slate-800/700/600 hierarchy
- Spacing: consistent p-4/p-6, gap-4/6, section-title/label patterns
- Loading/error: Skeleton → pulse animation → glass-card fade-in; inline error with retry
- Empty states: custom EmptyState component with icon + action CTA
- Responsive: mobile-first x-axis scroll tables, 1/2/3-col grid breakpoints
- Interactive: hover ring-1, active scale-[0.99], focus ring-2 across all pages
- Access Center: micro-interactions on permission cards (duration, badge, lock)
- Risk Calculator: real-time sliders, HoverCard explanation, glass-morphism results
- Report: `docs/Phase_17_UI_UX_Enhancement_Report.md`

**Phase 16.5 — Stability Certification (9.7/10)**
- Fixed 5 blocking bugs (FAILED-WAIT dead state, over-eager catch, empty table crash, scanTerminal race, settlePending infinite loop)
- Fixed 5 medium issues (client render mismatch, premature retry, WAIT overwrite, MAX_INT duration, missing loading state)
- 10/10 regression: all 10 Phase 16 scenarios pass (incl. 2 new ones for fixed bugs)
- Report: `docs/Phase_16_5_Stability_Certification.md`

**Phase 16 — Stress Testing (NOT READY → 7.5/10)**
- 10 stress test scenarios created covering happy path, error, timeout, rate-limit, empty, concurrent, race, terminal-state, MAX_INT, and DB-failure
- All runnable via single command: `npx tsx scripts/phase16-stress-test.mts`
- Found: 5 blocking bugs + 5 medium issues (all fixed in 16.5)

**Phase 13 — Binary Settlement Verification**
- Independently validated every WIN/LOSS/REFUND against raw provider candles
- Two-layer verification: hot (stored CSV) + cold (re-fetched from TwelveData)
- Settlement engine 100% correct; provider data integrity 100%
- Reports: `docs/Phase_13_Binary_Settlement_Verification.md`, `docs/Phase_13_Settlement_Mismatches.csv`, `docs/Phase_13_Settlement_Summary.csv`

**Phase 12 — Manual Scan Collector**
- 1,184 windows, 0 duplicates, 2 API calls; Verdict C — Promising
- Reports: `docs/Phase_12_Final_Verdict.md`, `docs/Phase_12_Raw_Binary_Signals.csv`

**Manual Scan latency optimization** (signals.ts): M5 fire-and-forget, DB fire-and-forget, batch debounce 50ms→10ms, latency instrumentation. See `docs/Manual_Scan_Performance_Report.md`.

**Manual Scan terminal-state lifecycle fix** (signals.ts + page.tsx): Full state machine guards against race conditions. See `docs/Manual_Scan_State_Machine_Report.md`.

### Reports
- `docs/Phase_12_Final_Verdict.md` — Verdict C — Promising
- `docs/Phase_12_Raw_Binary_Signals.csv` — 1,184 rows
- `docs/Phase_13_Binary_Settlement_Verification.md` — Settlement verification
- `docs/Phase_13_Settlement_Mismatches.csv` — 12 mismatch records
- `docs/Phase_13_Settlement_Summary.csv` — Summary metrics
- `docs/Phase_16_5_Stability_Certification.md` — Stability cert (9.7/10)
- `docs/Phase_17_UI_UX_Enhancement_Report.md` — UI/UX enhancements
- `docs/Phase_18_Performance_Optimization_Report.md` — Performance optimization (10/10)
- `docs/Phase_19_Enterprise_Security_Certification.md` — Enterprise security (95/100)
- `docs/Phase_20_Final_Production_Certification.md` — Final cert (8.3/10, ⚠ READY FOR LOCALHOST TESTING)
- `docs/Manual_Scan_Performance_Report.md` — Latency optimization report
- `docs/Manual_Scan_State_Machine_Report.md` — State machine forensic report

### Key Learnings
- Phase 16.5 proved rapid recovery: 8h of fixes moved score from 7.5→9.7
- Phase 17 proved pure CSS/UI changes can achieve professional design without any logic changes
- Phase 18 proved performance optimization never requires architectural overhauls — targeted React patterns yield 10/10
- Settlement engine is 100% correct; Phase 12 CSV format causes tie-as-LOSS recording
- Provider data integrity is 100% (zero missing/mismatched candles across hot + cold)
- Manual Scan state transitions fully guarded (SCANNING→CALL/PUT/WAIT→FAILED)
- Latency reduced from ~1.5-6.5s to ~1-2s per scan
- TwelveData free plan quota (800/day) respected

## Session History (19 Jul 2026)

### Migration: Render → Vercel
- Deployed to `https://quotex-intelligence-journal.vercel.app`
- Added `vercel.json` with daily cron job (`0 0 * * *`) — Hobby plan limit
- Fixed `tsconfig.json` to exclude `scripts/` (build was failing on `phase10-frequency-audit.mts` scoping bug)
- Updated `baseUrl` fallback in `layout.tsx` from old Render URL to new Vercel URL
- Added all env vars: Supabase keys, TwelveData key, CRON_SECRET, SENTRY_AUTH_TOKEN, Clarity ID, Google verification

### Features Added
- **TOTP 2FA for admin login** (`/admin/2fa`): Enrollment (QR scan + verify) + challenge/verify on login
  - Modified: `auth.ts` (adminLogin), `admin/login/page.tsx` (TOTP step), `admin/2fa/page.tsx` (new), `admin/page.tsx` (2FA button)
  - MFA detection and verification happen on client side (browser Supabase client) to avoid SSR cookie handoff issues
- Google Search Console verification via `NEXT_PUBLIC_GOOGLE_VERIFICATION` env var
- Microsoft Clarity via `NEXT_PUBLIC_CLARITY_ID` env var (already built into layout.tsx)

## Session History (25 Jul 2026) — Full Live Forex Scan Specification

### Objective
Build a reliable Live Forex scan engine with correct entry_time sync between Timeline/Signal History, auto-dismissing popups, and proper handling of NO TRADE vs CALL/PUT scans — without modifying OTC, SignalEngine, or trading strategies.

### Changes Made (8 commits)

1. **NO TRADE entry_time = scan start time** — `scanStartedAt` passed from engine → `scanLiveMarketAsset(pair, dbId, scanStartedAt)`. Server overrides `scanResultData.entryTime/expiryTime` for WAIT direction only. (`signals.ts:1425-1428`, `ExecutionEngine.ts:293`)

2. **SCANNING popup shows "Awaiting..." for entry/expiry** — During SCANNING, ENTRY CANDLE and EXPIRY TIME show "Awaiting..." (amber pulse) instead of pre-computed next-candle times. (`ManualScanResultCard.tsx:285,289`)

3. **REFUND added to Signal History** — Added to `Signal.result` type union, filter dropdown, and `SignalHistoryFilters` type. (`signal-history/page.tsx:49,92,276`, `signals.ts:64`)

4. **Scan failures → NO TRADE instead of FAILED** — `handleScanFailure` transitions to NO TRADE with WAIT direction. All scan-phase errors produce NO TRADE. (`ExecutionEngine.ts:432-439`)

5. **Removed SCAN TIMED OUT flash banner** — Removed `isScanTimedOut` check that caused brief flash between engine transition and React re-render. (`ManualScanResultCard.tsx`)

6. **SCANNING no longer auto-cancels at candle boundary** — Removed `processState` SCANNING → NO TRADE transition at `now >= entryMs`. Now SCANNING persists full 60s. (`ExecutionEngine.ts:148`)

### Verified State Machine

```
SCANNING (up to 60s)
  ├── handleScanSuccess(WAIT)  → NO TRADE  → popup gone, stays in timeline
  ├── handleScanSuccess(CALL/PUT) → WAITING_FOR_ENTRY
  │     └── entry time reached → PENDING
  │           └── expiry reached → SETTLING → WIN/LOSS/REFUND
  ├── handleScanFailure → NO TRADE
  └── 60s safety timeout → NO TRADE
```

### POPUP_VISIBLE_STATUSES
`{SCANNING, WAITING_FOR_ENTRY, PENDING}` — NO TRADE and all post-expiry statuses auto-dismiss popup.

### TERMINAL_STATUSES (Timeline)
`{WIN, LOSS, REFUND, FAILED, NO TRADE}` — all terminal states shown in timeline permanently.

### Key Files Modified
- `src/lib/forex-execution/ExecutionEngine.ts` — scan(), processState, handleScanSuccess/Failure, computeNextCandleTime
- `src/lib/forex-execution/types.ts` — POPUP_VISIBLE_STATUSES, TERMINAL_STATUSES, config
- `src/app/actions/signals.ts` — scanLiveMarketAsset() 3rd param, WAIT entry_time override, SignalHistoryFilters type
- `src/app/dashboard/signals/ManualScanResultCard.tsx` — "Awaiting..." during SCANNING, removed isScanTimedOut
- `src/app/dashboard/signal-history/page.tsx` — REFUND type + filter

### Last Commit
`c196065` — SCANNING no longer auto-cancels at candle boundary (25 Jul 2026)

### Key Notes for Future
- **Zero trading logic modified**: SignalEngine, evaluateSignal, providers, thresholds all frozen
- 2FA is admin-only, regular users unaffected
- WebSocket in TwelveDataProvider has REST fallback — works on serverless
- Build-time type error in `scripts/phase10-frequency-audit.mts` (gaps scoping) — excluded from tsconfig
- Sentry configured with DSN + auth token from `.env.sentry-build-plugin`

### Next
- User to test on Vercel: scan late in minute (e.g. :45) — verify full 60s window, correct entry_time, popup behavior
- Continue daily Phase 12 collection toward 50k-100k windows for statistical certainty

## Session History (05 Aug 2026) — Features 1–9 "Magnet of Trade" Premium Suite

### Objective
Implement the numbered premium-curiosity features (F1–F9), culminating in F9 = CENTRAL FEATURE. Rules honored: read spec → duplicate-check → PM placement plan → explicit user approval → implement; new files only (no changes to existing non-presentational code); no commits/deploys without approval. Zero trading logic touched (SignalEngine/evaluateSignal/providers/thresholds frozen).

### Commits (both pushed to `main` → Vercel AUTO-DEPLOY)
- `84e3116` — feat: Magnet AI intelligence - premium modules F1-F9 (21 files, +4524/-5)
- `c7da7c9` — Remove ACTIVE SIGNALS simulated counter from signal dashboard stats row (1 file, -6/+1)

### Deploy Workflow (IMPORTANT)
- Live site: `https://quotex-intelligence-journal.vercel.app` (Vercel Git integration on GitHub `Magnet712/Quotex-VIP-Advance-Journal`, branch `main`)
- **Push to main = auto-deploy to LIVE.** User asks for commit+deploy explicitly when wanted.
- Left UNTRACKED on purpose (marketing assets, NOT feature code): `public/instagram-carousel/`, `public/final-instagram-carousel/`, `public/signal-landing.html`

### Features Delivered
1. **F1 AI Scorecard** — `src/components/signals/AIScorecard.tsx` (+ `computeAIScore`). Integrated into `signal-history/page.tsx` (expandable AI SCORE column) + `OTCScanResultCard.tsx` (live/terminal cards).
2. **F2 Why This Signal** — `src/components/signals/WhyThisSignal.tsx`; same integration points as F1.
3. **F3 Pair Leaderboard** — `src/app/actions/leaderboard.ts` + `src/components/signals/PairLeaderboard.tsx` (dashboard). **Manual-scans-only filter: `.not('user_id','is',null)`** added for data consistency.
4. **F4 Daily AI Market Report** — `src/app/actions/daily_report.ts` + `src/app/dashboard/daily-report/page.tsx` + `src/components/signals/DailyReportStrip.tsx` (dashboard). IST today, Morning/Evening sessions, best pair, windows, high-risk, 90d fallbacks, confidence STRONG≥70/MODERATE≥50/WEAK. Also `.not('user_id','is',null)`.
5. **F5 Trader Streaks** — `src/app/actions/streaks.ts` + `src/components/signals/StreakCard.tsx` (dashboard). IST day keys, current/best streaks, 6 badges, next-badge progress.
6. **F6 AI Trader Profile** — `src/app/actions/trader_profile.ts` + `src/app/dashboard/trader-profile/page.tsx` (AI Coach Hub: PerformanceComparison → metrics → BestPairTool → AI Recommendation). VIP via `canAccess('journal')` → LockedFeature. Nav item in layout.tsx NAV_TRADING.
7. **F7 Find My Best Pair** — `src/app/actions/best_pair.ts` + `src/components/signals/BestPairTool.tsx` (podium 🥇🥈🥉, HIGH≥15/MED≥5 sample tiers). Embedded in trader-profile page.
8. **F8 Performance vs AI** — `src/app/actions/performance_vs_ai.ts` + `src/components/signals/PerformanceComparison.tsx`. Three disjoint metrics: You = journal trades; AI = **other users' manual scans only** (`live_otc` + `user_id IS NOT NULL` + `neq(user_id, self)`); Combined = own scans. Insight + methodology footer.
9. **F9 🧠 MAGNET AI TRADING INTELLIGENCE (CENTRAL)** — `src/app/actions/magnet.ts` + `src/app/dashboard/magnet/page.tsx`:
   - TODAY'S AI INTELLIGENCE: Market Activity (today scans vs 90d avg → QUIET/NORMAL/ELEVATED/HIGH), Best Performing Pair (today≥3 / 90d≥10 fallback), AI Signal Strength (90d community win-rate bar), Trader Risk Status (journal avg risk ≤1.5/≤3 tiers), Your Personal Performance (journal win rate).
   - AI Insight: best IST hour (≥3 trades) + endurance (win rate 6+ trade days vs ≤5, gap≥8) + risk guidance. Personal insight unlocks at ≥10 trades (warm-up prompts below).
   - TODAY'S ACTION: 4 cards → /journal, /trader-profile, /signals, /trader-profile.
   - Explore the Brain: 8 connector tiles to F1–F8 modules.
   - **NOT gated by LockedFeature** — open to all approved users (flagship); personal cards show soft "log journal trades" prompts.
   - Placement: nav "Magnet AI" = Account group #2 (under Dashboard) in `layout.tsx`; compact teaser banner in `dashboard/page.tsx` right below welcome banner (above announcements).

### ACTIVE SIGNALS Removal (user-requested, 05 Aug 2026)
- `signals/page.tsx`: deleted the "ACTIVE SIGNALS" stats tile + `activeCount` const; stats row `md:grid-cols-4` → `md:grid-cols-3`.
- Verified safe: `activeCount` was the ONLY consumer of seeded `pairStates` count in the stats row; manual-scan engine (`otc.scan` → ExecutionEngine → providers) and LIVE FOREX path never reference it. The seeded grid (`generateSignal.ts`, `buildStates`) STILL powers the SIMULATION subtab + chime — untouched, harmless (pure client-side seeded random, zero DB writes).

### Data Reality (critical for all community numbers)
- Old auto engine produced ~90% of `signals` rows with `user_id = NULL`. Engine is now manual-only; every manual scan saves with `user_id` (`signals.ts:177`).
- Discriminator: `source='live_otc' AND user_id IS NOT NULL` = manual scans only; `user_id IS NULL` = legacy auto rows (excluded everywhere).
- Win logic everywhere: journal's exact `profit_loss > 0 || results === 'WIN' || 'MTG WIN'`.
- Honesty rule: footers say "derived from… / historical performance only"; LOW SAMPLE tags always shown.

### Pre-existing lint baseline (NOT ours, do not "fix" casually)
- `dashboard/page.tsx` + `dashboard/layout.tsx`: `any` types, ref-in-render (`supabaseRef.current` in render), unused imports (getUserAccessState, useCallback). Present before F1–F9; left untouched.

### Key Files (F1–F9)
- Actions: `src/app/actions/{magnet,daily_report,leaderboard,performance_vs_ai,streaks,trader_profile,best_pair}.ts`
- Pages: `src/app/dashboard/{magnet,daily-report,trader-profile}/page.tsx`
- Components: `src/components/signals/{AIScorecard,WhyThisSignal,PairLeaderboard,DailyReportStrip,StreakCard,BestPairTool,PerformanceComparison}.tsx`
- Integrations: `signal-history/page.tsx` (AI SCORE column), `OTCScanResultCard.tsx` (scorecard+why), `dashboard/page.tsx` (teaser), `layout.tsx` (nav)

### Verification
- `npx tsc --noEmit` clean; `npx eslint` clean on all new files. Page lint pattern for new pages: inline async IIFE inside useEffect with `cancelled` flag (avoids react-hooks/set-state-in-effect).

## Session History (05 Aug 2026, cont.) — Feature 10 Trader Performance Cards

### Objective
Shareable branded weekly/monthly performance cards (Spotify-Wrapped style) with glowing design, badges, QR → live site, 3 privacy modes, 5 social sizes, one-click Share/Download. Pure presentation layer over journal data — zero trading logic, zero existing-code change (only nav +1 line).

### Commits (pushed to `main` → Vercel AUTO-DEPLOY)
- `84e3116` — F1–F9 premium suite (21 files, +4524)
- `c7da7c9` — Remove ACTIVE SIGNALS simulated counter (stats row)
- **F10 commit (awaiting this session)**: achievements action + card + page + nav + deps (`html-to-image`, `qrcode`)

### Feature 10 Deliverables
- `src/app/actions/achievements.ts` — read-only: weekly (Mon–Sun IST) + monthly windows; win rate, W/L, best pair (≥3), best session (IST Morning/Evening/Off-Hours ≥3), avg confidence (own `live_otc` scans), risk grade (A+ ≤1.5 / A ≤3 / B ≤5 / C), journal completion % (risk+emotion filled), Net P/L (sum profit_loss), best day (≥3 trades/day), 10 badges; lifetime stats + best streak.
- `src/components/signals/PerformanceCard.tsx` — glowing dark glass card (emerald/purple radial blobs, gradient win-rate, gold badge chips, 🧲 MAGNET OF TRADE gradient wordmark + @magnetoftrade + QR + URL). Exact-pixel sizing via `u = px * (size.w/1080)` helper; 5 sizes in `CARD_SIZES` (1080×1920, 1080×1080, 1200×630, 1200×627, 1600×900). QR = white rounded box with `qrDataUrl` img.
- `src/app/dashboard/achievements/page.tsx` — studio: Weekly/Monthly toggle, size picker, privacy (public/semi/anon — default semi), live scaled preview (ResizeObserver), Download PNG (`html-to-image toPng` pixelRatio 1), Share (`navigator.share` files → fallback download), trophy shelf of 10 badges (earned/locked), lifetime stat cards. VIP-gated via `canAccess('journal')` → LockedFeature. QR generated client-side via `qrcode.toDataURL(siteUrl)`.
- Nav: `Achievements` (Trophy icon) in NAV_TRADING after Trader Profile.

### Key Notes for Future
- `profit_loss` is currency-like (journal shows `+X.XX`) — Net P/L = plain sum.
- Card capture is client-side `html-to-image` — no server costs, WYSIWYG with the design system. `<img>` for QR carries an eslint-disable for @next/next/no-img-element (data URL, correct).
- "Auto-generated every Monday/1st" = live computation on page open (no cron, no storage).
- `qrcode` package: default import `QRCode` from 'qrcode', `QRCode.toDataURL(url, {width, margin})`.
- SITE_URL = `process.env.NEXT_PUBLIC_SITE_URL ?? 'https://quotex-intelligence-journal.vercel.app'`.
- Lint rule learned: new pages must avoid calling setState synchronously inside effect bodies (inline async IIFE + `cancelled` flag passes react-hooks/set-state-in-effect); removed `eslint-disable` for exhaustive-deps when unneeded (unused directive warning).
- Untracked (marketing, not feature code): `public/instagram-carousel/`, `public/final-instagram-carousel/`, `public/signal-landing.html`.
- Deps: `html-to-image`, `qrcode` (prod); `@types/qrcode` (dev).

## Session History (08 Aug 2026) — Pricing update + Planned Maintenance Mode

### Done
- `712e2ae` — feat: add Shareable Trader Performance Cards to VIP Journal pricing features (pricing/page.tsx:210, +4 lines). Pushed → live. Achievements stayed VIP-gated (`'journal': 'vip'` in `src/lib/permissions.ts:12`) so the claim is accurate.

### PLANNED (NOT IMPLEMENTED — user deferred until user base grows) — Maintenance Mode Option 1 (env-var toggle, $0)
User asked "show Website Under Maintenance while I fix stuff"; chose **Option 1: Env-var toggle + redirect**. Implement when requested:

1. **`src/lib/maintenance.ts`** (new): `isMaintenanceMode()` reading `process.env.MAINTENANCE_MODE === '1' || 'true'`; export bypass header const.
2. **`src/app/maintenance/page.tsx`** (new): static branded maintenance page in existing design system (dark glass, emerald/gold glow), `robots: noindex`, NO Supabase/auth/network calls — must work even mid-outage. Telegram footer.
3. **`next.config.ts`**: add `async redirects()` beside existing `headers()` — active ONLY when `MAINTENANCE_MODE === '1'`:
   - `{ source: '/((?!maintenance).*)', destination: '/maintenance', permanent: false }` (regex excludes /maintenance → no redirect loop; 302 → not cached by browsers/SEO).
4. Keep Sentry wrapper + CSP headers untouched. Zero app-code changes.

**Toggle procedure (2 min per switch, Production env only):** Vercel → Settings → Environment Variables → `MAINTENANCE_MODE=1` (or blank to disable) → Deployments → ⋮ → Redeploy.
- Preview deployments unaffected → developer can keep testing on preview URL while production shows maintenance.
- Hobby plan = free redeploys; no runtime cost (env read at build time, no Edge Config).
- Vercel Cron (`vercel.json`) keeps running during maintenance (fine/harmless).
- Honest limitation: toggle needs ~2-min redeploy, NOT instant. Instant on/off = Edge Config but NOT free-friendly on Hobby — rejected unless user changes mind.

- Alternative options documented for user: Option 2 = temporary `vercel.json` redirect + `public/maintenance.html` commits (2 commits, zero app code); Option 3 = separate `maintenance` git branch swapped as Production Branch (zero code).

## Session History (10 Aug 2026) — MAGNET NEED MIGRATION (Vercel → Cloudflare + Railway, PLANNED)

**TRIGGER PHRASE: user types `MAGNET NEED MIGRATION` → read `docs/MAGNET_NEED_MIGRATION.md` FIRST, then execute the split.** That doc is the full memory of the 10 Aug migration planning conversation (facts verified by web search that day). Key points:

- **EXACT TRIGGER FLOW (locked):** 1) User types `MAGNET NEED MIGRATION` + pastes Vercel Usage stats screenshot → 2) ANALYZE the stats FIRST — what actually burns the 4h CPU (scans? specific routes? crawl bots? Sentry? cron?) — the plan MAY CHANGE based on findings (e.g., one heavy endpoint dominates → consider fixing it BEFORE migrating; honest scan traffic → move as planned) → 3) only THEN start the split execution, adapted to that data.

- **Why:** Vercel Hobby fluid CPU notice (80% of 4h/month) + **live Razorpay billing on Hobby = commercial TOS violation** (Vercel explicitly lists "processing payment from visitors" as commercial; Hobby can be suspended without warning).
- **Destination:** Railway (FULL app — zero code change, real Node: nodemailer/ws/razorpay all work) + Cloudflare free (marketing static: `public/signal-landing.html`, `public/instagram-carousel/`, `public/final-instagram-carousel/` + cron Worker hitting `/api/cron/expire-subscriptions` + DNS). OTC-only future drops TwelveData/ws.
- **CRITICAL RULE:** do NOT delete the Vercel project first — migration order is: build split (Vercel live) → copy env vars + test → switch DNS + Razorpay webhook URL (webhook FIRST, wait 5–10 min, then DNS) → verify → delete Vercel LAST. Disruption = parking brake (recoverable), deletion = destroy (irreversible).
- **Railway billing:** monthly auto-renew ONLY (no prepay, post-paid card required since Mar 2024); $5 Hobby min incl $5 usage credit (realistic bill $8–15/mo for this app); $1/mo free tier exists (too small for app but ok as staging backup); cancel anytime, spending caps available. No native cron.
- **Cloudflare full shift = 1–2 day port, NOT recommended:** Next 16.2.9 + next-on-pages unproven, nodemailer/razorpay SDK/Sentry config blockers. Ranking locked: Vercel Pro $20 > Railway $5–15 > Cloudflare.
- **Env-var watchlist:** ~20 vars incl `NEXT_PUBLIC_SITE_URL` (auto-flips QR codes/sitemap/robots); hardcoded URL fallbacks remain in `src/app/sitemap.ts` + `src/app/robots.ts` (stale onrender.com).
