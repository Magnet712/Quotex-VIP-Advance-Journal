'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ─── Admin Check Helper ──────────────────────────────────────────────────────
async function verifyAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: adminRecord } = await supabase
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    return !!adminRecord;
  } catch {
    return false;
  }
}

// ─── Get User Access State ──────────────────────────────────────────────────
export async function getUserAccessState() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: true, isLoggedIn: false, isAdmin: false, vipAccess: false, premiumAccess: false };

    const [adminCheck, userProfile] = await Promise.all([
      supabase.from('admins').select('id').eq('id', user.id).maybeSingle(),
      supabase.from('users').select('vip_access, premium_access, status').eq('id', user.id).maybeSingle()
    ]);

    return {
      success: true,
      isLoggedIn: true,
      isAdmin: !!adminCheck.data,
      vipAccess: userProfile.data?.vip_access ?? false,
      premiumAccess: userProfile.data?.premium_access ?? false,
      status: userProfile.data?.status ?? 'pending'
    };
  } catch (err: any) {
    return { success: false, error: err.message, isLoggedIn: false, isAdmin: false, vipAccess: false };
  }
}

// ─── Get Admin Optimization Settings ─────────────────────────────────────────
export async function getAdminOptimizationSettings() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value');

    if (error) throw error;

    const settings: Record<string, string> = {};
    // Seed default mappings
    const defaults: Record<string, string> = {
      min_confidence: '80',
      allowed_signal_hours: '08:00-12:00,18:00-22:00',
      losing_streak_limit: '3',
      losing_streak_pause_minutes: '15',
      premium_filter_mode: 'PRODUCTION',
      min_quality_score: '80',
      min_quality_score_live: '80',
      disabled_pairs: '',
      premium_signal_status: 'ACTIVE',
      paused_until: '',
      signal_visibility: 'premium'
    };

    // Populate from database
    (data ?? []).forEach(row => {
      settings[row.key] = row.value;
    });

    // Merge in defaults if missing
    Object.keys(defaults).forEach(key => {
      if (settings[key] === undefined) {
        settings[key] = defaults[key];
      }
    });

    // Check if PAUSED has expired
    if (settings.premium_signal_status === 'PAUSED' && settings.paused_until) {
      const pausedUntilDate = new Date(settings.paused_until);
      if (Date.now() > pausedUntilDate.getTime()) {
        settings.premium_signal_status = 'ACTIVE';
        settings.paused_until = '';
        
        // Update database asynchronously
        void supabase.from('system_settings').upsert([
          { key: 'premium_signal_status', value: 'ACTIVE', updated_at: new Date().toISOString() },
          { key: 'paused_until', value: '', updated_at: new Date().toISOString() }
        ]);
      }
    }

    return { success: true, settings };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Update Admin Optimization Settings ──────────────────────────────────────
export async function updateAdminOptimizationSettings(settings: Record<string, string>) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  try {
    const supabase = await createClient();
    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value: value.trim(),
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('system_settings')
      .upsert(updates);

    if (error) throw error;

    revalidatePath('/admin/signal-analytics');
    revalidatePath('/dashboard/signals');

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Streak Calculation Helper ───────────────────────────────────────────────
function calculateStreaks(results: string[]) {
  let maxLossStreak = 0;
  let currentLossStreak = 0;
  let winStreaks: number[] = [];
  let currentWinStreak = 0;

  for (const res of results) {
    if (res === 'WIN') {
      currentWinStreak++;
      if (currentLossStreak > maxLossStreak) {
        maxLossStreak = currentLossStreak;
      }
      currentLossStreak = 0;
    } else if (res === 'LOSS') {
      currentLossStreak++;
      if (currentWinStreak > 0) {
        winStreaks.push(currentWinStreak);
      }
      currentWinStreak = 0;
    } else {
      if (currentWinStreak > 0) {
        winStreaks.push(currentWinStreak);
        currentWinStreak = 0;
      }
      if (currentLossStreak > maxLossStreak) {
        maxLossStreak = currentLossStreak;
      }
      currentLossStreak = 0;
    }
  }

  if (currentWinStreak > 0) winStreaks.push(currentWinStreak);
  if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;

  const avgWinStreak = winStreaks.length > 0
    ? Math.round((winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length) * 10) / 10
    : 0;

  return { maxLossStreak, avgWinStreak };
}

// ─── Get Admin Signal Analytics ──────────────────────────────────────────────
export interface AnalyticsFilters {
  dateFrom?: string;
  dateTo?: string;
  pair?: string;
  timeframe?: string;
  strategyVersion?: string;
  confidenceMin?: number;
  confidenceMax?: number;
  result?: string;
  source?: string;
}

export async function getAdminSignalAnalytics(filters: AnalyticsFilters = {}) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  try {
    const supabase = await createClient();

    // 1. Fetch system_settings to know disabled pairs
    const { data: settingsData } = await supabase
      .from('system_settings')
      .select('key, value');

    const settingsMap = new Map((settingsData ?? []).map((r: any) => [r.key, r.value]));
    const disabledPairsList = (settingsMap.get('disabled_pairs') ?? '')
      .split(',')
      .map((p: string) => p.trim())
      .filter(Boolean);

    // 2. Query signals table (all signals matching general filters)
    let query = supabase
      .from('signals')
      .select('*')
      .order('entry_time', { ascending: true }); // chronological order for streak calculations

    if (filters.pair && filters.pair !== 'ALL') {
      query = query.eq('pair', filters.pair);
    }
    if (filters.timeframe && filters.timeframe !== 'ALL') {
      query = query.eq('timeframe', filters.timeframe);
    }
    if (filters.strategyVersion && filters.strategyVersion !== 'ALL') {
      query = query.eq('strategy_version', filters.strategyVersion);
    }
    if (filters.result && filters.result !== 'ALL') {
      query = query.eq('result', filters.result);
    }
    if (filters.source && filters.source !== 'ALL') {
      query = query.eq('source', filters.source);
    }
    if (filters.confidenceMin !== undefined) {
      query = query.gte('confidence', filters.confidenceMin);
    }
    if (filters.confidenceMax !== undefined) {
      query = query.lte('confidence', filters.confidenceMax);
    }
    if (filters.dateFrom) {
      query = query.gte('entry_time', new Date(filters.dateFrom).toISOString());
    }
    if (filters.dateTo) {
      const endOfDay = new Date(filters.dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('entry_time', endOfDay.toISOString());
    }

    const { data: signals, error } = await query;
    if (error) throw error;

    const allSignals = signals ?? [];

    // Calculate core statistics
    const totalSignals = allSignals.length;
    const wins = allSignals.filter((s: any) => s.result === 'WIN').length;
    const losses = allSignals.filter((s: any) => s.result === 'LOSS').length;
    const resolved = wins + losses;
    const accuracy = resolved > 0 ? Math.round((wins / resolved) * 100 * 10) / 10 : 0;
    const avgConfidence = totalSignals > 0
      ? Math.round(allSignals.reduce((acc: number, s: any) => acc + s.confidence, 0) / totalSignals * 10) / 10
      : 0;

    // Streaks calculation
    const signalResults = allSignals.map((s: any) => s.result);
    const { maxLossStreak, avgWinStreak } = calculateStreaks(signalResults);

    // Pair Rankings
    const pairStatsMap: Record<string, { total: number; wins: number; losses: number; resolved: number }> = {};
    allSignals.forEach((s: any) => {
      if (!pairStatsMap[s.pair]) {
        pairStatsMap[s.pair] = { total: 0, wins: 0, losses: 0, resolved: 0 };
      }
      pairStatsMap[s.pair].total++;
      if (s.result === 'WIN') {
        pairStatsMap[s.pair].wins++;
        pairStatsMap[s.pair].resolved++;
      } else if (s.result === 'LOSS') {
        pairStatsMap[s.pair].losses++;
        pairStatsMap[s.pair].resolved++;
      }
    });

    const pairRankings = Object.entries(pairStatsMap).map(([pair, stats]: [string, any]) => {
      const accuracy = stats.resolved > 0 ? Math.round((stats.wins / stats.resolved) * 100) : 0;
      const status = disabledPairsList.includes(pair) ? 'DISABLED' : 'ACTIVE';
      return { pair, ...stats, accuracy, status };
    }).sort((a, b) => b.accuracy - a.accuracy);

    // Time Performance Analysis (hour by hour)
    const hourlyMap: Record<number, { total: number; wins: number; losses: number; resolved: number }> = {};
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = { total: 0, wins: 0, losses: 0, resolved: 0 };
    }

    allSignals.forEach((s: any) => {
      // Calculate hour in IST (UTC+5.5)
      const date = new Date(s.entry_time);
      const istDate = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
      const hour = istDate.getUTCHours();

      hourlyMap[hour].total++;
      if (s.result === 'WIN') {
        hourlyMap[hour].wins++;
        hourlyMap[hour].resolved++;
      } else if (s.result === 'LOSS') {
        hourlyMap[hour].losses++;
        hourlyMap[hour].resolved++;
      }
    });

    const hourlyPerformance = Object.entries(hourlyMap).map(([hr, stats]: [string, any]) => {
      const hour = parseInt(hr, 10);
      const label = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`;
      const accuracy = stats.resolved > 0 ? Math.round((stats.wins / stats.resolved) * 100) : 0;
      return { hour, label, ...stats, accuracy };
    });

    // Strategy Performance
    const stratMap: Record<string, { total: number; wins: number; losses: number; resolved: number }> = {};
    allSignals.forEach((s: any) => {
      const v = s.strategy_version ?? 'v1.0';
      if (!stratMap[v]) {
        stratMap[v] = { total: 0, wins: 0, losses: 0, resolved: 0 };
      }
      stratMap[v].total++;
      if (s.result === 'WIN') {
        stratMap[v].wins++;
        stratMap[v].resolved++;
      } else if (s.result === 'LOSS') {
        stratMap[v].losses++;
        stratMap[v].resolved++;
      }
    });

    const strategyPerformance = Object.entries(stratMap).map(([version, stats]: [string, any]) => {
      const accuracy = stats.resolved > 0 ? Math.round((stats.wins / stats.resolved) * 100) : 0;
      return { version, ...stats, accuracy };
    });

    // Last 100 signals (reverse chronological for display)
    const recentSignals = [...allSignals]
      .reverse()
      .slice(0, 100);

    // Compile recommended settings / warnings
    const badPerformingPairs = pairRankings
      .filter((p: any) => p.resolved >= 5 && p.accuracy < 70)
      .map((p: any) => p.pair);

    const bestPerformingStrategy = strategyPerformance.length > 0
      ? [...strategyPerformance].sort((a: any, b: any) => b.accuracy - a.accuracy)[0]?.version
      : 'v1.1';

    const hourlyAccuracySorted = [...hourlyPerformance]
      .filter((h: any) => h.resolved >= 5)
      .sort((a: any, b: any) => b.accuracy - a.accuracy);

    const bestHours = hourlyAccuracySorted.slice(0, 3).map((h: any) => h.label);

    const recommendedSettings = {
      minConfidence: 85,
      allowedHours: bestHours.length > 0 ? bestHours.join(', ') : '08:00-12:00, 18:00-22:00',
      bestStrategy: bestPerformingStrategy,
      disabledPairsRecommend: badPerformingPairs
    };

    return {
      success: true,
      summary: {
        totalSignals,
        wins,
        losses,
        accuracy,
        avgConfidence,
        maxLossStreak,
        avgWinStreak
      },
      pairRankings,
      hourlyPerformance,
      strategyPerformance,
      recentSignals,
      recommendedSettings
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Get Public Optimization Settings ──────────────────────────────────────
export async function getPublicOptimizationSettings() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const { data: profile } = await supabase
      .from('users')
      .select('status')
      .eq('id', user.id)
      .single();

    if (profile?.status !== 'approved') {
      return { success: false, error: 'Unauthorized' };
    }

    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value');

    if (error) throw error;

    const settings: Record<string, string> = {};
    const defaults: Record<string, string> = {
      min_confidence: '80',
      allowed_signal_hours: '08:00-12:00,18:00-22:00',
      losing_streak_limit: '3',
      losing_streak_pause_minutes: '15',
      premium_filter_mode: 'PRODUCTION',
      min_quality_score: '80',
      disabled_pairs: '',
      premium_signal_status: 'ACTIVE',
      paused_until: '',
      signal_visibility: 'premium'
    };

    (data ?? []).forEach(row => {
      settings[row.key] = row.value;
    });

    Object.keys(defaults).forEach(key => {
      if (settings[key] === undefined) {
        settings[key] = defaults[key];
      }
    });

    // Check if PAUSED has expired
    if (settings.premium_signal_status === 'PAUSED' && settings.paused_until) {
      const pausedUntilDate = new Date(settings.paused_until);
      if (Date.now() > pausedUntilDate.getTime()) {
        settings.premium_signal_status = 'ACTIVE';
        settings.paused_until = '';
        
        void supabase.from('system_settings').upsert([
          { key: 'premium_signal_status', value: 'ACTIVE', updated_at: new Date().toISOString() },
          { key: 'paused_until', value: '', updated_at: new Date().toISOString() }
        ]);
      }
    }

    return { success: true, settings };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
