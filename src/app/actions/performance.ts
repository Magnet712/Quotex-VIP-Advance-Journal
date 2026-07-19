'use server';

import { createClient } from '@/lib/supabase/server';
import type { DataPipeline } from '@/lib/pipeline';

export interface PerformanceStatsFilter {
  dateFrom?: string;
  dateTo?: string;
  source?: DataPipeline;
}

export async function getPerformanceStats(filters: PerformanceStatsFilter = {}) {
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
      return { success: false, error: 'Unauthorized status' };
    }

    const src = filters.source ?? 'ALL';

    // ── 1. Fetch manual_signal_audits (Live FOREX) ────────────────────────
    let msaNormalised: { pair: string; ts: string; result: 'WIN' | 'LOSS' | 'PENDING' }[] = [];
    if (src === 'ALL' || src === 'live_market') {
      let msaQuery = supabase
        .from('manual_signal_audits')
        .select('pair, status, entry_time, created_at')
        .eq('user_id', user.id);

      if (filters.dateFrom) {
        msaQuery = msaQuery.gte('entry_time', new Date(filters.dateFrom).toISOString());
      }
      if (filters.dateTo) {
        const endOfDay = new Date(filters.dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        msaQuery = msaQuery.lte('entry_time', endOfDay.toISOString());
      }

      const { data: msaRows, error: msaErr } = await msaQuery;
      if (msaErr) throw msaErr;

      msaNormalised = (msaRows ?? []).map((r: any) => ({
        pair: r.pair || 'Unknown',
        ts: r.entry_time || r.created_at || '',
        result: r.status as 'WIN' | 'LOSS' | 'PENDING',
      }));
    }

    // ── 2. Fetch signals (Live OTC) — exclude simulation ───────────────────
    let sigNormalised: { pair: string; ts: string; result: 'WIN' | 'LOSS' | 'PENDING' }[] = [];
    if (src === 'ALL' || src === 'live_otc') {
      let sigQuery = supabase
        .from('signals')
        .select('pair, result, entry_time')
        .eq('source', 'live_otc');

      if (filters.dateFrom) {
        sigQuery = sigQuery.gte('entry_time', new Date(filters.dateFrom).toISOString());
      }
      if (filters.dateTo) {
        const endOfDay = new Date(filters.dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        sigQuery = sigQuery.lte('entry_time', endOfDay.toISOString());
      }

      const { data: sigRows, error: sigErr } = await sigQuery;
      if (sigErr) throw sigErr;

      sigNormalised = (sigRows ?? []).map((r: any) => ({
        pair: r.pair || 'Unknown',
        ts: r.entry_time || '',
        result: r.result as 'WIN' | 'LOSS' | 'PENDING',
      }));
    }

    const signals = [...msaNormalised, ...sigNormalised];

    if (signals.length === 0) {
      return { success: true, hasData: false, stats: null };
    }

    // ── 3. Basic Metrics ───────────────────────────────────────────────────
    const total = signals.length;
    const wins = signals.filter(s => s.result === 'WIN').length;
    const losses = signals.filter(s => s.result === 'LOSS').length;
    const pending = signals.filter(s => s.result === 'PENDING').length;
    const cancelled = 0;
    const resolved = wins + losses;
    const accuracy = resolved > 0 ? Number(((wins / resolved) * 100).toFixed(1)) : 0;

    // Daily averages
    const daysSet = new Set<string>();
    signals.forEach(s => {
      if (s.ts) {
        const d = new Date(s.ts).toLocaleDateString('sv-SE');
        daysSet.add(d);
      }
    });
    const totalDays = Math.max(1, daysSet.size);
    const avgDailySignals = Number((total / totalDays).toFixed(1));

    // Daily Performance Chart data & Win Rate progression
    const dailyMap: Record<string, { wins: number; losses: number; resolved: number }> = {};
    signals.forEach(s => {
      if (!s.ts) return;
      const day = new Date(s.ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
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
      if (!assetMap[s.pair]) {
        assetMap[s.pair] = { total: 0, wins: 0, resolved: 0 };
      }
      assetMap[s.pair].total += 1;
      if (s.result === 'WIN') {
        assetMap[s.pair].wins += 1;
        assetMap[s.pair].resolved += 1;
      } else if (s.result === 'LOSS') {
        assetMap[s.pair].resolved += 1;
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
