'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type SampleTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface PerfMetric {
  winRate: number;
  n: number;
  wins: number;
  losses: number;
  sample: SampleTier;
}

export interface PerformanceVsAiData {
  you: PerfMetric | null;
  ai: PerfMetric;
  combined: PerfMetric | null;
  insight: string;
  methodology: string[];
}

const LOOKBACK_DAYS = 90;
const HIGH_SAMPLE = 20;
const MEDIUM_SAMPLE = 10;

function sampleOf(n: number): SampleTier {
  return n >= HIGH_SAMPLE ? 'HIGH' : n >= MEDIUM_SAMPLE ? 'MEDIUM' : 'LOW';
}

function metricOf(wins: number, losses: number): PerfMetric {
  const n = wins + losses;
  return {
    winRate: n > 0 ? Math.round((wins / n) * 100) : 0,
    n,
    wins,
    losses,
    sample: sampleOf(n),
  };
}

interface TradeRow {
  profit_loss: number | null;
  results: string | null;
}

interface SignalRow {
  result: string;
  override_result: string | null;
  entry_time: string;
}

// ACTION: getPerformanceVsAi
// Read-only, approved-user-gated. Compares the user's journaled performance vs
// the community AI signal performance vs the user's own AI signal executions.
export async function getPerformanceVsAi(): Promise<{
  success: boolean;
  data?: PerformanceVsAiData;
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

    const [tradesRes, aiRes, mineRes] = await Promise.all([
      admin.from('trades').select('profit_loss, results').eq('user_id', user.id),
      admin.from('signals').select('result, override_result, entry_time').eq('source', 'live_otc').not('user_id', 'is', null).neq('user_id', user.id).gte('entry_time', since),
      admin.from('signals').select('result, override_result, entry_time').eq('source', 'live_otc').eq('user_id', user.id).gte('entry_time', since),
    ]);

    let youWins = 0;
    let youLosses = 0;
    (tradesRes.data ?? []).forEach((r: TradeRow) => {
      const res = (r.results || '').toUpperCase();
      const isWin = (r.profit_loss ?? 0) > 0 || res === 'WIN' || res === 'MTG WIN';
      if (isWin) youWins++;
      else youLosses++;
    });
    const you = youWins + youLosses > 0 ? metricOf(youWins, youLosses) : null;

    let aiWins = 0;
    let aiLosses = 0;
    (aiRes.data ?? []).forEach((r: SignalRow) => {
      const eff = r.override_result ?? r.result;
      if (eff === 'WIN') aiWins++;
      else if (eff === 'LOSS') aiLosses++;
    });
    const ai = metricOf(aiWins, aiLosses);

    let mineWins = 0;
    let mineLosses = 0;
    (mineRes.data ?? []).forEach((r: SignalRow) => {
      const eff = r.override_result ?? r.result;
      if (eff === 'WIN') mineWins++;
      else if (eff === 'LOSS') mineLosses++;
    });
    const combined = mineWins + mineLosses > 0 ? metricOf(mineWins, mineLosses) : null;

    let insight: string;
    if (you === null) {
      insight = combined
        ? `Journal your trades to build your personal baseline — your AI executions are already scoring ${combined.winRate}%.`
        : `Another trader's manual OTC scans score ${ai.winRate}% across ${ai.n} signals — journal your trades to start comparing.`;
    } else if (combined === null || combined.n < MEDIUM_SAMPLE) {
      insight = `You're at ${you.winRate}% across ${you.n} journaled trades while other traders' manual scans score ${ai.winRate}% — execute more OTC signals to unlock a reliable 'AI + Your Execution' comparison.`;
    } else {
      const delta = combined.winRate - you.winRate;
      if (you.n >= MEDIUM_SAMPLE && delta >= 3) {
        insight = `Executing AI signals lifts your win rate by ${delta} points — discipline + AI beats journaling alone.`;
      } else if (you.n >= MEDIUM_SAMPLE && delta <= -3) {
        insight = `Your journaled discipline (${you.winRate}%) currently outpaces your AI execution (${combined.winRate}%) — review which signals you take and lean on your checklist.`;
      } else {
        insight = `Other traders' manual scans score ${ai.winRate}% across ${ai.n} signals — your execution (${combined.winRate}%) is tracking in line with the engine.`;
      }
    }

    return {
      success: true,
      data: {
        you,
        ai,
        combined,
        insight,
        methodology: [
          'Your performance: all journaled trades · win = positive P/L or Win/MTG Win result',
          `AI signal performance: manual OTC scans by other approved users, ${LOOKBACK_DAYS}-day window · effective result honors admin overrides`,
          `AI + Your Execution: OTC scans you executed, ${LOOKBACK_DAYS}-day window · same effective result logic`,
        ],
      },
    };
  } catch {
    return { success: false, error: 'Failed to load performance comparison' };
  }
}