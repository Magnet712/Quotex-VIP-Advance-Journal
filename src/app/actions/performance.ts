'use server';

import { createClient } from '@/lib/supabase/server';

export interface PerformanceStatsFilter {
  dateFrom?: string;
  dateTo?: string;
  source?: 'ALL' | 'simulation' | 'live_otc' | 'live_market';
}

export async function getPerformanceStats(filters: PerformanceStatsFilter = {}) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    // Verify approval
    const { data: profile } = await supabase
      .from('users')
      .select('status')
      .eq('id', user.id)
      .single();

    if (profile?.status !== 'approved') {
      return { success: false, error: 'Unauthorized status' };
    }

    let query = supabase.from('signals').select('*');

    if (filters.source && filters.source !== 'ALL') {
      query = query.eq('source', filters.source);
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
    if (!signals || signals.length === 0) {
      return { success: true, hasData: false, stats: null };
    }

    // Basic Metrics
    const total = signals.length;
    const wins = signals.filter(s => s.result === 'WIN').length;
    const losses = signals.filter(s => s.result === 'LOSS').length;
    const pending = signals.filter(s => s.result === 'PENDING').length;
    const cancelled = signals.filter(s => s.result === 'CANCELLED').length;
    const resolved = wins + losses;
    const accuracy = resolved > 0 ? Number(((wins / resolved) * 100).toFixed(1)) : 0;

    // Daily averages
    const daysSet = new Set<string>();
    signals.forEach(s => {
      if (s.entry_time) {
        const d = new Date(s.entry_time).toLocaleDateString('sv-SE'); // YYYY-MM-DD
        daysSet.add(d);
      }
    });
    const totalDays = Math.max(1, daysSet.size);
    const avgDailySignals = Number((total / totalDays).toFixed(1));

    // Daily Performance Chart data & Win Rate progression
    const dailyMap: Record<string, { wins: number; losses: number; resolved: number }> = {};
    signals.forEach(s => {
      if (!s.entry_time) return;
      const day = new Date(s.entry_time).toLocaleDateString([], { month: 'short', day: 'numeric' });
      if (!dailyMap[day]) {
        dailyMap[day] = { wins: 0, losses: 0, resolved: 0 };
      }
      if (s.result === 'WIN') {
        dailyMap[day].wins += 1;
        dailyMap[day].resolved += 1;
      } else if (s.result === 'LOSS') {
        dailyMap[day].losses += 1;
        dailyMap[day].resolved += 1;
      }
    });

    const dailyPerformanceData = Object.entries(dailyMap).map(([date, counts]) => ({
      date,
      Wins: counts.wins,
      Losses: counts.losses,
      Accuracy: counts.resolved > 0 ? Math.round((counts.wins / counts.resolved) * 100) : 0
    }));

    // Asset-based Performance
    const assetMap: Record<string, { total: number; wins: number; resolved: number }> = {};
    signals.forEach(s => {
      const asset = s.pair || 'Unknown';
      if (!assetMap[asset]) {
        assetMap[asset] = { total: 0, wins: 0, resolved: 0 };
      }
      assetMap[asset].total += 1;
      if (s.result === 'WIN') {
        assetMap[asset].wins += 1;
        assetMap[asset].resolved += 1;
      } else if (s.result === 'LOSS') {
        assetMap[asset].resolved += 1;
      }
    });

    const assetPerformanceData = Object.entries(assetMap).map(([asset, data]) => ({
      asset,
      Total: data.total,
      Accuracy: data.resolved > 0 ? Math.round((data.wins / data.resolved) * 100) : 0
    })).sort((a, b) => b.Total - a.Total);

    // Identify Most Traded, Best, and Worst assets
    let mostTradedAsset = '—';
    let mostTradedCount = 0;
    let bestPerformingAsset = '—';
    let bestAccuracy = -1;
    let worstPerformingAsset = '—';
    let worstAccuracy = 101;

    Object.entries(assetMap).forEach(([asset, data]) => {
      if (data.total > mostTradedCount) {
        mostTradedAsset = asset;
        mostTradedCount = data.total;
      }
      // Require at least 2 signals to qualify for best/worst to reduce anomalies
      if (data.resolved >= 2) {
        const rate = (data.wins / data.resolved) * 100;
        if (rate > bestAccuracy) {
          bestAccuracy = rate;
          bestPerformingAsset = asset;
        }
        if (rate < worstAccuracy) {
          worstAccuracy = rate;
          worstPerformingAsset = asset;
        }
      }
    });

    return {
      success: true,
      hasData: true,
      stats: {
        total,
        wins,
        losses,
        pending,
        cancelled,
        accuracy,
        avgDailySignals,
        mostTradedAsset: `${mostTradedAsset} (${mostTradedCount})`,
        bestPerformingAsset: bestPerformingAsset !== '—' ? `${bestPerformingAsset} (${Math.round(bestAccuracy)}%)` : '—',
        worstPerformingAsset: worstPerformingAsset !== '—' ? `${worstPerformingAsset} (${Math.round(worstAccuracy)}%)` : '—',
        dailyPerformanceData,
        assetPerformanceData
      }
    };

  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
