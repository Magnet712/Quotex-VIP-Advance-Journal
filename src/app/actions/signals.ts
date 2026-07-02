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
  result?:       'ALL' | 'PENDING' | 'WIN' | 'LOSS';
  source?:       'ALL' | 'simulation' | 'live_otc' | 'live_market';
  page?:         number;
  page_size?:    number;
}

// ─── Auth helper ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: saveSignal
// Persists a newly generated signal to Supabase with result = 'PENDING'.
// Called immediately after the existing generateSignal() produces a result.
// ─────────────────────────────────────────────────────────────────────────────
export async function saveSignal(input: SaveSignalInput) {
  const { ok } = await checkApproved();
  if (!ok) {
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
      return { success: false, error: error.message };
    }

    return { success: true, signalId: data.id };
  } catch (err: any) {
    console.error('[saveSignal] Unexpected error:', err);
    return { success: false, error: err.message };
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
      return { success: false, error: updateError.message };
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
  } catch (err: any) {
    console.error('[updateSignalResult] Unexpected error:', err);
    return { success: false, error: err.message };
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
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getSignalHistory
// Returns paginated signal history with filters for the history page.
// ─────────────────────────────────────────────────────────────────────────────
export async function getSignalHistory(filters: SignalHistoryFilters = {}) {
  const { ok } = await checkApproved();
  if (!ok) return { success: false, error: 'Unauthorized', signals: [], total: 0 };

  try {
    const supabase   = await createClient();
    const page       = filters.page      ?? 1;
    const pageSize   = filters.page_size ?? 50;
    const from       = (page - 1) * pageSize;
    const to         = from + pageSize - 1;

    let query = supabase
      .from('signals')
      .select('*', { count: 'exact' })
      .order('entry_time', { ascending: false })
      .range(from, to);

    // Apply filters
    if (filters.pair && filters.pair !== 'ALL') {
      query = query.eq('pair', filters.pair);
    }
    if (filters.strategy && filters.strategy !== 'ALL') {
      query = query.eq('strategy_name', filters.strategy);
    }
    if (filters.result && filters.result !== 'ALL') {
      query = query.eq('result', filters.result);
    }
    if (filters.source && filters.source !== 'ALL') {
      query = query.eq('source', filters.source);
    }
    if (filters.date_from) {
      query = query.gte('entry_time', new Date(filters.date_from).toISOString());
    }
    if (filters.date_to) {
      // End of day
      const endOfDay = new Date(filters.date_to);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('entry_time', endOfDay.toISOString());
    }

    const { data, error, count } = await query;

    if (error) {
      return { success: false, error: error.message, signals: [], total: 0 };
    }

    return { success: true, signals: data ?? [], total: count ?? 0 };
  } catch (err: any) {
    return { success: false, error: err.message, signals: [], total: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getSignalPerformance
// Returns aggregated stats for the signal dashboard and history page.
// Premium accuracy is calculated from live_otc source only.
// ─────────────────────────────────────────────────────────────────────────────
export async function getSignalPerformance(source?: 'simulation' | 'live_otc' | 'live_market' | 'ALL') {
  const { ok } = await checkApproved();
  if (!ok) return { success: false, error: 'Unauthorized' };

  try {
    const supabase = await createClient();

    let query = supabase
      .from('signals')
      .select('result, source, entry_time');

    if (source && source !== 'ALL') {
      query = query.eq('source', source);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    const signals = data ?? [];
    
    // Calculate start of today in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const istTodayStart = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 0, 0, 0, 0));
    const todayStartUtc = new Date(istTodayStart.getTime() - istOffset);

    const totalToday = signals.filter(s => s.entry_time && new Date(s.entry_time).getTime() >= todayStartUtc.getTime()).length;

    const total   = signals.length;
    const wins    = signals.filter(s => s.result === 'WIN').length;
    const losses  = signals.filter(s => s.result === 'LOSS').length;
    const pending = signals.filter(s => s.result === 'PENDING').length;
    const resolved = wins + losses;
    const accuracy = resolved > 0 ? Math.round((wins / resolved) * 100 * 100) / 100 : 0;

    return {
      success: true,
      stats: { total, wins, losses, pending, accuracy, totalToday },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getDistinctPairs
// Returns all unique pairs stored in signals table (for filter dropdowns).
// ─────────────────────────────────────────────────────────────────────────────
export async function getDistinctPairs() {
  const { ok } = await checkApproved();
  if (!ok) return { success: false, pairs: [] };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('signals')
      .select('pair')
      .order('pair');

    if (error) return { success: false, pairs: [] };

    const pairs = [...new Set((data ?? []).map(d => d.pair))];
    return { success: true, pairs };
  } catch {
    return { success: false, pairs: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getPairPerformanceMap
// Returns a map of pair symbol to its historical win rate percentage.
// ─────────────────────────────────────────────────────────────────────────────
export async function getPairPerformanceMap() {
  const { ok } = await checkApproved();
  if (!ok) return { success: false, performance: {} };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('signals')
      .select('pair, result')
      .neq('result', 'PENDING');

    if (error) throw error;

    const map: Record<string, { wins: number; total: number }> = {};
    (data ?? []).forEach(s => {
      if (!map[s.pair]) map[s.pair] = { wins: 0, total: 0 };
      map[s.pair].total++;
      if (s.result === 'WIN') map[s.pair].wins++;
    });

    const performance: Record<string, number> = {};
    Object.entries(map).forEach(([pair, stats]) => {
      performance[pair] = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 80;
    });

    return { success: true, performance };
  } catch {
    return { success: false, performance: {} };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getActiveLiveMarketSignals
// Returns active (unexpired) live market signals from the database.
// ─────────────────────────────────────────────────────────────────────────────
export async function getActiveLiveMarketSignals() {
  const { ok } = await checkApproved();
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
  } catch (err: any) {
    console.error('[getActiveLiveMarketSignals] Error:', err.message);
    return { success: false, error: err.message, signals: [] };
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
      return { success: false, error: error.message };
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
  } catch (err: any) {
    console.error('[getPublicSignalPerformance] Unexpected error:', err);
    return { success: false, error: err.message };
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
      return { success: false, error: error.message, signals: [] };
    }

    return { success: true, signals: data ?? [] };
  } catch (err: any) {
    console.error('[getPublicRecentSignals] Unexpected error:', err);
    return { success: false, error: err.message, signals: [] };
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
  } catch (err: any) {
    console.error('[getPublicCommunityStats] Unexpected error:', err);
    return { success: false, error: err.message };
  }
}

