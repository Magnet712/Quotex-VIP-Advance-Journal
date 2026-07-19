'use server';

/**
 * Signal Server Actions
 *
 * Handles all signal persistence and result tracking.
 * Called from the signals dashboard after the EXISTING generateSignal()
 * produces a result — the strategy logic is never touched here.
 *
 * Signal lifecycle:
 *   saveSignal()        → inserts with result = 'PENDING'
 *   updateSignalResult() → calculates WIN/LOSS from candle close
 *   saveCandle()        → stores the raw OTC candle
 *
 * IMPORTANT: Signals are NEVER deleted. Permanent record for credibility.
 */

import { createClient }    from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath }  from 'next/cache';
import { persistenceDiag } from '@/lib/otc/persistence-diagnostics';
import { evaluateSignal } from '@/lib/market-data/core/SignalEngine';
import { ProviderManager } from '@/lib/market-data/core/ProviderManager';
import { TwelveDataProvider } from '@/lib/market-data/forex/adapters/TwelveDataProvider';
import { YahooProvider } from '@/lib/market-data/forex/adapters/YahooProvider';
import { CandleCache } from '@/lib/market-data/core/CandleCache';
import { NormalizedCandle } from '@/lib/market-data/types';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import type { DataPipeline } from '@/lib/pipeline';

// ─── Types ──────────────────────────────────────────────────────────────────
export interface SaveSignalInput {
  pair:              string;
  timeframe:         string;
  direction:         'CALL' | 'PUT';
  entry_price:       number;
  entry_time:        Date;
  expiry_time:       Date;
  strategy_name:     string;
  confidence:        number;
  risk_level?:       string;
  source:            'simulation' | 'live_otc' | 'live_market';
  strategy_version?: string;
  quality_score?:    number;
  is_premium?:       boolean;
}

export interface SaveCandleInput {
  pair:      string;
  timeframe: string;
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  timestamp: Date;
  source:    'simulation' | 'live_otc' | 'manual';
}

export interface SignalHistoryFilters {
  date_from?:    string; // ISO date string
  date_to?:      string;
  pair?:         string;
  strategy?:     string;
  result?:       'ALL' | 'PENDING' | 'WIN' | 'LOSS' | 'FAILED' | 'NO TRADE' | 'SCANNING';
  source?:       DataPipeline;
  page?:         number;
  page_size?:    number;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
async function checkApproved() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, userId: null };

  const { data: profile } = await supabase
    .from('users')
    .select('status')
    .eq('id', user.id)
    .single();

  return { ok: profile?.status === 'approved', userId: user.id };
}

async function checkPremium() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, userId: null };

  const { data: profile } = await supabase
    .from('users')
    .select('premium_access, vip_access, status')
    .eq('id', user.id)
    .single();

  const isApproved = profile?.status === 'approved';
  const hasPremium = profile?.premium_access === true || profile?.vip_access === true;

  return { ok: isApproved && hasPremium, userId: user.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: saveSignal
// Persists a newly generated signal to Supabase with result = 'PENDING'.
// Called immediately after the existing generateSignal() produces a result.
// ─────────────────────────────────────────────────────────────────────────────
export async function saveSignal(input: SaveSignalInput) {
  persistenceDiag.recordAttempt();

  const { ok, userId } = await checkApproved();
  if (!ok) {
    persistenceDiag.recordFailure({
      timestamp: new Date().toISOString(),
      errorCode: 'AUTH_FAILED',
      errorMessage: 'Unauthorized',
      errorDetails: 'checkApproved() returned false — session missing, expired, or user not approved',
      errorHint: 'Verify user session and approval status',
      httpStatus: 401,
      pair: input.pair,
      direction: input.direction,
      userId,
      phase: 'checkApproved',
    });
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('signals')
      .insert({
        pair:             input.pair,
        timeframe:        input.timeframe,
        direction:        input.direction,
        entry_price:      input.entry_price,
        entry_time:       input.entry_time.toISOString(),
        expiry_time:      input.expiry_time.toISOString(),
        strategy_name:    input.strategy_name,
        confidence:       input.confidence,
        risk_level:       input.risk_level ?? null,
        result:           'PENDING',
        source:           input.source,
        strategy_version: input.strategy_version ?? 'v1.0',
        quality_score:    input.quality_score ?? null,
        is_premium:       input.is_premium ?? true,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[saveSignal] Supabase error:', error.message);
      const httpStatus = (error as unknown as Record<string, unknown>).status as number | null ?? null;
      persistenceDiag.recordFailure({
        timestamp: new Date().toISOString(),
        errorCode: error.code ?? 'UNKNOWN',
        errorMessage: error.message ?? 'No message',
        errorDetails: error.details ?? null,
        errorHint: error.hint ?? null,
        httpStatus,
        pair: input.pair,
        direction: input.direction,
        userId,
        phase: 'supabaseInsert',
      });
      return { success: false, error: 'Failed to save signal' };
    }

    persistenceDiag.recordSuccess();
    return { success: true, signalId: data.id };
  } catch (err) {
    const errorObj = err as Error;
    console.error('[saveSignal] Error:', errorObj.message);
    persistenceDiag.recordFailure({
      timestamp: new Date().toISOString(),
      errorCode: 'EXCEPTION',
      errorMessage: errorObj.message ?? 'No message',
      errorDetails: errorObj.stack ?? null,
      errorHint: null,
      httpStatus: null,
      pair: input.pair,
      direction: input.direction,
      userId,
      phase: 'exception',
    });
    return { success: false, error: 'Failed to save signal' };
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// ACTION: updateSignalResult
// Called after signal expiry. Calculates WIN or LOSS from candle close price.
//
// Result logic (candle-based, NO random):
//   CALL → WIN if expiry_close > entry_price, else LOSS
//   PUT  → WIN if expiry_close < entry_price, else LOSS
// ─────────────────────────────────────────────────────────────────────────────
export async function updateSignalResult(
  signalId:    string,
  expiryPrice: number
) {
  const { ok } = await checkApproved();
  if (!ok) return { success: false, error: 'Unauthorized' };

  try {
    const supabase = await createClient();

    // Fetch the signal to get direction + entry_price + source
    const { data: signal, error: fetchError } = await supabase
      .from('signals')
      .select('direction, entry_price, result, source')
      .eq('id', signalId)
      .single();

    if (fetchError || !signal) {
      return { success: false, error: 'Signal not found' };
    }

    // Skip if already resolved (guard against duplicate updates)
    if (signal.result !== 'PENDING') {
      return { success: true, result: signal.result, skipped: true };
    }

    // ── Candle-based result calculation (replaces any random logic) ──────────
    let result: 'WIN' | 'LOSS';
    if (signal.direction === 'CALL') {
      result = expiryPrice > Number(signal.entry_price) ? 'WIN' : 'LOSS';
    } else {
      // PUT
      result = expiryPrice < Number(signal.entry_price) ? 'WIN' : 'LOSS';
    }

    const { error: updateError } = await supabase
      .from('signals')
      .update({
        result:       result,
        expiry_price: expiryPrice,
      })
      .eq('id', signalId);

    if (updateError) {
      console.error('[updateSignalResult] Update error:', updateError.message);
      return { success: false, error: 'Failed to update signal result' };
    }

    // Check consecutive losing streak protection
    if (result === 'LOSS') {
      try {
        const { data: limitSetting } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'losing_streak_limit')
          .single();
        const streakLimit = parseInt(limitSetting?.value ?? '3', 10);

        const { data: recentSignals } = await supabase
          .from('signals')
          .select('result')
          .eq('source', signal.source)
          .neq('result', 'PENDING')
          .order('entry_time', { ascending: false })
          .limit(streakLimit);

        if (recentSignals && recentSignals.length === streakLimit) {
          const allLosses = recentSignals.every(s => s.result === 'LOSS');
          if (allLosses) {
            const { data: pauseMinsSetting } = await supabase
              .from('system_settings')
              .select('value')
              .eq('key', 'losing_streak_pause_minutes')
              .single();
            const pauseMins = parseInt(pauseMinsSetting?.value ?? '15', 10);
            const pausedUntil = new Date(Date.now() + pauseMins * 60 * 1000).toISOString();

            await supabase
              .from('system_settings')
              .upsert([
                { key: 'premium_signal_status', value: 'PAUSED', updated_at: new Date().toISOString() },
                { key: 'paused_until', value: pausedUntil, updated_at: new Date().toISOString() }
              ]);
          }
        }
      } catch (streakErr) {
        console.error('[Streak Protection Error]:', streakErr);
      }
    }

    revalidatePath('/dashboard/signal-history');
    return { success: true, result };
  } catch (err) {
    console.error('[updateSignalResult] Unexpected error:', err);
    return { success: false, error: 'Failed to update signal result' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: updateSignalStatus
// Called by OTCExecutionEngine to sync intermediate lifecycle transitions.
// This is a fire-and-forget sync — the engine is the single source of truth.
// ─────────────────────────────────────────────────────────────────────────────
export async function updateSignalStatus(
  signalId: string,
  status: string
) {
  const { ok } = await checkApproved();
  if (!ok) return { success: false, error: 'Unauthorized' };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('signals')
      .update({ result: status })
      .eq('id', signalId);

    if (error) {
      console.error('[updateSignalStatus] Error:', error.message);
      return { success: false, error: 'Failed to update signal status' };
    }

    return { success: true };
  } catch (err) {
    const errorObj = err as Error;
    return { success: false, error: errorObj.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: saveCandle
// Stores a raw OTC candle into the otc_candles table for audit/analytics.
// ─────────────────────────────────────────────────────────────────────────────
export async function saveCandle(input: SaveCandleInput) {
  const { ok } = await checkApproved();
  if (!ok) return { success: false, error: 'Unauthorized' };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('otc_candles')
      .insert({
        pair:      input.pair,
        timeframe: input.timeframe,
        open:      input.open,
        high:      input.high,
        low:       input.low,
        close:     input.close,
        timestamp: input.timestamp.toISOString(),
        source:    input.source,
      });

    if (error) {
      console.error('[saveCandle] Supabase error:', error.message);
      return { success: false, error: 'Failed to save candle data' };
    }

    return { success: true };
  } catch (err) {
    const errorObj = err as Error;
    console.error('[saveCandle] Error:', errorObj.message);
    return { success: false, error: 'Failed to save candle data' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getSignalHistory
// Returns paginated signal history with filters for the history page.
// ─────────────────────────────────────────────────────────────────────────────
export async function getSignalHistory(filters: SignalHistoryFilters = {}) {
  const { ok, userId } = await checkPremium();
  if (!ok || !userId) return { success: false, error: 'Unauthorized', signals: [], total: 0 };

  try {
    const supabase = await createClient();
    const page     = filters.page ?? 1;
    const pageSize = filters.page_size ?? 50;

    // ── Source filter ──────────────────────────────────────────────────────
    // live_otc  → signals table only
    // live_market → manual_signal_audits only
    // ALL        → both combined (exclude simulation)
    const activeSource = filters.source ?? 'ALL';

    // ── Common date helpers ────────────────────────────────────────────────
    const dateFromClause = (col: string) => {
      if (!filters.date_from) return (q: any) => q;
      const iso = new Date(filters.date_from!).toISOString();
      return (q: any) => q.gte(col, iso);
    };
    const dateToClause = (col: string) => {
      if (!filters.date_to) return (q: any) => q;
      const end = new Date(filters.date_to!);
      end.setHours(23, 59, 59, 999);
      return (q: any) => q.lte(col, end.toISOString());
    };

    // ── Fetch manual_signal_audits (Live FOREX) ────────────────────────────
    let msaData: any[] = [];
    if (activeSource === 'ALL' || activeSource === 'live_market') {
      let msa = supabase
        .from('manual_signal_audits')
        .select('*')
        .eq('user_id', userId);

      if (filters.pair && filters.pair !== 'ALL')    msa = msa.eq('pair', filters.pair);
      if (filters.result && filters.result !== 'ALL') msa = msa.eq('status', filters.result);

      msa = dateFromClause('entry_time')(msa);
      msa = dateToClause('entry_time')(msa);

      const { data, error } = await msa;
      if (!error) msaData = data ?? [];
    }

    // ── Fetch signals (Live OTC) ───────────────────────────────────────────
    let sigData: any[] = [];
    if (activeSource === 'ALL' || activeSource === 'live_otc') {
      let sig = supabase
        .from('signals')
        .select('*')
        .eq('source', 'live_otc');

      if (filters.pair && filters.pair !== 'ALL')    sig = sig.eq('pair', filters.pair);
      if (filters.result && filters.result !== 'ALL') sig = sig.eq('result', filters.result);
      if (filters.strategy && filters.strategy !== 'ALL') sig = sig.eq('strategy_name', filters.strategy);

      sig = dateFromClause('entry_time')(sig);
      sig = dateToClause('entry_time')(sig);

      const { data, error } = await sig;
      if (!error) sigData = data ?? [];
    }

    // ── Normalise to common shape ──────────────────────────────────────────
    const msaMapped = msaData.map((r: any) => ({
      id: r.id,
      pair: r.pair,
      timeframe: '1m',
      direction: r.direction,
      entry_price: r.entry_price,
      entry_time: r.entry_time,
      expiry_time: r.expiry_time,
      expiry_price: r.expiry_price,
      strategy_name: '',
      confidence: r.confidence,
      risk_level: 'MEDIUM',
      source: 'live_market',
      result: r.status,
    }));

    const sigMapped = sigData.map((r: any) => ({
      id: r.id,
      pair: r.pair,
      timeframe: r.timeframe,
      direction: r.direction,
      entry_price: r.entry_price,
      entry_time: r.entry_time,
      expiry_time: r.expiry_time,
      expiry_price: r.expiry_price,
      strategy_name: r.strategy_name ?? '',
      confidence: r.confidence,
      risk_level: r.risk_level ?? 'MEDIUM',
      source: 'live_otc',
      result: r.result,
    }));

    // ── Merge, sort desc by entry_time, paginate ───────────────────────────
    const merged = [...msaMapped, ...sigMapped].sort((a, b) => {
      const ta = a.entry_time ? new Date(a.entry_time).getTime() : 0;
      const tb = b.entry_time ? new Date(b.entry_time).getTime() : 0;
      return tb - ta;
    });

    const total = merged.length;
    const from  = (page - 1) * pageSize;
    const paged = merged.slice(from, from + pageSize);

    return { success: true, signals: paged, total };
  } catch (err) {
    const errorObj = err as Error;
    console.error('[getSignalHistory] Error:', errorObj.message);
    return { success: false, error: 'Failed to fetch signal history', signals: [], total: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getActiveOTCSignals
// Returns active (PENDING/SETTLING) OTC signals from the database.
// Used by OTCExecutionEngine.loadActiveSignals() to restore state after refresh.
// ─────────────────────────────────────────────────────────────────────────────
export async function getActiveOTCSignals() {
  const { ok } = await checkPremium();
  if (!ok) return { success: false, error: 'Unauthorized', signals: [] };

  try {
    const supabase = await createClient();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('source', 'live_otc')
      .in('result', ['PENDING', 'SETTLING'])
      .gte('expiry_time', twoHoursAgo);

    if (error) {
      console.error('[getActiveOTCSignals] Error:', error.message);
      return { success: false, error: 'Failed to fetch active signals', signals: [] };
    }
    return { success: true, signals: data ?? [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[getActiveOTCSignals] Error:', msg);
    return { success: false, error: msg, signals: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getOTCTimelineSignals
// Returns terminal (WIN/LOSS/REFUND/FAILED) OTC signals from the database
// within the last 24 hours. Used by OTCExecutionEngine.loadTerminalSignals()
// to restore the timeline after refresh.
// ─────────────────────────────────────────────────────────────────────────────
export async function getOTCTimelineSignals() {
  const { ok } = await checkApproved();
  if (!ok) return { success: false, error: 'Unauthorized', signals: [] };

  try {
    const supabase = await createClient();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('source', 'live_otc')
      .in('result', ['WIN', 'LOSS', 'REFUND', 'FAILED'])
      .gte('entry_time', oneDayAgo)
      .order('entry_time', { ascending: false });

    if (error) {
      console.error('[getOTCTimelineSignals] Error:', error.message);
      return { success: false, error: 'Failed to fetch terminal signals', signals: [] };
    }
    return { success: true, signals: data ?? [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[getOTCTimelineSignals] Error:', msg);
    return { success: false, error: msg, signals: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getSignalPerformance
// Returns aggregated stats for the signal dashboard and history page.
// Premium accuracy is calculated from live_otc source only.
// ─────────────────────────────────────────────────────────────────────────────
export async function getSignalPerformance(source?: 'simulation' | 'live_otc' | 'live_market' | 'ALL') {
  const { ok, userId } = await checkPremium();
  if (!ok || !userId) return { success: false, error: 'Unauthorized' };

  try {
    const supabase = await createClient();
    const src = source ?? 'ALL';
    const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // ── Fetch manual_signal_audits (Live FOREX) ────────────────────────────
    let msaRows: { status: string; created_at: string }[] = [];
    if (src === 'ALL' || src === 'live_market') {
      const { data, error } = await supabase
        .from('manual_signal_audits')
        .select('status, created_at')
        .eq('user_id', userId)
        .gte('created_at', NINETY_DAYS_AGO);
      if (!error) msaRows = data ?? [];
    }

    // ── Fetch signals (Live OTC) — exclude simulation ──────────────────────
    let sigRows: { result: string; entry_time: string }[] = [];
    if (src === 'ALL' || src === 'live_otc') {
      const { data, error } = await supabase
        .from('signals')
        .select('result, entry_time')
        .eq('source', 'live_otc')
        .gte('entry_time', NINETY_DAYS_AGO);
      if (!error) sigRows = data ?? [];
    }

    // ── Fetch signals (Simulation) ─────────────────────────────────────────
    let simRows: { result: string; entry_time: string }[] = [];
    if (src === 'ALL' || src === 'simulation') {
      const { data, error } = await supabase
        .from('signals')
        .select('result, entry_time')
        .eq('source', 'simulation')
        .gte('entry_time', NINETY_DAYS_AGO);
      if (!error) simRows = data ?? [];
    }

    // ── Aggregate ──────────────────────────────────────────────────────────
    const total      = msaRows.length + sigRows.length + simRows.length;
    const msaWins    = msaRows.filter(r => r.status === 'WIN').length;
    const sigWins    = sigRows.filter(r => r.result === 'WIN').length;
    const simWins    = simRows.filter(r => r.result === 'WIN').length;
    const wins       = msaWins + sigWins + simWins;
    const msaLosses  = msaRows.filter(r => r.status === 'LOSS').length;
    const sigLosses  = sigRows.filter(r => r.result === 'LOSS').length;
    const simLosses  = simRows.filter(r => r.result === 'LOSS').length;
    const losses     = msaLosses + sigLosses + simLosses;
    const pending    = msaRows.filter(r => r.status === 'PENDING').length + sigRows.filter(r => r.result === 'PENDING').length + simRows.filter(r => r.result === 'PENDING').length;
    const resolved   = wins + losses;
    const accuracy   = resolved > 0 ? Math.round((wins / resolved) * 100 * 100) / 100 : 0;

    // Calculate start of today in IST for totalToday
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const istTodayStart = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 0, 0, 0, 0));
    const todayStartUtc = new Date(istTodayStart.getTime() - istOffset);

    const msaToday = msaRows.filter(r => r.created_at && new Date(r.created_at).getTime() >= todayStartUtc.getTime()).length;
    const sigToday = sigRows.filter(r => r.entry_time && new Date(r.entry_time).getTime() >= todayStartUtc.getTime()).length;
    const simToday = simRows.filter(r => r.entry_time && new Date(r.entry_time).getTime() >= todayStartUtc.getTime()).length;
    const totalToday = msaToday + sigToday + simToday;

    return {
      success: true,
      stats: { total, wins, losses, pending, accuracy, totalToday },
    };
  } catch (err) {
    const errorObj = err as Error;
    return { success: false, error: errorObj.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getDistinctPairs
// Returns all unique pairs stored in signals table (for filter dropdowns).
// ─────────────────────────────────────────────────────────────────────────────
export async function getDistinctPairs() {
  const { ok, userId } = await checkApproved();
  if (!ok || !userId) return { success: false, pairs: [] };

  try {
    const supabase = await createClient();

    // manual_signal_audits (Live FOREX)
    const { data: msa, error: msaErr } = await supabase
      .from('manual_signal_audits')
      .select('pair')
      .eq('user_id', userId)
      .order('pair');

    // signals (Live OTC)
    const { data: sig, error: sigErr } = await supabase
      .from('signals')
      .select('pair')
      .eq('source', 'live_otc')
      .order('pair');

    const allPairs = [
      ...(msaErr ? [] : (msa ?? []).map(d => d.pair)),
      ...(sigErr ? [] : (sig ?? []).map(d => d.pair)),
    ];

    const pairs = [...new Set(allPairs)].sort();
    return { success: true, pairs };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[getSupportedPairs] Error:', msg);
    return { success: false, pairs: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getPairPerformanceMap
// Returns a map of pair symbol to its historical win rate percentage.
// ─────────────────────────────────────────────────────────────────────────────
export async function getPairPerformanceMap() {
  const { ok, userId } = await checkPremium();
  if (!ok || !userId) return { success: false, performance: {} };

  try {
    const supabase = await createClient();

    // manual_signal_audits (Live FOREX)
    const { data: msa, error: msaErr } = await supabase
      .from('manual_signal_audits')
      .select('pair, status')
      .eq('user_id', userId)
      .neq('status', 'PENDING');

    // signals (Live OTC)
    const { data: sig, error: sigErr } = await supabase
      .from('signals')
      .select('pair, result')
      .eq('source', 'live_otc')
      .neq('result', 'PENDING');

    const map: Record<string, { wins: number; total: number }> = {};

    if (!msaErr) {
      (msa ?? []).forEach(s => {
        if (!map[s.pair]) map[s.pair] = { wins: 0, total: 0 };
        map[s.pair].total++;
        if (s.status === 'WIN') map[s.pair].wins++;
      });
    }

    if (!sigErr) {
      (sig ?? []).forEach(s => {
        if (!map[s.pair]) map[s.pair] = { wins: 0, total: 0 };
        map[s.pair].total++;
        if (s.result === 'WIN') map[s.pair].wins++;
      });
    }

    const performance: Record<string, number> = {};
    Object.entries(map).forEach(([pair, stats]) => {
      performance[pair] = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 80;
    });

    return { success: true, performance };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[getPairPerformanceMap] Error:', msg);
    return { success: false, performance: {} };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getActiveLiveMarketSignals
// Returns active (unexpired) live market signals from the database.
// ─────────────────────────────────────────────────────────────────────────────
export async function getActiveLiveMarketSignals() {
  const { ok } = await checkPremium();
  if (!ok) return { success: false, error: 'Unauthorized', signals: [] };

  try {
    const supabase = await createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('source', 'live_market')
      .gt('expiry_time', now)
      .order('entry_time', { ascending: false });

    if (error) throw error;
    return { success: true, signals: data ?? [] };
  } catch (err) {
    const errorObj = err as Error;
    console.error('[getActiveLiveMarketSignals] Error:', errorObj.message);
    return { success: false, error: 'Failed to fetch active signals', signals: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getServerTime
// Returns the absolute current timestamp of the server.
// ─────────────────────────────────────────────────────────────────────────────
export async function getServerTime() {
  return { success: true, timestamp: Date.now() };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getPublicSignalPerformance
// Public stats aggregator for homepage. Bypasses auth/RLS using admin client.
// Returns aggregate statistics for the last 30 days.
// ─────────────────────────────────────────────────────────────────────────────
export async function getPublicSignalPerformance() {
  try {
    const supabase = createAdminClient();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: signals, error } = await supabase
      .from('signals')
      .select('result, source, entry_time')
      .eq('source', 'live_market')
      .gte('entry_time', thirtyDaysAgo.toISOString());

    if (error) {
      console.error('[getPublicSignalPerformance] Database error:', error.message);
      return { success: false, error: 'Failed to fetch public signal performance' };
    }

    const list = signals ?? [];
    const total = list.length;
    const wins = list.filter(s => s.result === 'WIN').length;
    const losses = list.filter(s => s.result === 'LOSS').length;
    const pending = list.filter(s => s.result === 'PENDING').length;
    const resolved = wins + losses;
    const accuracy = resolved > 0 ? Math.round((wins / resolved) * 100 * 100) / 100 : 0;

    // Calculate unique trading days
    const uniqueDays = new Set(list.map(s => s.entry_time ? s.entry_time.split('T')[0] : '')).size;
    const dailyAverage = uniqueDays > 0 ? Math.round((total / uniqueDays) * 10) / 10 : 0;

    return {
      success: true,
      stats: { total, wins, losses, pending, accuracy, dailyAverage }
    };
  } catch (err) {
    console.error('[getPublicSignalPerformance] Unexpected error:', err);
    return { success: false, error: 'Failed to fetch public performance' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getPublicRecentSignals
// Fetch recent signals to display in homepage preview. Bypasses RLS.
// ─────────────────────────────────────────────────────────────────────────────
export async function getPublicRecentSignals(limit = 6) {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('signals')
      .select('id, pair, direction, entry_time, expiry_time, confidence, result, source, timeframe, strategy_name')
      .order('entry_time', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[getPublicRecentSignals] Database error:', error.message);
      return { success: false, error: 'Failed to fetch public signals', signals: [] };
    }

    return { success: true, signals: data ?? [] };
  } catch (err) {
    console.error('[getPublicRecentSignals] Unexpected error:', err);
    return { success: false, error: 'Failed to fetch public signals', signals: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getPublicCommunityStats
// Fetch real member, journal user, and premium member counts for homepage.
// ─────────────────────────────────────────────────────────────────────────────
export async function getPublicCommunityStats() {
  try {
    const supabase = createAdminClient();
    
    // Trading Members: count of approved users
    const { count: tradingMembers, error: err1 } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved');

    if (err1) console.error('[getPublicCommunityStats] Error approved users:', err1.message);

    // Journal Users: count of unique user_ids with trades logged
    const { data: uniqueTraders, error: err2 } = await supabase
      .from('trades')
      .select('user_id');

    if (err2) console.error('[getPublicCommunityStats] Error trades count:', err2.message);
    const journalUsers = uniqueTraders ? new Set(uniqueTraders.map(t => t.user_id)).size : 0;

    // Premium Members: count of users with premium_access = true
    const { count: premiumMembers, error: err3 } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('premium_access', true);

    if (err3) console.error('[getPublicCommunityStats] Error premium count:', err3.message);

    return {
      success: true,
      stats: {
        tradingMembers: tradingMembers ?? 0,
        journalUsers: journalUsers ?? 0,
        premiumMembers: premiumMembers ?? 0
      }
    };
  } catch (err) {
    console.error('[getPublicCommunityStats] Unexpected error:', err);
    return { success: false, error: 'Failed to fetch community stats' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event-Driven User Scan Architecture Registries (Next.js Global Lifespans)
// ─────────────────────────────────────────────────────────────────────────────
const globalUserLastScan = (((global as unknown as Record<string, unknown>).userLastScan || new Map<string, number>())) as Map<string, number>;
(global as unknown as Record<string, unknown>).userLastScan = globalUserLastScan;

const globalPairLastScan = (((global as unknown as Record<string, unknown>).pairLastScan || new Map<string, number>())) as Map<string, number>;
(global as unknown as Record<string, unknown>).pairLastScan = globalPairLastScan;

const globalScanCache = (((global as unknown as Record<string, unknown>).scanCache || new Map<string, { pair: string; result: ScanResult['result']; expiresAt: number }>())) as Map<string, { pair: string; result: ScanResult['result']; expiresAt: number }>;
(global as unknown as Record<string, unknown>).scanCache = globalScanCache;

const globalInFlightFetches = (((global as unknown as Record<string, unknown>).inFlightFetches || new Map<string, Promise<NormalizedCandle[]>>())) as Map<string, Promise<NormalizedCandle[]>>;
(global as unknown as Record<string, unknown>).inFlightFetches = globalInFlightFetches;

interface QueueRequest {
  pair: string;
  interval: string;
  resolve: (candles: NormalizedCandle[]) => void;
  reject: (err: Error) => void;
  signal?: AbortSignal;
}

interface GlobalState {
  __batchQueue: QueueRequest[];
  __batchTimeout: ReturnType<typeof setTimeout> | null;
  __providerManager: ProviderManager | null;
  __providerInitPromise: Promise<ProviderManager> | null;
  __scanAbortMap: Map<string, AbortController>;
}

const g = global as unknown as GlobalState;

if (!g.__batchQueue) {
  g.__batchQueue = [];
}
if (g.__batchTimeout === undefined) {
  g.__batchTimeout = null;
}
if (g.__providerManager === undefined) {
  g.__providerManager = null;
}
if (!g.__scanAbortMap) {
  g.__scanAbortMap = new Map();
}
if (g.__providerInitPromise === undefined) {
  g.__providerInitPromise = null;
}

function incrementGlobalCounter(key: string, amount = 1) {
  const g = global as unknown as Record<string, number>;
  g[key] = (g[key] || 0) + amount;
}

/**
 * Helper: checks if the international Forex markets are open.
 * Sunday 22:00 UTC to Friday 22:00 UTC.
 */
function isForexMarketOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const hours = now.getUTCHours();
  
  if (day === 6) return false;
  if (day === 5 && hours >= 22) return false;
  if (day === 0 && hours < 22) return false;
  return true;
}

/**
 * Server Action: Exposes market state diagnostics.
 */
export async function getMarketStatus(): Promise<{ success: boolean; open: boolean }> {
  return { success: true, open: isForexMarketOpen() };
}

async function getProviderManager() {
  // Promise-based singleton: concurrent calls share the same init promise,
  // eliminating the TOCTOU between the `if` check and the assignment.
  if (g.__providerInitPromise) return g.__providerInitPromise;
  g.__providerInitPromise = (async () => {
    // Double-check after await in case parallel init completed
    if (g.__providerManager) return g.__providerManager;
    const supabase = await createClient();
    const manager = new ProviderManager(supabase);
    g.__providerManager = manager;
    
    const twelvedata = new TwelveDataProvider();
    manager.registerProvider(twelvedata);
    
    const yahoo = new YahooProvider();
    manager.registerProvider(yahoo);
    
    if (!process.env.TWELVEDATA_API_KEY) {
      console.warn("[Server Action] TwelveData API key is missing. Defaulting active provider to Yahoo Finance.");
      manager.setActiveProvider(yahoo.id);
      await yahoo.connect().catch((e: Error) => console.error("[Server Action] Yahoo connect error:", e.message));
    } else {
      manager.setActiveProvider(twelvedata.id);
      await twelvedata.connect().catch((e: Error) => console.error("[Server Action] TwelveData connect error:", e.message));
    }
    
    return manager;
  })().catch((err) => {
    // If init fails, clear promise so subsequent calls retry
    g.__providerInitPromise = null;
    throw err;
  });
  return g.__providerInitPromise;
}

async function queueCandleFetch(pair: string, limit: number, interval = "1min"): Promise<NormalizedCandle[]> {
  return new Promise((resolve, reject) => {
    g.__batchQueue.push({ pair, interval, resolve, reject });
    if (!g.__batchTimeout) {
      // 5ms debounce — just enough to coalesce concurrent scans without
      // adding unnecessary latency to single-scan scenarios.
      g.__batchTimeout = setTimeout(() => {
        void processBatch(limit);
      }, 5);
    }
  });
}

async function processBatch(limit: number) {
  const currentBatch = [...g.__batchQueue];
  g.__batchQueue = [];
  g.__batchTimeout = null;
  
  if (currentBatch.length === 0) return;

  const pairs = Array.from(new Set(currentBatch.map(r => r.pair)));
  const interval = currentBatch[0]?.interval || "1min";
  console.log(`[Batch Queue] Executing Twelve Data request for symbols: ${pairs.join(", ")} (interval: ${interval})`);
  
  try {
    const manager = await getProviderManager();
    const results = await manager.fetchHistoricCandlesBatch(pairs, limit, interval);

    incrementGlobalCounter('actualApiCallsCount');
    incrementGlobalCounter('apiCreditsUsed', pairs.length);
    
    currentBatch.forEach(req => {
      req.resolve(results.get(req.pair) || []);
    });
  } catch (err: unknown) {
    const errorInstance = err instanceof Error ? err : new Error(String(err));
    console.error(`[Batch Queue Error] Failed to process batch request:`, errorInstance.message);
    currentBatch.forEach(req => {
      req.reject(errorInstance);
    });
  }
}

export interface ScanResult {
  success: boolean;
  error?: string;
  cooldownRemaining?: number;
  result?: {
    direction: "CALL" | "PUT" | "WAIT";
    confidence: number;
    qualityScore: number;
    strategy: string;
    entryPrice: number;
    entryTime: string;
    expiryTime: string;
    risk: "LOW" | "MEDIUM" | "HIGH";
    recommendation: "CALL" | "PUT" | "WAIT";
    reasons: { label: string; checked: boolean; text: string }[];
    noTradeReason?: string;
    indicators: {
      ema21: number | null;
      sma50: number | null;
      rsi: number | null;
      cci: number | null;
      stochK: number | null;
      stochD: number | null;
      atr: number | null;
      supertrend: number | null;
      supertrendDirection: number;
      bodySize: number;
      upperWick: number;
      lowerWick: number;
    };
    lastCandleTime: string;
    providerTimestamp?: string;
    providerTimezone?: string;
    analysisGeneratedTime: string;
    cacheExpiresTime: string;
    marketBias: string;
    recommendationText: string;
    analysisEngine: string;
    avoidReason: string;
    entryReason: string;
    nextCandleProbability: number;
    trendStrength: number;
    dataSource: string;
    cacheStatus: "Fresh" | "Cached";
    cacheAgeSeconds: number;
    serverTime: string;
  };
}

/**
 * ACTION: scanLiveMarketAsset
 * Event-Driven manual scanner trigger endpoint for Live Market tab.
 * Implements request coalescing, user session limits, global pair caching,
 * market hours guards, and SignalEngine evaluation.
 */
export async function scanLiveMarketAsset(pair: string, rowId?: string): Promise<ScanResult> {
  const t_entry = Date.now();

  const { ok } = await checkApproved();
  if (!ok) {
    return { success: false, error: 'Unauthorized' };
  }
  const t_auth = Date.now();

  // Hoisted so the finally block can reference it for cleanup
  let scanAbortController: AbortController | undefined;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    if (!userId) {
      return { success: false, error: 'User session not found' };
    }

    const access = await getUserAccessState();
    const isPremium = access.premiumAccess || access.vipAccess || access.isAdmin;
    const userCooldownMs = isPremium ? 15000 : 60000;

    const now = Date.now();
    const userLastScanTime = globalUserLastScan.get(userId) || 0;
    const userElapsed = now - userLastScanTime;

    if (userElapsed < userCooldownMs && userElapsed > 2000) {
      return {
        success: false,
        error: 'Cooldown active',
        cooldownRemaining: Math.ceil((userCooldownMs - userElapsed) / 1000)
      };
    }

    const pairCooldownMs = 30000;
    const lastPairScan = globalPairLastScan.get(pair) || 0;
    const pairElapsed = now - lastPairScan;

    const cached = globalScanCache.get(pair);
    const hasValidCache = cached && cached.result && cached.expiresAt > now;

    if (hasValidCache && cached && cached.result) {
      incrementGlobalCounter('cacheHitsCount');
      incrementGlobalCounter('apiCreditsSaved');
      incrementGlobalCounter('manualScansCount');
      globalUserLastScan.set(userId, now);
      const cooldownRemaining = Math.max(0, Math.ceil((lastPairScan + pairCooldownMs - now) / 1000));
      const ageSeconds = Math.max(0, Math.floor((now - new Date(cached.result.analysisGeneratedTime).getTime()) / 1000));
      return {
        success: true,
        result: {
          ...cached.result,
          cacheStatus: "Cached",
          cacheAgeSeconds: ageSeconds
        },
        cooldownRemaining
      };
    }

    if (pairElapsed < pairCooldownMs && cached && cached.result) {
      incrementGlobalCounter('cacheHitsCount');
      incrementGlobalCounter('apiCreditsSaved');
      incrementGlobalCounter('manualScansCount');
      globalUserLastScan.set(userId, now);
      const ageSeconds = Math.max(0, Math.floor((now - new Date(cached.result.analysisGeneratedTime).getTime()) / 1000));
      return {
        success: true,
        result: {
          ...cached.result,
          cacheStatus: "Cached",
          cacheAgeSeconds: ageSeconds
        },
        cooldownRemaining: Math.ceil((pairCooldownMs - pairElapsed) / 1000)
      };
    }

    const marketOpen = isForexMarketOpen();
    if (!marketOpen) {
      if (cached && cached.result) {
        const ageSeconds = Math.max(0, Math.floor((now - new Date(cached.result.analysisGeneratedTime).getTime()) / 1000));
        return {
          success: true,
          result: {
            ...cached.result,
            cacheStatus: "Cached",
            cacheAgeSeconds: ageSeconds
          },
          cooldownRemaining: 0
        };
      }
      return {
        success: false,
        error: 'Market is closed'
      };
    }

    let rowIdToUse = rowId;
    if (!rowIdToUse) {
      const createRes = await createLiveScanAudit(pair);
      if (!createRes.success || !createRes.rowId) {
        return { success: false, error: createRes.error || 'Failed to create database scan record' };
      }
      rowIdToUse = createRes.rowId;
    }

    const SCAN_HARD_TIMEOUT_MS = 15000;
    scanAbortController = new AbortController();
    const abortSignal = scanAbortController.signal;
    let timedOut = false;

    // Timeout deadline for the full analysis pipeline
    const timeoutDeadline = Date.now() + SCAN_HARD_TIMEOUT_MS;
    console.log(`[LIVE_SCAN_TIMEOUT_ARMED] ${pair} ${rowIdToUse} deadline=${new Date(timeoutDeadline).toISOString()} (${SCAN_HARD_TIMEOUT_MS}ms)`);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        timedOut = true;
        scanAbortController!.abort();
        console.log(`[LIVE_SCAN_TIMEOUT] ${pair} ${rowIdToUse} — deadline reached at ${new Date().toISOString()}`);
        reject(new Error('SCAN_TIMEOUT'));
      }, SCAN_HARD_TIMEOUT_MS);
    });

    const throwIfAborted = () => {
      if (abortSignal.aborted) throw new Error('SCAN_TIMEOUT');
    };

    let candlesM1: NormalizedCandle[] = [];
    let candlesM5: NormalizedCandle[] = [];
    let scanTerminal = false;     // ← terminal-state guard: true once direction is decided

    // Build the analysis promise (fetch + engine + DB update)
    const analysisPromise = (async () => {
      const t0 = Date.now();
      throwIfAborted();

      const manager = await getProviderManager();
      const t1 = Date.now();

      throwIfAborted();
      const fetchKeyM1 = `${pair}_1min`;
      let fetchPromiseM1 = globalInFlightFetches.get(fetchKeyM1);
      const t_queueStart = Date.now();
      if (!fetchPromiseM1) {
        fetchPromiseM1 = queueCandleFetch(pair, 60, "1min");
        globalInFlightFetches.set(fetchKeyM1, fetchPromiseM1);
        fetchPromiseM1.finally(() => {
          globalInFlightFetches.delete(fetchKeyM1);
        });
      } else {
        // If another scan already queued this pair's fetch, note that we're
        // piggybacking — the queue wait is effectively zero for this scan.
        console.log(`[FETCH_PIGGYBACK] ${pair} — reusing in-flight M1 fetch`);
      }
      const t_queueSubmitted = Date.now();

      const fetchKeyM5 = `${pair}_5min`;
      let fetchPromiseM5 = globalInFlightFetches.get(fetchKeyM5);
      if (!fetchPromiseM5) {
        fetchPromiseM5 = queueCandleFetch(pair, 60, "5min");
        globalInFlightFetches.set(fetchKeyM5, fetchPromiseM5);
        fetchPromiseM5.finally(() => {
          globalInFlightFetches.delete(fetchKeyM5);
        });
      }

      // M1 is required — await it
      candlesM1 = await fetchPromiseM1;
      const t2 = Date.now();

      // M5 is fire-and-forget (optional HTF data) — do not block the response
      fetchPromiseM5.then((m5Candles) => {
        if (m5Candles.length > 0) {
          const v5 = CandleCache.validateCandles(m5Candles, pair + "_5min");
          if (v5.valid) {
            CandleCache.preloadHistory(pair + "_5min", m5Candles);
          } else {
            console.warn(`[M5 BG] Validation failed for ${pair}: ${v5.errors.join(' | ')}`);
          }
        }
      }).catch(() => {});

      throwIfAborted();

      // Determine actual provider name from manager state (must be before first use)
      const activeProviderForTelemetry = manager.getActiveProvider();
      const dataSource = activeProviderForTelemetry?.id === 'yahoo' ? 'Yahoo Finance' :
                         activeProviderForTelemetry?.id === 'twelvedata' ? 'Twelve Data' :
                         activeProviderForTelemetry?.id || 'Unknown';

      if (candlesM1.length < 52) {
        throw new Error(`INSUFFICIENT_M1_CANDLES: Received only ${candlesM1.length} M1 candles from ${dataSource} (need 52)`);
      }

      incrementGlobalCounter('manualScansCount');

      // Track timing
      const fetchCompletedAt = Date.now();

      // Validate & preload M1 candles into CandleCache for SignalEngine
      const m1Cached = CandleCache.preloadHistory(pair, candlesM1);
      const t3 = Date.now();
      if (!m1Cached) {
        throw new Error('CACHE_PRELOAD_FAILED: M1 candles rejected by cache validation');
      }

      throwIfAborted();

      const lastCandle = candlesM1[candlesM1.length - 1];
      const lastCandleTime = lastCandle?.timestamp ? new Date(lastCandle.timestamp) : new Date();
      
      const entryTime = new Date(lastCandleTime.getTime() + 60 * 1000);
      const expiryTime = new Date(entryTime.getTime() + 60 * 1000);

      throwIfAborted();

      const engineRes = evaluateSignal(pair);
      scanTerminal = true;        // ← direction decided — scan is now immutable
      const t4 = Date.now();

      let marketBias = "No setup detected";
      let recommendationText = "Awaiting strong momentum confirmation. Avoid taking entries under high volatility/range conditions.";

      if (engineRes.direction === 'CALL') {
        marketBias = engineRes.confidence >= 85 ? "Strong Buy" : "Buy Bias";
        recommendationText = "Wait for current candle to close. Enter next candle (CALL).";
      } else if (engineRes.direction === 'PUT') {
        marketBias = engineRes.confidence >= 85 ? "Strong Sell" : "Sell Bias";
        recommendationText = "Wait for current candle to close. Enter next candle (PUT).";
      } else if (engineRes.direction === 'WAIT') {
        const origReason = engineRes.noTradeReason || '';
        if (origReason.includes('history') || origReason.includes('insufficient')) {
          marketBias = "Entry conditions not satisfied";
        } else if (origReason.includes('stale') || origReason.includes('data')) {
          marketBias = "Market conditions not suitable";
        } else if (origReason.includes('Volatility too low')) {
          marketBias = "Market conditions not suitable";
        } else if (origReason.includes('Body not expanding')) {
          marketBias = "Entry conditions not satisfied";
        } else if (origReason.includes('Stoch') || origReason.includes('CCI') || origReason.includes('SuperTrend')) {
          marketBias = "Trend conditions not satisfied";
        } else if (origReason.includes('Support/resistance') || origReason.includes('room')) {
          marketBias = "Entry conditions not satisfied";
        } else if (origReason.includes('confidence')) {
          marketBias = "Confidence below required threshold";
        } else {
          marketBias = "No setup detected";
        }
        recommendationText = `${marketBias}. Waiting for valid signal criteria to align.`;
      }

      throwIfAborted();

      const formatUTC = (d: Date) => {
        return new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(d) + " UTC";
      };

      const formatKolkata = (d: Date) => {
        return new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(d);
      };

      const formatCountdown = (diffSec: number) => {
        const min = Math.floor(diffSec / 60);
        const sec = diffSec % 60;
        return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
      };

      const providerTimestamp = lastCandle?.providerTimestamp || lastCandleTime.toISOString().replace("T", " ").substring(0, 19);
      const providerTimezone = lastCandle?.providerTimezone || "UTC";

      const diffSecServer = Math.max(0, Math.ceil((expiryTime.getTime() - Date.now()) / 1000));

      const scanResultData = {
        direction: engineRes.direction,
        confidence: engineRes.confidence,
        qualityScore: engineRes.qualityScore,
        strategy: engineRes.strategy,
        entryPrice: lastCandle?.close || 0,
        entryTime: entryTime.toISOString(),
        expiryTime: expiryTime.toISOString(),
        risk: engineRes.risk,
        recommendation: engineRes.recommendation,
        reasons: engineRes.reasons,
        noTradeReason: marketBias,
        indicators: engineRes.indicators,
        lastCandleTime: lastCandleTime.toISOString(),
        providerTimestamp,
        providerTimezone,
        analysisGeneratedTime: new Date().toISOString(),
        cacheExpiresTime: expiryTime.toISOString(),
        marketBias,
        recommendationText,
        analysisEngine: "v1.3",
        avoidReason: "",
        entryReason: engineRes.strategy,
        nextCandleProbability: engineRes.confidence,
        trendStrength: engineRes.qualityScore,
        dataSource,
        cacheStatus: "Fresh" as const,
        cacheAgeSeconds: 0,
        serverTime: new Date().toISOString(),
        id: rowIdToUse
      };

      globalScanCache.set(pair, {
        pair,
        result: scanResultData,
        expiresAt: expiryTime.getTime()
      });

      // Fire-and-forget DB update (non-blocking — response returns immediately)
      supabase
        .from('manual_signal_audits')
        .update({
          direction: engineRes.direction,
          entry_price: scanResultData.entryPrice,
          entry_time: scanResultData.entryTime,
          expiry_time: scanResultData.expiryTime,
          confidence: scanResultData.confidence,
          market_bias: scanResultData.marketBias,
          signal_strength: scanResultData.qualityScore,
          provider: scanResultData.dataSource,
          status: (engineRes.direction === 'WAIT') ? 'NO TRADE' : 'PENDING'
        })
        .eq('id', rowIdToUse)
        .eq('status', 'SCANNING')
        .then(({ error }) => {
          if (error) console.error(`[DB BG Update Error] ${rowIdToUse}:`, error);
        }, (dbErr: unknown) => {
          console.error(`[DB BG Update Fatal] ${rowIdToUse}:`, dbErr);
        });

      const t5 = Date.now();
      const dProvider = t1 - t0;
      const dQueueOverhead = t_queueSubmitted - t_queueStart; // time to create/store promise (~0ms)
      const dFetchBlocking = t2 - t_queueSubmitted;           // full wait: debounce + batch + API + response
      const dCache   = t3 - t2;
      const dEngine  = t4 - t3;
      const dBuild   = t5 - t4;
      console.log(
        `[LIVE_SCAN_TIMING] ${pair} ` +
        `provInit=${dProvider}ms ` +
        `queue=${dQueueOverhead}ms ` +
        `fetch=${dFetchBlocking}ms ` +
        `cache=${dCache}ms ` +
        `engine=${dEngine}ms ` +
        `build=${dBuild}ms ` +
        `total=${t5 - t0}ms`
      );

      return scanResultData;
    })();

    let resultData: any;
    try {
      resultData = await Promise.race([analysisPromise, timeoutPromise]);
      // If analysisPromise won, ensure timeoutPromise rejection is sunk
      timeoutPromise.catch(() => {});
    } catch (raceErr: unknown) {
      // If timeoutPromise won, ensure analysisPromise rejection is sunk
      analysisPromise.catch(() => {});
      const raceErrInstance = raceErr instanceof Error ? raceErr : new Error(String(raceErr));
      const errMsg = raceErrInstance.message;
      
      let failureReason = 'Scan exceeded 20-second limit';
      if (errMsg.includes('PROVIDER_INIT_TIMEOUT')) {
        failureReason = 'Provider unavailable';
      } else if (errMsg.includes('PROVIDER_REQUEST_TIMEOUT') || errMsg.includes('PROVIDER_TIMEOUT')) {
        failureReason = 'Provider connection timeout';
      } else if (errMsg.includes('CANDLE_VALIDATION_FAILED')) {
        failureReason = 'Market data integrity check failed';
      } else if (errMsg.includes('INSUFFICIENT_M1_CANDLES')) {
        failureReason = 'Market Data Validation Failed';
      } else if (errMsg.includes('CACHE_PRELOAD_FAILED')) {
        failureReason = 'Market data rejected by cache validation';
      } else if (errMsg.includes('SCAN_TIMEOUT') || errMsg.includes('timed out')) {
        failureReason = 'Scan exceeded 20-second limit';
      } else if (errMsg.includes('REQUEST_INTERRUPTED')) {
        failureReason = 'Network connection failed';
      } else if (errMsg.includes('DB_UPDATE_FAILED')) {
        failureReason = 'Database synchronization failed';
      } else {
        failureReason = `Unexpected server exception: ${errMsg.substring(0, 50)}`;
      }
      
      // Terminal-state guard: once direction was decided (CALL/PUT/WAIT),
      // the scan is immutable. NEVER overwrite with FAILED.
      if (!scanTerminal) {
        console.warn(`[LIVE_SCAN_FAILED] ${pair} ${rowIdToUse} REASON=${failureReason}`);
        try {
          await supabase.from('manual_signal_audits')
            .update({
              status: 'FAILED',
              market_bias: failureReason
            })
            .eq('id', rowIdToUse)
            .eq('status', 'SCANNING');
        } catch (dbUpdateErr) {
          console.error(`[DB_UPDATE_FAILED] ${pair} ${rowIdToUse}:`, dbUpdateErr);
        }
        return { success: false, error: failureReason };
      }

      // Direction was decided but result delivery failed — DB is already PENDING
      console.warn(`[LIVE_SCAN_TERMINAL] ${pair} ${rowIdToUse} — direction already decided, ignoring timeout/error (${failureReason})`);
      return { success: true, cooldownRemaining: Math.ceil(pairCooldownMs / 1000) };
    }

    globalPairLastScan.set(pair, now);
    globalUserLastScan.set(userId, now);

    const responseTime = Date.now();
    const t_total = responseTime - t_entry;
    console.log(`[LIVE_SCAN_TOTAL] ${pair} auth=${t_auth - t_entry}ms overhead=${responseTime - t_auth}ms total=${t_total}ms SUCCESS`);
    return {
      success: true,
      result: { ...resultData, serverTime: new Date(responseTime).toISOString() },
      cooldownRemaining: Math.ceil(pairCooldownMs / 1000)
    };
  } catch (err: unknown) {
    const errorInstance = err instanceof Error ? err : new Error(String(err));
    console.error('[scanLiveMarketAsset] Execution exception:', errorInstance.message);
    const t_total = Date.now() - t_entry;
    console.log(`[LIVE_SCAN_TOTAL] ${pair} total=${t_total}ms FAILED`);
    return { success: false, error: 'Scan failed unexpectedly' };
  } finally {
    // scanAbortController is local to each scan — no global cleanup needed
  }
}

/**
 * ACTION: getScannerStats
 * Exposes diagnostic metrics and saved credit telemetry counts.
 */
export async function getScannerStats(): Promise<{ success: boolean; stats?: Record<string, number>; error?: string }> {
  const { ok } = await checkPremium();
  if (!ok) return { success: false, error: 'Unauthorized' };

  try {
    const used = ((global as unknown as Record<string, number>).apiCreditsUsed) || 0;
    const remaining = Math.max(0, 800 - used);
    return {
      success: true,
      stats: {
        apiCreditsUsed: used,
        apiCreditsRemaining: remaining,
        apiCreditsSaved: ((global as unknown as Record<string, number>).apiCreditsSaved) || 0,
        manualScansCount: ((global as unknown as Record<string, number>).manualScansCount) || 0,
        cacheHitsCount: ((global as unknown as Record<string, number>).cacheHitsCount) || 0,
        actualApiCallsCount: ((global as unknown as Record<string, number>).actualApiCallsCount) || 0
      }
    };
  } catch (err) {
    const errorObj = err as Error;
    console.error('[getActiveLiveMarketSignalsBatch] Error:', errorObj.message);
    return { success: false, error: 'Failed to fetch signals batch' };
  }
}

export interface SaveManualSignalInput {
  pair:            string;
  direction:       'CALL' | 'PUT' | 'WAIT';
  entry_price:     number;
  entry_time:      string;
  expiry_time:     string;
  confidence:      number;
  market_bias:     string;
  signal_strength: number;
  provider:        string;
}

export async function saveManualSignal(input: SaveManualSignalInput) {
  const { ok, userId } = await checkApproved();
  if (!ok || !userId) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const supabase = await createClient();
    const isWait = input.direction === 'WAIT';
    
    const { data, error } = await supabase
      .from('manual_signal_audits')
      .insert({
        user_id:         userId,
        pair:            input.pair,
        direction:       input.direction,
        entry_price:     input.entry_price,
        entry_time:      input.entry_time,
        expiry_time:     input.expiry_time,
        confidence:      input.confidence,
        market_bias:     input.market_bias,
        signal_strength: Math.round(input.signal_strength),
        provider:        input.provider,
        status:          isWait ? 'NO TRADE' : 'PENDING'
      })
      .select('id')
      .single();

    if (error) throw error;
    return { success: true, id: data?.id };
  } catch (err: unknown) {
    console.error('[saveManualSignal] Error saving signal:', err);
    return { success: false, error: 'Failed to save manual signal' };
  }
}

export async function getManualSignalAudits() {
  const { ok, userId } = await checkApproved();
  if (!ok || !userId) {
    return { success: false, error: 'Unauthorized', audits: [] };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('manual_signal_audits')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, audits: data || [] };
  } catch (err: unknown) {
    console.error('[getManualSignalAudits] Error fetching signal audits:', err);
    return { success: false, error: 'Failed to fetch signal audits', audits: [] };
  }
}

export async function settleManualSignal(signalId: string) {
  const { ok, userId } = await checkApproved();
  if (!ok || !userId) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const supabase = await createClient();

    // 1. Fetch manual signal audit
    const { data: audit, error: fetchErr } = await supabase
      .from('manual_signal_audits')
      .select('*')
      .eq('id', signalId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !audit) {
      return { success: false, error: 'Manual signal record not found' };
    }

    if (audit.status !== 'PENDING') {
      return { success: true, status: audit.status, skipped: true };
    }

    // Check if it's already expired
    const expiryMs = new Date(audit.expiry_time).getTime();
    if (Date.now() < expiryMs) {
      return { success: false, error: 'Signal has not expired yet' };
    }

    // 2. Fetch fresh price with 15-second timeout
    const manager = await getProviderManager();
    const SETTLEMENT_FETCH_TIMEOUT_MS = 15000;
    let candles: any[] = [];
    const settlementFetchPromise = manager.fetchHistoricCandles(audit.pair, 2);
    const settlementTimeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SETTLEMENT_FETCH_TIMEOUT')), SETTLEMENT_FETCH_TIMEOUT_MS)
    );
    try {
      candles = await Promise.race([settlementFetchPromise, settlementTimeoutPromise]);
      // fetchPromise won — sink timeoutPromise's eventual rejection
      settlementTimeoutPromise.catch(() => {});
    } catch (primaryErr: unknown) {
      // timeoutPromise won — sink fetchPromise's eventual rejection
      settlementFetchPromise.catch(() => {});
      const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      if (primaryMsg.includes('SETTLEMENT_FETCH_TIMEOUT')) {
        console.warn(`[settleManualSignal] Primary provider fetch timed out for ${audit.pair}. Falling back to Yahoo Finance.`);
      } else {
        console.warn(`[settleManualSignal] Primary provider fetch failed for ${audit.pair}: ${primaryMsg}. Falling back to Yahoo Finance.`);
      }
      try {
        const yahooProvider = new YahooProvider();
        candles = await yahooProvider.fetchHistoricCandles(audit.pair, 2);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[settleManualSignal] Yahoo fallback fetch failed:`, msg);
      }
    }
    if (!candles || candles.length === 0) {
      return { success: false, error: 'Failed to fetch outcome candle' };
    }

    const lastCandle = candles[candles.length - 1];
    const exitPrice = lastCandle.close;

    // 3. Compute win/loss outcome
    let status: 'WIN' | 'LOSS' | 'REFUND' = 'REFUND';
    const entry = Number(audit.entry_price);
    const exit = Number(exitPrice);

    if (audit.direction === 'CALL') {
      if (exit > entry) status = 'WIN';
      else if (exit < entry) status = 'LOSS';
      else status = 'REFUND';
    } else if (audit.direction === 'PUT') {
      if (exit < entry) status = 'WIN';
      else if (exit > entry) status = 'LOSS';
      else status = 'REFUND';
    }

    // 4. Update row — only if still PENDING (prevents double settlement)
    const { error: updateErr } = await supabase
      .from('manual_signal_audits')
      .update({
        expiry_price: exitPrice,
        status: status
      })
      .eq('id', signalId)
      .eq('status', 'PENDING');

    if (updateErr) throw updateErr;

    return { success: true, status, exitPrice };
  } catch (err: unknown) {
    console.error('[settleManualSignal] Error settling manual signal:', err);
    return { success: false, error: 'Failed to settle signal' };
  }
}

/**
 * ACTION: createLiveScanAudit
 * Creates a database placeholder row in manual_signal_audits to represent a scanning attempt.
 */
export async function createLiveScanAudit(pair: string): Promise<{ success: boolean; rowId?: string; error?: string }> {
  const { ok, userId } = await checkApproved();
  if (!ok || !userId) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const supabase = await createClient();
    const { data: placeholder, error: dbErr } = await supabase
      .from('manual_signal_audits')
      .insert({
        user_id: userId,
        pair: pair,
        direction: 'WAIT',
        entry_price: 0,
        entry_time: new Date().toISOString(),
        expiry_time: new Date().toISOString(),
        confidence: 0,
        market_bias: 'SCANNING',
        signal_strength: 0,
        provider: 'Twelve Data',
        status: 'SCANNING'
      })
      .select('id')
      .single();

    if (dbErr || !placeholder) {
      throw new Error(`Failed to create database scan record: ${dbErr?.message}`);
    }
    return { success: true, rowId: placeholder.id };
  } catch (err: unknown) {
    console.error('[createLiveScanAudit] Error:', err);
    return { success: false, error: 'Failed to create scan audit' };
  }
}

/**
 * ACTION: getPendingManualSignals
 * Retrieves all active pending (or scanning) signals for the current user.
 * Attempts to restore indicators details from the global cache if available.
 */
export async function getPendingManualSignals(): Promise<{ success: boolean; signals?: any[]; error?: string }> {
  const { ok, userId } = await checkApproved();
  if (!ok || !userId) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('manual_signal_audits')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['SCANNING', 'PENDING'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    const now = Date.now();
    const signals: any[] = [];

    for (const row of (data || [])) {
      const isScanning = row.status === 'SCANNING';
      const ageMs = now - new Date(row.created_at).getTime();

      if (isScanning && ageMs > 30000) {
        // Orphaned scanning row! Update to FAILED in the database and skip returning it
        console.warn(`[getPendingManualSignals] Auto-failing orphaned scan row ${row.id} for pair ${row.pair} (age: ${Math.round(ageMs/1000)}s)`);
        try {
          await supabase
            .from('manual_signal_audits')
            .update({
              status: 'FAILED',
              market_bias: 'Scan exceeded 20-second limit'
            })
            .eq('id', row.id)
            .eq('status', 'SCANNING');
        } catch (dbErr) {
          console.error(`Failed to auto-fail orphaned scan row ${row.id}:`, dbErr);
        }
        continue;
      }

      // Try to recover the full analysis from the global cache if it exists and is not a scanning placeholder
      const cached = globalScanCache.get(row.pair);
      if (!isScanning && cached && cached.result && new Date(row.expiry_time).getTime() === new Date(cached.result.expiryTime).getTime()) {
        signals.push({
          ...cached.result,
          id: row.id,
          status: 'PENDING' as const
        });
        continue;
      }

      // Default populated properties for DB recovery when cache is missing/expired or for placeholder scanning rows
      signals.push({
        id: row.id,
        pair: row.pair,
        direction: row.direction as 'CALL' | 'PUT' | 'WAIT',
        confidence: row.confidence,
        qualityScore: row.signal_strength,
        strategy: isScanning ? 'Initializing Analysis...' : 'Restored Active Scan',
        entryPrice: Number(row.entry_price),
        entryTime: new Date(row.entry_time).toISOString(),
        expiryTime: new Date(row.expiry_time).toISOString(),
        risk: isScanning ? 'HIGH' : (row.signal_strength >= 90 ? 'LOW' : row.signal_strength >= 85 ? 'MEDIUM' : 'HIGH') as 'LOW' | 'MEDIUM' | 'HIGH',
        recommendation: row.direction as 'CALL' | 'PUT' | 'WAIT',
        reasons: [
          { label: "MA Trend Bias", checked: true, text: isScanning ? "Analyzing indicators..." : "Restored active signal from database." }
        ],
        indicators: {
          ema21: null,
          sma50: null,
          rsi: null,
          cci: null,
          stochK: null,
          stochD: null,
          atr: null,
          supertrend: null,
          supertrendDirection: 1,
          bodySize: 0,
          upperWick: 0,
          lowerWick: 0
        },
        lastCandleTime: new Date(row.entry_time).toISOString(),
        analysisGeneratedTime: new Date(row.created_at).toISOString(),
        cacheExpiresTime: new Date(row.expiry_time).toISOString(),
        marketBias: row.market_bias,
        recommendationText: isScanning ? "Executing indicator analysis..." : `Wait for current candle to close. Enter next candle (${row.direction}).`,
        analysisEngine: "v1.3 (Restored)",
        avoidReason: "",
        entryReason: isScanning ? "Scanning market..." : "Restored from database",
        nextCandleProbability: row.confidence,
        trendStrength: row.signal_strength,
        dataSource: row.provider,
        cacheStatus: "Cached" as const,
        cacheAgeSeconds: Math.floor((Date.now() - new Date(row.created_at).getTime()) / 1000),
        serverTime: new Date().toISOString(),
        status: isScanning ? ('SCANNING' as const) : ('PENDING' as const)
      });
    }

    return { success: true, signals };
  } catch (err: unknown) {
    console.error('[getPendingManualSignals] Error retrieving pending manual signals:', err);
    return { success: false, error: 'Failed to fetch pending signals' };
  }
}

/**
 * ACTION: captureOfficialEntryPrice
 * Captures the official entry price for a manual signal at the
 * scheduled M1 boundary (entry time) using a two-tier priority system:
 *
 * Priority 1 (OPEN_CANDLE):
 *   If the most recently returned candle started at or after the
 *   scheduled entry time, it IS the entry candle — use its OPEN.
 *
 * Priority 2 (PREVIOUS_CLOSE_FALLBACK):
 *   If the provider has not yet published the entry candle due to
 *   normal API latency, the most recent candle is still the previous
 *   completed candle — use its CLOSE (which equals the entry candle
 *   OPEN for continuous markets).
 *
 * The entry source is logged server-side for diagnostics only.
 * No schema changes. No trading logic changes.
 */
export async function captureOfficialEntryPrice(
  signalId: string,
  pair: string,
  entryTime: number
): Promise<{ success: boolean; officialEntryPrice?: number; entrySource?: string; error?: string }> {
  const { ok, userId } = await checkApproved();
  if (!ok || !userId) return { success: false, error: 'Unauthorized' };

  try {
    const manager = await getProviderManager();
    // Fetch 2 candles so we have both the previous and (potentially) the entry candle
    const candles = await manager.fetchHistoricCandles(pair, 2);
    if (!candles || candles.length === 0) {
      return { success: false, error: 'No candle data available' };
    }

    // Candles are in chronological order (oldest first).
    // The last element is the most recently completed candle.
    const latestCandle = candles[candles.length - 1];
    const latestTs = new Date(latestCandle.timestamp).getTime();

    // Priority 1: If the latest candle started at or after the entry time,
    // it IS the entry candle — use its OPEN.
    // Priority 2: Otherwise, we're still in the previous candle —
    // use its CLOSE as the entry price.
    let officialPrice: number;
    let source: string;

    if (latestTs >= entryTime) {
      // The provider has published the entry candle (or later) — use OPEN
      officialPrice = latestCandle.open;
      source = 'OPEN_CANDLE';
    } else {
      // Entry candle not yet published — use CLOSE of completed previous candle
      officialPrice = latestCandle.close;
      source = 'PREVIOUS_CLOSE_FALLBACK';
    }

    console.log(
      `[captureOfficialEntryPrice] signal=${signalId} pair=${pair} ` +
      `source=${source} latestTs=${latestCandle.timestamp} entryTime=${new Date(entryTime).toISOString()} ` +
      `price=${officialPrice}`
    );

    const supabase = await createClient();
    const { error: updateErr } = await supabase
      .from('manual_signal_audits')
      .update({ entry_price: officialPrice })
      .eq('id', signalId);

    if (updateErr) {
      console.error(`[captureOfficialEntryPrice] DB update error for ${signalId}:`, updateErr);
      return { success: false, error: 'Failed to update entry price' };
    }

    return { success: true, officialEntryPrice: officialPrice, entrySource: source };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[captureOfficialEntryPrice] Error:', msg);
    return { success: false, error: 'Failed to capture official entry price' };
  }
}

/**
 * ACTION: getActiveProviderName
 * Resolves current active provider display name.
 */
export async function getActiveProviderName(): Promise<string> {
  try {
    const manager = await getProviderManager();
    const provider = manager.getActiveProvider();
    if (!provider) return 'Unknown';
    const providerId = provider.id;
    if (providerId === 'yahoo') return 'Yahoo Finance';
    if (providerId === 'twelvedata') return 'Twelve Data';
    return providerId;
  } catch (err: unknown) {
    console.error('[getActiveProviderName] Error resolving provider:', err);
    return 'Unknown';
  }
}


