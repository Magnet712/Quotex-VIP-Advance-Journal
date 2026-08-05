'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type SampleTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface BestPairEntry {
  rank: number;
  pair: string;
  trades: number;
  wins: number;
  winRate: number;
  sample: SampleTier;
  medal: string | null;
}

export interface BestPairData {
  status: 'ready' | 'warming';
  totalTrades: number;
  pairs: BestPairEntry[];
  podium: BestPairEntry[];
  focusTip: string | null;
}

const MIN_TRADES_FOR_ANALYSIS = 5;
const PODIUM_MIN_TRADES = 3;
const HIGH_SAMPLE = 15;
const MEDIUM_SAMPLE = 5;

const MEDALS = ['🥇', '🥈', '🥉'];

interface TradeRow {
  asset: string;
  trade_date: string;
  profit_loss: number | null;
  results: string | null;
}

// ACTION: getBestPairAnalysis
// Read-only, approved-user-gated. Ranks the user's OWN journaled pairs by win
// rate using the journal's win logic. Zero new storage.
export async function getBestPairAnalysis(): Promise<{
  success: boolean;
  data?: BestPairData;
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

    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from('trades')
      .select('asset, trade_date, profit_loss, results')
      .eq('user_id', user.id);

    if (error) return { success: false, error: 'Failed to analyze best pair' };

    const map: Record<string, { total: number; wins: number }> = {};
    let totalTrades = 0;

    (rows ?? []).forEach((r: TradeRow) => {
      const ms = new Date(r.trade_date).getTime();
      if (Number.isNaN(ms)) return;
      totalTrades++;
      const res = (r.results || '').toUpperCase();
      const isWin = (r.profit_loss ?? 0) > 0 || res === 'WIN' || res === 'MTG WIN';
      const asset = (r.asset || 'UNKNOWN').toUpperCase();
      if (!map[asset]) map[asset] = { total: 0, wins: 0 };
      map[asset].total++;
      if (isWin) map[asset].wins++;
    });

    const pairs: BestPairEntry[] = Object.entries(map)
      .map(([pair, e]) => {
        const sample: SampleTier = e.total >= HIGH_SAMPLE ? 'HIGH' : e.total >= MEDIUM_SAMPLE ? 'MEDIUM' : 'LOW';
        return {
          pair,
          trades: e.total,
          wins: e.wins,
          winRate: Math.round((e.wins / e.total) * 100),
          sample,
          rank: 0,
          medal: null,
        };
      })
      .sort((a, b) => b.winRate - a.winRate || b.trades - a.trades)
      .map((entry, idx) => ({ ...entry, rank: idx + 1, medal: MEDALS[idx] ?? null }));

    const podium = pairs.filter((p) => p.trades >= PODIUM_MIN_TRADES).slice(0, 3);

    let focusTip: string | null = null;
    if (podium.length > 0) {
      const best = podium[0];
      focusTip =
        `Your best pair is ${best.pair} at ${best.winRate}% over ${best.trades} trades${
          best.sample === 'LOW' ? ' — log more trades on this pair to confirm the edge' : ' — keep it central to your watchlist'
        }.`;
    } else if (totalTrades > 0) {
      focusTip = 'Your trades are spread across many pairs — logging more per pair will sharpen your best-pair ranking.';
    }

    return {
      success: true,
      data: {
        status: totalTrades >= MIN_TRADES_FOR_ANALYSIS ? 'ready' : 'warming',
        totalTrades,
        pairs,
        podium,
        focusTip,
      },
    };
  } catch {
    return { success: false, error: 'Failed to analyze best pair' };
  }
}