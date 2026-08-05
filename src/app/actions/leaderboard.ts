'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface PairLeaderboardEntry {
  pair: string;
  signals: number;
  wins: number;
  winRate: number;
  todaySignals: number;
  todayWins: number;
  todayWinRate: number;
  status: 'HOT' | 'STABLE' | 'WATCH';
  rank: number;
}

const LOOKBACK_DAYS = 90;
const MIN_RESOLVED_SIGNALS = 5;
const TOP_N = 8;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istTodayStart(nowMs: number): number {
  const local = nowMs + IST_OFFSET_MS;
  const dayStart = Math.floor(local / 86400000) * 86400000;
  return dayStart - IST_OFFSET_MS;
}

// ACTION: getPairLeaderboard
// Read-only, approved-user-gated aggregation of community OTC signal results.
// Uses the service-role client (RLS bypass) so all approved users' MANUAL scan
// signals are summarized (user_id IS NOT NULL excludes legacy automated-era
// rows). Honors override_result.
export async function getPairLeaderboard(): Promise<{
  success: boolean;
  pairs?: PairLeaderboardEntry[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: profile } = await supabase
      .from('users')
      .select('status')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.status !== 'approved') {
      return { success: false, error: 'Access denied' };
    }

    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
    const admin = createAdminClient();

    const { data: rows, error } = await admin
      .from('signals')
      .select('pair, result, override_result, entry_time')
      .eq('source', 'live_otc')
      .not('user_id', 'is', null)
      .gte('entry_time', since);

    if (error) return { success: false, error: 'Failed to load leaderboard' };

    const todayStart = istTodayStart(Date.now());
    const map: Record<string, { signals: number; wins: number; todaySignals: number; todayWins: number }> = {};

    interface SignalRow {
      pair: string;
      result: string;
      override_result: string | null;
      entry_time: string;
    }

    (rows ?? []).forEach((r: SignalRow) => {
      const eff = r.override_result ?? r.result;
      if (eff !== 'WIN' && eff !== 'LOSS') return;
      if (!map[r.pair]) map[r.pair] = { signals: 0, wins: 0, todaySignals: 0, todayWins: 0 };
      const e = map[r.pair];
      e.signals++;
      if (eff === 'WIN') e.wins++;
      const t = new Date(r.entry_time).getTime();
      if (t >= todayStart) {
        e.todaySignals++;
        if (eff === 'WIN') e.todayWins++;
      }
    });

    const pairs: PairLeaderboardEntry[] = Object.entries(map)
      .filter(([, e]) => e.signals >= MIN_RESOLVED_SIGNALS)
      .map(([pair, e]) => {
        const winRate = Math.round((e.wins / e.signals) * 100);
        return {
          pair,
          signals: e.signals,
          wins: e.wins,
          winRate,
          todaySignals: e.todaySignals,
          todayWins: e.todayWins,
          todayWinRate: e.todaySignals > 0 ? Math.round((e.todayWins / e.todaySignals) * 100) : 0,
          status: (winRate >= 80 && e.signals >= 10 ? 'HOT' : winRate >= 70 ? 'STABLE' : 'WATCH') as PairLeaderboardEntry['status'],
          rank: 0,
        };
      })
      .sort((a, b) => b.winRate - a.winRate || b.signals - a.signals)
      .slice(0, TOP_N)
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

    return { success: true, pairs };
  } catch {
    return { success: false, error: 'Failed to load leaderboard' };
  }
}