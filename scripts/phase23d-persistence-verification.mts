/**
 * Phase 23.6 — Persistence Reliability Verification
 *
 * Tests the real Supabase signals table INSERT that saveSignal() performs.
 * Captures the exact error code, message, details, and hint for every failure.
 *
 * Two tiers:
 *   Tier 1 — Direct admin client insert (tests DB schema/RLS/constraints)
 *   Tier 2 — Localhost server action test instructions (tests auth/session)
 *
 * Requires:
 *   - .env.local with SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 *   - Running Supabase project with signals table
 *
 * Run: npx tsx scripts/phase23d-persistence-verification.mts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

// ─── Configuration ──────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TEST_PAIR = 'EUR/USD';
const TEST_COUNT = 10;

// ─── Types ──────────────────────────────────────────────────────────────────
interface InsertResult {
  index: number;
  success: boolean;
  signalId?: string;
  error?: {
    code: string;
    message: string;
    details: string | null;
    hint: string | null;
    status: number | null;
  };
  durationMs: number;
}

interface InsertPayload {
  pair: string;
  timeframe: string;
  direction: string;
  entry_price: number;
  entry_time: string;
  expiry_time: string;
  strategy_name: string;
  confidence: number;
  risk_level?: string | null;
  result: string;
  source: string;
  strategy_version?: string;
  quality_score?: number | null;
  is_premium?: boolean;
}

interface InsertResponse {
  id: string;
}

// ─── Banner ─────────────────────────────────────────────────────────────────
console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   Phase 23.6 — Persistence Reliability Verification       ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

// ─── Validation ─────────────────────────────────────────────────────────────
if (!SUPABASE_URL) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL is not set in .env.local');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error('✗ SUPABASE_SERVICE_ROLE_KEY is not set in .env.local');
  process.exit(1);
}

// Reproduce the exact signals table insert that saveSignal() performs
async function testInsert(
  adminClient: any,
  idx: number
): Promise<InsertResult> {
  const start = performance.now();

  try {
    const entryTime = new Date(Date.now() + 60_000);
    const expiryTime = new Date(entryTime.getTime() + 60_000);

    const payload: InsertPayload = {
      pair:             TEST_PAIR,
      timeframe:        '1m',
      direction:        Math.random() > 0.5 ? 'CALL' : 'PUT',
      entry_price:      1.08000 + Math.random() * 0.02,
      entry_time:       entryTime.toISOString(),
      expiry_time:      expiryTime.toISOString(),
      strategy_name:    'Phase23.6_Test',
      confidence:       80 + Math.floor(Math.random() * 20),
      risk_level:       'MEDIUM',
      result:           'PENDING',
      source:           'live_otc',
      strategy_version: 'v1.0',
      quality_score:    80 + Math.floor(Math.random() * 20),
      is_premium:       true,
    };

    const { data, error } = await adminClient
      .from('signals')
      .insert(payload as any)
      .select('id')
      .single();

    const duration = performance.now() - start;

    if (error) {
      return {
        index: idx,
        success: false,
        error: {
          code: error.code ?? 'UNKNOWN',
          message: error.message ?? 'No message',
          details: error.details ?? null,
          hint: error.hint ?? null,
          status: (error as any).status ?? null,
        },
        durationMs: Math.round(duration),
      };
    }

    const response = data as unknown as InsertResponse;

    return {
      index: idx,
      success: true,
      signalId: response.id,
      durationMs: Math.round(duration),
    };
  } catch (err: unknown) {
    const duration = performance.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      index: idx,
      success: false,
      error: {
        code: 'EXCEPTION',
        message: msg,
        details: err instanceof Error ? (err.stack ?? null) : null,
        hint: null,
        status: null,
      },
      durationMs: Math.round(duration),
    };
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nTarget table : public.signals`);
  console.log(`Test pair    : ${TEST_PAIR}`);
  console.log(`Iterations   : ${TEST_COUNT}`);
  console.log('');

  // Create admin client (service role — bypasses RLS)
  console.log('Creating Supabase admin client...');
  const adminClient = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Tier 1a: Verify connection + schema
  console.log('\n── Tier 1a: Schema introspection ──────────────────────────────');
  try {
    const { data: tableInfo, error: schemaError } = await adminClient
      .from('signals')
      .select('id')
      .limit(1);

    if (schemaError) {
      console.log(`  ✗ Cannot query signals table: ${schemaError.message}`);
      console.log(`  Code: ${schemaError.code}`);
      console.log(`  Hint: ${schemaError.hint ?? '(none)'}`);
    } else {
      console.log(`  ✓ signals table is accessible (${tableInfo.length} existing rows)`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ signals table query threw: ${msg}`);
  }

  // Tier 1b: Verify RLS — what does a non-authenticated client see?
  console.log('\n── Tier 1b: Anonymous client (simulates unauthenticated) ──────');
  try {
    const anonClient = createClient(SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anonPayload: InsertPayload = {
      pair: TEST_PAIR,
      timeframe: '1m',
      direction: 'CALL',
      entry_price: 1.08,
      entry_time: new Date().toISOString(),
      expiry_time: new Date(Date.now() + 60000).toISOString(),
      strategy_name: 'Anon_Test',
      confidence: 80,
      result: 'PENDING',
      source: 'live_otc',
    };
    const { error: anonError } = await anonClient
      .from('signals')
      .insert(anonPayload as any)
      .select('id')
      .single();

    if (anonError) {
      console.log(`  ✗ Anonymous insert blocked as expected:`);
      console.log(`    Code   : ${anonError.code}`);
      console.log(`    Message: ${anonError.message}`);
      console.log(`    Details: ${anonError.details ?? '(none)'}`);
      console.log(`    Hint   : ${anonError.hint ?? '(none)'}`);
    } else {
      console.log(`  ⚠ Anonymous insert succeeded — RLS may be too permissive`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ Anonymous query threw: ${msg}`);
  }

  // Tier 1c: Run TEST_COUNT inserts via admin client
  console.log(`\n── Tier 1c: Admin inserts (${TEST_COUNT}x) ──────────────────────`);

  const results: InsertResult[] = [];
  for (let i = 1; i <= TEST_COUNT; i++) {
    const result = await testInsert(adminClient, i);
    results.push(result);

    const icon = result.success ? '✓' : '✗';
    const id = result.success ? result.signalId!.slice(0, 8) + '…' : '—';
    const errorInfo = result.error
      ? ` | code=${result.error.code} status=${result.error.status} msg="${result.error.message}"`
      : '';
    console.log(`  [${i}/${TEST_COUNT}] ${icon} id=${id} ${result.durationMs}ms${errorInfo}`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  const total = results.length;
  const successes = results.filter(r => r.success).length;
  const failures = results.filter(r => !r.success).length;
  const durations = results.map(r => r.durationMs);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Results                                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Total attempts : ${total}`);
  console.log(`  Successful     : ${successes}  (${(successes / total * 100).toFixed(1)}%)`);
  console.log(`  Failed         : ${failures}  (${(failures / total * 100).toFixed(1)}%)`);
  console.log(`  Duration       : avg=${avgDuration.toFixed(0)}ms min=${minDuration}ms max=${maxDuration}ms`);
  console.log('');

  if (failures > 0) {
    console.log('── Failure details ────────────────────────────────────────────');
    for (const r of results.filter(r => !r.success)) {
      console.log(`  [${r.index}] ${r.error!.code} (HTTP ${r.error!.status}): ${r.error!.message}`);
      if (r.error!.details) console.log(`       Details: ${r.error!.details}`);
      if (r.error!.hint)    console.log(`       Hint   : ${r.error!.hint}`);
    }
    console.log('');
    console.log('  ⚠ FAILURES DETECTED — check Supabase logs for details');
    process.exit(1);
  } else {
    console.log('  ✓ ALL INSERTS SUCCEEDED — DB-level persistence is reliable');
  }

  // ─── Tier 2: Localhost verification instructions ──────────────────────────
  console.log('');
  console.log('── Tier 2: Full-stack (server action) verification ────────────');
  console.log('');
  console.log('  The DB-level insert test above confirms the schema works.');
  console.log('  To verify the FULL saveSignal() flow (auth + session + action):');
  console.log('');
  console.log('  1. Start the dev server:    npm run dev');
  console.log('  2. Log in as an approved user');
  console.log('  3. Open the OTC signals dashboard');
  console.log('  4. Perform 10+ scans manually');
  console.log('  5. Check the metrics endpoint:');
  console.log('     curl http://localhost:3000/api/diagnostics/persistence');
  console.log('     (Requires admin session — visit in browser while logged in)');
  console.log('');
  console.log('  Expected metrics:');
  console.log('    totalAttempts  = number of scans that called saveSignal');
  console.log('    successfulSaves = should equal totalAttempts');
  console.log('    failedSaves     = should be 0');
  console.log('    lastFailures     = should be empty array');
  console.log('');
  console.log('  If failedSaves > 0, the lastFailures array contains the');
  console.log('  exact Supabase error (code, message, details, hint, status).');
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
