# Phase 23.6 — Persistence Reliability Verification

**Date**: 2026-07-18
**Status**: VERIFICATION INFRASTRUCTURE DEPLOYED (awaiting localhost test execution)
**Scope**: OTC persistence reliability — Live FOREX untouched

---

## 1. Objective

**Goal**: Prove that 100% of authenticated scans successfully persist to the database.

**What was previously unknown**:
- `saveSignal()` fails silently (generic `'Failed to save signal'` with no detail)
- The actual Supabase error (code, message, details, hint) was never captured
- Session/auth state at time of failure was never recorded
- Pattern of failures (burst vs sporadic, time-of-day correlation) was invisible

**This phase builds instrumentation to answer every open question.**

---

## 2. Architecture of the Diagnostics System

```
Browser (useOTCExecution.ts)
  │  calls scan()
  ▼
OTCExecutionEngine.scan()
  │  calls saveSignal()
  ▼
saveSignal() [server action — signals.ts]
  │  ┌── success → persistenceDiag.recordSuccess()
  │  └── failure → persistenceDiag.recordFailure({
  │                    timestamp, errorCode, errorMessage,
  │                    errorDetails, errorHint, httpStatus,
  │                    pair, direction, userId, phase
  │                 })
  ▼
persistenceDiag (in-memory store)
  │  tracks: totalAttempts, successfulSaves, failedSaves
  │  stores: last 50 failures with full Supabase error detail
  ▼
GET /api/diagnostics/persistence [admin-only]
  │  returns: complete metrics + last N failure records
  ▼
Admin dashboard / curl
```

---

## 3. What Each Component Captures

### 3.1 — `persistence-diagnostics.ts` (in-memory store)

| Metric | Type | Description |
|--------|------|-------------|
| `totalAttempts` | number | Every call to `saveSignal()` |
| `successfulSaves` | number | `saveSignal()` returned `{ success: true, signalId }` |
| `failedSaves` | number | `saveSignal()` returned `{ success: false }` or threw |
| `lastFailures` | array | Last 50 failures (FIFO) |
| `startTime` | ISO string | When the store was initialized |
| `lastAttemptTime` | ISO string \| null | Last call to `saveSignal()` |

### 3.2 — Failure Record Detail

| Field | Source | Example |
|-------|--------|---------|
| `timestamp` | `new Date().toISOString()` | `"2026-07-18T12:00:00.000Z"` |
| `errorCode` | Supabase `error.code` | `"42501"`, `"23505"`, `"AUTH_FAILED"` |
| `errorMessage` | Supabase `error.message` | `"new row violates row-level security policy"` |
| `errorDetails` | Supabase `error.details` | `"Key (id)=(uuid) already exists"` |
| `errorHint` | Supabase `error.hint` | `"Check the RLS policy for the signals table"` |
| `httpStatus` | Supabase `error.status` | `401`, `403`, `409`, `500` |
| `pair` | `input.pair` | `"EUR/USD"` |
| `direction` | `input.direction` | `"CALL"` |
| `userId` | `checkApproved()` result | UUID or `null` |
| `phase` | Which step failed | `"checkApproved"`, `"supabaseInsert"`, `"exception"` |

### 3.3 — Three Failure Phases

```
Phase 1: checkApproved()       → phase: 'checkApproved'
  │  errorCode: 'AUTH_FAILED'
  │  errorMessage: 'Unauthorized'
  │  errorDetails: 'session missing, expired, or user not approved'
  │  errorHint: 'Verify user session and approval status'
  │  httpStatus: 401

Phase 2: Supabase INSERT       → phase: 'supabaseInsert'
  │  errorCode:    (actual Supabase error code)
  │  errorMessage: (actual Supabase error message)
  │  errorDetails: (actual Supabase error details)
  │  errorHint:    (actual Supabase error hint)
  │  httpStatus:   (actual HTTP status)

Phase 3: Exception (catch)     → phase: 'exception'
  │  errorCode: 'EXCEPTION'
  │  errorMessage: (exception message)
  │  errorDetails: (stack trace)
```

---

## 4. Delivered Artifacts

### New files

| File | Purpose |
|------|---------|
| `src/lib/otc/persistence-diagnostics.ts` | In-memory metrics store with FIFO failure buffer (50 records) |
| `src/app/api/diagnostics/persistence/route.ts` | Admin-only GET endpoint returning full metrics |
| `scripts/phase23d-persistence-verification.mts` | Test script: 10× real Supabase INSERT + anonymous client test |

### Modified files

| File | Change |
|------|--------|
| `src/app/actions/signals.ts:107-175` | `saveSignal()` instrumented: captures Supabase error.code, .message, .details, .hint, .status on every failure; tracks success count; records userId and phase |

---

## 5. How to Run the Verification

### Tier 1 — DB-level verification (run now)

```bash
npx tsx scripts/phase23d-persistence-verification.mts
```

What it tests:
- 10× INSERT into `public.signals` via admin client (service role)
- Anonymous INSERT attempt (verifies RLS blocks unauthenticated requests)
- Schema introspection (verifies `signals` table is accessible)
- Full error detail capture (code, message, details, hint, status)

### Tier 2 — Full-stack verification (requires running server)

1. Start the dev server: `npm run dev`
2. Log in as an approved user
3. Open the OTC signals dashboard
4. Perform 10+ scans manually
5. Check the diagnostics endpoint:
   ```bash
   curl http://localhost:3000/api/diagnostics/persistence
   ```
   (Or open the URL in browser while logged in as admin)

Expected response:
```json
{
  "totalAttempts": 10,
  "successfulSaves": 10,
  "failedSaves": 0,
  "lastFailures": [],
  "startTime": "2026-07-18T...",
  "lastAttemptTime": "2026-07-18T..."
}
```

### If failures appear

If `failedSaves > 0`, the `lastFailures` array contains every Supabase error with full detail. This definitively answers:

| Question | Answered by |
|----------|-------------|
| Is it auth session missing? | `phase: 'checkApproved'` |
| Is it JWT expired? | `phase: 'checkApproved', errorCode: 'AUTH_FAILED'` |
| Is it 401 Unauthorized? | `httpStatus: 401` |
| Is it RLS rejection? | `phase: 'supabaseInsert', errorCode: '42501'` |
| Is it network timeout? | `errorMessage contains 'timeout'` |
| Is it a server action cookie issue? | `phase: 'checkApproved'` — confirms if session reaches server action |
| Is it a constraint violation? | `errorCode: '23505'` (duplicate), `'23514'` (check violation) |

---

## 6. Expected Outcomes

### If Tier 1 passes (DB insert works) but Tier 2 fails (server action fails)

This isolates the problem to the **auth/session layer**:
- The signals table schema is correct
- RLS allows authenticated inserts
- The issue is in how the server action delivers the authenticated user context
- Likely candidates: session cookie not sent, cookie expired, `checkApproved()` user query fails

### If Tier 1 fails (DB insert fails)

This indicates a **schema/RLS/constraint** problem:
- Signals table CHECK constraint doesn't allow the insert values
- RLS is blocking even service role (misconfiguration)
- Missing column or type mismatch

### If both pass

**Persistence is 100% reliable at the DB and auth layers.** Any remaining failures are transient network issues, which should be <0.1% rate.

---

## 7. What This Phase Does NOT Change

| Area | Status |
|------|--------|
| Live FOREX | Untouched |
| Market Data | Untouched |
| Signal Engine | Untouched |
| Settlement logic | Untouched |
| WIN/LOSS/REFUND | Untouched |
| UI/UX | Untouched |
| Countdown | Untouched |
| Membership | Untouched |
| ProviderManager | Untouched |
| Indicator Engine | Untouched |
| Any trading strategy | Untouched |

---

## 8. Post-Verification: Removing Diagnostics (when to clean up)

The diagnostic instrumentation (`persistence-diagnostics.ts`, diagnostics API route, saveSignal instrumentation) should be removed once:

1. **Tier 1 + Tier 2 both pass** with 100% success rate over 100+ scans
2. **The root cause is identified** (if failures exist)

To remove:
- Delete `src/lib/otc/persistence-diagnostics.ts`
- Remove `src/app/api/diagnostics/persistence/route.ts`
- Remove `persistenceDiag` import and calls from `src/app/actions/signals.ts`
- Delete `scripts/phase23d-persistence-verification.mts`
