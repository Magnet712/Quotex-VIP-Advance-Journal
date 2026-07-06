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
import { evaluateSignal } from '@/lib/market-data/core/SignalEngine';
import { ProviderManager } from '@/lib/market-data/core/ProviderManager';
import { TwelveDataProvider } from '@/lib/market-data/forex/adapters/TwelveDataProvider';
import { YahooProvider } from '@/lib/market-data/forex/adapters/YahooProvider';
import { CandleCache } from '@/lib/market-data/core/CandleCache';
import { NormalizedCandle } from '@/lib/market-data/types';
import { getUserAccessState } from '@/app/actions/admin_optimization';

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
  } catch (err) {
    const errorObj = err as Error;
    console.error('[saveSignal] Unexpected error:', err);
    return { success: false, error: errorObj.message };
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
  } catch (err) {
    const errorObj = err as Error;
    console.error('[updateSignalResult] Unexpected error:', err);
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
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorObj = err as Error;
    return { success: false, error: errorObj.message };
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
  } catch (err) {
    const errorObj = err as Error;
    return { success: false, error: errorObj.message, signals: [], total: 0 };
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
  } catch (err) {
    const errorObj = err as Error;
    console.error('[getActiveLiveMarketSignals] Error:', errorObj.message);
    return { success: false, error: errorObj.message, signals: [] };
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
  } catch (err) {
    const errorObj = err as Error;
    console.error('[getPublicSignalPerformance] Unexpected error:', err);
    return { success: false, error: errorObj.message };
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
  } catch (err) {
    const errorObj = err as Error;
    console.error('[getPublicRecentSignals] Unexpected error:', err);
    return { success: false, error: errorObj.message, signals: [] };
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
    const errorObj = err as Error;
    console.error('[getPublicCommunityStats] Unexpected error:', err);
    return { success: false, error: errorObj.message };
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
  resolve: (candles: NormalizedCandle[]) => void;
  reject: (err: Error) => void;
}

let batchQueue: QueueRequest[] = [];
let batchTimeout: NodeJS.Timeout | null = null;
let globalManager: ProviderManager | null = null;

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
  if (globalManager) return globalManager;
  const supabase = await createClient();
  globalManager = new ProviderManager(supabase);
  
  const twelvedata = new TwelveDataProvider();
  globalManager.registerProvider(twelvedata);
  
  const yahoo = new YahooProvider();
  globalManager.registerProvider(yahoo);
  
  if (!process.env.TWELVEDATA_API_KEY) {
    console.warn("[Server Action] TwelveData API key is missing. Defaulting active provider to Yahoo Finance.");
    globalManager.setActiveProvider(yahoo.id);
    await yahoo.connect().catch((e: Error) => console.error("[Server Action] Yahoo connect error:", e.message));
  } else {
    globalManager.setActiveProvider(twelvedata.id);
    await twelvedata.connect().catch((e: Error) => console.error("[Server Action] TwelveData connect error:", e.message));
  }
  
  return globalManager;
}

async function queueCandleFetch(pair: string, limit: number): Promise<NormalizedCandle[]> {
  return new Promise((resolve, reject) => {
    batchQueue.push({ pair, resolve, reject });
    if (!batchTimeout) {
      batchTimeout = setTimeout(() => {
        void processBatch(limit);
      }, 50);
    }
  });
}

async function processBatch(limit: number) {
  const currentBatch = [...batchQueue];
  batchQueue = [];
  batchTimeout = null;
  
  if (currentBatch.length === 0) return;
  
  const pairs = Array.from(new Set(currentBatch.map(r => r.pair)));
  console.log(`[Batch Queue] Executing Twelve Data request for symbols: ${pairs.join(", ")}`);
  
  try {
    const manager = await getProviderManager();
    const results = await manager.fetchHistoricCandlesBatch(pairs, limit);
    
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
export async function scanLiveMarketAsset(pair: string): Promise<ScanResult> {
  const { ok } = await checkApproved();
  if (!ok) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    if (!userId) {
      return { success: false, error: 'User session not found' };
    }

    // Retrieve access level to enforce user session cooldown (Premium: 15s, Free: 60s)
    const access = await getUserAccessState();
    const isPremium = access.premiumAccess || access.vipAccess || access.isAdmin;
    const userCooldownMs = isPremium ? 15000 : 60000;

    const now = Date.now();
    const userLastScanTime = globalUserLastScan.get(userId) || 0;
    const userElapsed = now - userLastScanTime;

    if (userElapsed < userCooldownMs) {
      return {
        success: false,
        error: 'Cooldown active',
        cooldownRemaining: Math.ceil((userCooldownMs - userElapsed) / 1000)
      };
    }

    // Cooldown is 30 seconds per pair globally
    const pairCooldownMs = 30000;
    const lastPairScan = globalPairLastScan.get(pair) || 0;
    const pairElapsed = now - lastPairScan;

    // Check if there is a cached result
    const cached = globalScanCache.get(pair);
    const hasValidCache = cached && cached.result && cached.expiresAt > now;

    // If cache is still valid, return it immediately without hitting Twelve Data
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

    // If cache has expired, but we are still inside the 30-second cooldown period,
    // we serve the expired cached result if available to protect our Twelve Data API limits.
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

    // Enforce Market Status checks: No wasted Twelve Data API calls if Forex market is closed!
    const marketOpen = isForexMarketOpen();
    if (!marketOpen) {
      if (cached && cached.result) {
        // Serve expired cache on weekends rather than failing
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

    // Implement Request Coalescing using shared in-flight Promise map
    let fetchPromise = globalInFlightFetches.get(pair);
    if (!fetchPromise) {
      console.log(`[Scan Pipeline] Queueing fresh coalesced market query for: ${pair}`);
      fetchPromise = queueCandleFetch(pair, 60);
      globalInFlightFetches.set(pair, fetchPromise);
      fetchPromise.finally(() => {
        globalInFlightFetches.delete(pair);
      });
    } else {
      console.log(`[Request Coalescing] Reusing active in-flight request for: ${pair}`);
    }

    let candles: NormalizedCandle[] = [];
    try {
      candles = await fetchPromise;
    } catch (err: unknown) {
      const errorInstance = err instanceof Error ? err : new Error(String(err));
      return { success: false, error: `Failed to fetch market data: ${errorInstance.message}` };
    }

    if (candles.length < 52) {
      return { success: false, error: `Insufficient candle history returned: ${candles.length}/52` };
    }

    incrementGlobalCounter('manualScansCount');

    // Preload history into CandleCache for SignalEngine consumption
    CandleCache.preloadHistory(pair, candles);

    const lastCandle = candles[candles.length - 1];
    const lastCandleTime = lastCandle?.timestamp ? new Date(lastCandle.timestamp) : new Date();
    
    // Aligned with the market provider's latest completed candle
    const entryTime = new Date(lastCandleTime.getTime() + 60 * 1000);
    const expiryTime = new Date(entryTime.getTime() + 60 * 1000);

    // Evaluate signal using the SignalEngine (which reads from CandleCache)
    const engineRes = evaluateSignal(pair);

    // Compile Rich AI Descriptive Analysis
    let marketBias = "Neutral / Range";
    let recommendationText = "Awaiting strong momentum confirmation. Avoid taking entries under high volatility/range conditions.";

    if (engineRes.direction === 'CALL') {
      marketBias = engineRes.confidence >= 85 ? "Strong Buy" : "Buy Bias";
      recommendationText = "Wait for current candle to close. Enter next candle (CALL).";
    } else if (engineRes.direction === 'PUT') {
      marketBias = engineRes.confidence >= 85 ? "Strong Sell" : "Sell Bias";
      recommendationText = "Wait for current candle to close. Enter next candle (PUT).";
    }

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

    console.log(`
============================================================
[MANUAL SCAN LOG]
Latest Closed Candle:
${formatUTC(lastCandleTime)}
↓
${formatKolkata(lastCandleTime)} Asia/Kolkata
Entry Candle:
${formatKolkata(entryTime)}
Expiry:
${formatKolkata(expiryTime)}
Current Server Time:
${formatUTC(new Date())}
Countdown:
${formatCountdown(diffSecServer)}

[PROVIDER TIME ALIGNMENT CHECK]
Provider Timestamp:
${providerTimestamp}
Provider Timezone:
${providerTimezone}
Normalized UTC:
${lastCandleTime.toISOString().replace(".000", "")}
Displayed Asia/Kolkata:
${formatKolkata(lastCandleTime)}
============================================================
`);

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
      dataSource: "Twelve Data",
      cacheStatus: "Fresh" as const,
      cacheAgeSeconds: 0,
      serverTime: new Date().toISOString()
    };

    // Cache the full indicators analysis
    globalScanCache.set(pair, {
      pair,
      result: scanResultData,
      expiresAt: expiryTime.getTime()
    });

    globalPairLastScan.set(pair, now);
    globalUserLastScan.set(userId, now);

    return {
      success: true,
      result: scanResultData,
      cooldownRemaining: Math.ceil(pairCooldownMs / 1000)
    };
  } catch (err: unknown) {
    const errorInstance = err instanceof Error ? err : new Error(String(err));
    console.error('[scanLiveMarketAsset] Execution exception:', errorInstance.message);
    return { success: false, error: errorInstance.message };
  }
}

/**
 * ACTION: getScannerStats
 * Exposes diagnostic metrics and saved credit telemetry counts.
 */
export async function getScannerStats(): Promise<{ success: boolean; stats?: Record<string, number>; error?: string }> {
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
    return { success: false, error: errorObj.message };
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
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[saveManualSignal] Error saving signal:', msg);
    return { success: false, error: msg };
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
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[getManualSignalAudits] Error fetching signal audits:', msg);
    return { success: false, error: msg, audits: [] };
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

    // 2. Fetch fresh price
    const manager = await getProviderManager();
    let candles = await manager.fetchHistoricCandles(audit.pair, 2);
    if (!candles || candles.length === 0) {
      console.warn(`[settleManualSignal] Active provider returned no candles for ${audit.pair}. Falling back to Yahoo Finance.`);
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

    // 4. Update row
    const { error: updateErr } = await supabase
      .from('manual_signal_audits')
      .update({
        expiry_price: exitPrice,
        status: status
      })
      .eq('id', signalId);

    if (updateErr) throw updateErr;

    return { success: true, status, exitPrice };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[settleManualSignal] Error settling manual signal:', msg);
    return { success: false, error: msg };
  }
}

