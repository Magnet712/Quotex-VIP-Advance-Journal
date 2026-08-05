'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface ProfileMetric {
  label: string;
  value: string;
  note: string;
  tone: 'good' | 'warn' | 'neutral';
}

export interface TraderProfileData {
  status: 'ready' | 'warming';
  totalTrades: number;
  resolvedTrades: number;
  activeDays: number;
  wins: number;
  losses: number;
  style: ProfileMetric;
  bestPair: ProfileMetric | null;
  bestSession: ProfileMetric | null;
  avgRisk: ProfileMetric | null;
  bestPerformance: ProfileMetric | null;
  weakestArea: ProfileMetric | null;
  recommendation: string[];
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MIN_TRADES_FOR_PROFILE = 5;
const OVERSIZE_PCT = 5;
const OVERTRADE_DAILY = 6;
const REVENGE_WINDOW_MS = 10 * 60 * 1000;

const EMOTIONAL_STATES = new Set([
  'revenge', 'revenge trading', 'fomo', 'greed', 'tilt', 'angry', 'fear', 'fearful', 'panic', 'overconfident',
]);

const MORNING_HOURS = new Set([8, 9, 10, 11]);
const EVENING_HOURS = new Set([18, 19, 20, 21]);

function dayKey(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / 86400000);
}

function istHourOf(ms: number): number {
  const local = ms + IST_OFFSET_MS;
  const day = ((local % 86400000) + 86400000) % 86400000;
  return Math.floor(day / 3600000);
}

function sessionOf(hour: number): 'MORNING' | 'EVENING' | 'OFF' {
  if (MORNING_HOURS.has(hour)) return 'MORNING';
  if (EVENING_HOURS.has(hour)) return 'EVENING';
  return 'OFF';
}

interface TradeRow {
  asset: string;
  strategy: string | null;
  trade_date: string;
  profit_loss: number | null;
  results: string | null;
  percentage: number | null;
  emotional_state: string | null;
}

interface GroupedStat {
  label: string;
  sub: string;
  total: number;
  wins: number;
  winRate: number;
}

function bestOfGroup(map: Record<string, { total: number; wins: number }>, minTrades: number): GroupedStat | null {
  const entries = Object.entries(map).filter(([, e]) => e.total >= minTrades);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1].wins / b[1].total - a[1].wins / a[1].total || b[1].total - a[1].total);
  const [label, e] = entries[0];
  return { label, sub: `${e.total} trades`, total: e.total, wins: e.wins, winRate: Math.round((e.wins / e.total) * 100) };
}

// ACTION: getTraderProfile
// Read-only, approved-user-gated. Builds the user's personal trading profile
// entirely from their own journaled trades. Zero new storage.
export async function getTraderProfile(): Promise<{
  success: boolean;
  profile?: TraderProfileData;
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
      .select('asset, strategy, trade_date, profit_loss, results, percentage, emotional_state')
      .eq('user_id', user.id);

    if (error) return { success: false, error: 'Failed to load trader profile' };

    const trades: { ms: number; isWin: boolean; asset: string; strategy: string; percentage: number | null; emotional: string }[] = [];

    (rows ?? []).forEach((r: TradeRow) => {
      const ms = new Date(r.trade_date).getTime();
      if (Number.isNaN(ms)) return;
      const res = (r.results || '').toUpperCase();
      const isWin = (r.profit_loss ?? 0) > 0 || res === 'WIN' || res === 'MTG WIN';
      trades.push({
        ms,
        isWin,
        asset: (r.asset || 'UNKNOWN').toUpperCase(),
        strategy: (r.strategy || '').trim(),
        percentage: r.percentage !== null && r.percentage !== undefined ? Number(r.percentage) : null,
        emotional: (r.emotional_state || '').toLowerCase(),
      });
    });

    trades.sort((a, b) => a.ms - b.ms);

    const totalTrades = trades.length;
    const wins = trades.filter((t) => t.isWin).length;
    const losses = totalTrades - wins;
    const activeDays = new Set(trades.map((t) => dayKey(t.ms))).size;

    if (totalTrades < MIN_TRADES_FOR_PROFILE) {
      return {
        success: true,
        profile: {
          status: 'warming',
          totalTrades,
          resolvedTrades: totalTrades,
          activeDays,
          wins,
          losses,
          style: {
            label: 'Profile Forming',
            value: `${totalTrades}/${MIN_TRADES_FOR_PROFILE} trades logged`,
            note: 'The AI coach needs more journaled trades to analyze your style.',
            tone: 'neutral',
          },
          bestPair: null,
          bestSession: null,
          avgRisk: null,
          bestPerformance: null,
          weakestArea: null,
          recommendation: [
            'Keep journaling every trade — including the emotional state and risk percentage.',
            'Once you log more trades, this profile reveals your style, best windows and weakest habits.',
          ],
        },
      };
    }

    const pairMap: Record<string, { total: number; wins: number }> = {};
    const sessionMap: Record<string, { total: number; wins: number }> = {};
    const stratCounts: Record<string, number> = {};
    let riskSum = 0;
    let riskCount = 0;
    let oversizeCount = 0;
    let overtradeDays = 0;
    let revengeCount = 0;
    let emotionalCount = 0;
    let lastLossMs: number | null = null;

    const dayCounts: Record<number, number> = {};

    trades.forEach((t) => {
      if (!pairMap[t.asset]) pairMap[t.asset] = { total: 0, wins: 0 };
      pairMap[t.asset].total++;
      if (t.isWin) pairMap[t.asset].wins++;

      const sess = sessionOf(istHourOf(t.ms));
      if (!sessionMap[sess]) sessionMap[sess] = { total: 0, wins: 0 };
      sessionMap[sess].total++;
      if (t.isWin) sessionMap[sess].wins++;

      if (t.strategy) stratCounts[t.strategy] = (stratCounts[t.strategy] ?? 0) + 1;

      if (t.percentage !== null) {
        riskSum += t.percentage;
        riskCount++;
        if (t.percentage > OVERSIZE_PCT) oversizeCount++;
      }

      const dk = dayKey(t.ms);
      dayCounts[dk] = (dayCounts[dk] ?? 0) + 1;

      if (lastLossMs !== null && t.ms - lastLossMs <= REVENGE_WINDOW_MS) revengeCount++;
      if (!t.isWin) lastLossMs = t.ms;

      if (EMOTIONAL_STATES.has(t.emotional)) emotionalCount++;
    });

    overtradeDays = Object.values(dayCounts).filter((c) => c >= OVERTRADE_DAILY).length;

    const topStrategy = Object.entries(stratCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const tradesPerDay = activeDays > 0 ? totalTrades / activeDays : 0;
    const styleLabel =
      tradesPerDay >= 5
        ? 'High-Frequency Momentum'
        : tradesPerDay >= 2
          ? 'Short-Term Momentum'
          : 'Selective Opportunist';
    const styleNote =
      tradesPerDay >= 5
        ? 'Scalper cadence'
        : tradesPerDay >= 2
          ? 'Active day-trader cadence'
          : 'Patient, selective cadence';

    const bestPair = bestOfGroup(pairMap, 3);
    const bestSessionRaw = bestOfGroup(sessionMap, 3);
    const bestSession = bestSessionRaw
      ? {
          ...bestSessionRaw,
          label: bestSessionRaw.label === 'MORNING' ? 'Morning' : bestSessionRaw.label === 'EVENING' ? 'Evening' : 'Off-Hours',
          sub: bestSessionRaw.label === 'MORNING' ? '08:00–12:00 IST window' : bestSessionRaw.label === 'EVENING' ? '18:00–22:00 IST window' : 'Outside peak windows',
        }
      : null;

    const avgRiskPct = riskCount >= 5 ? riskSum / riskCount : null;
    const avgRisk = avgRiskPct !== null
      ? {
          label: avgRiskPct <= 1.5 ? 'Low' : avgRiskPct <= 3 ? 'Medium' : 'High',
          value: `${avgRiskPct.toFixed(1)}% avg`,
          note: riskCount >= 5 ? `Across ${riskCount} logged risk percentages` : 'Not enough risk data yet',
          tone: (avgRiskPct <= 3 ? 'good' : 'warn') as ProfileMetric['tone'],
        }
      : null;

    const overallRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0;
    const bestPerformance: ProfileMetric | null = {
      label: 'Best Performance',
      value: `${overallRate}% win rate`,
      note: `${wins} W · ${losses} L across ${activeDays} active days`,
      tone: overallRate >= 70 ? 'good' : overallRate >= 50 ? 'neutral' : 'warn',
    };

    const offenders: { label: string; count: number; short: string; advice: string }[] = [];
    if (revengeCount > 0) {
      offenders.push({
        label: 'Revenge Trading',
        count: revengeCount,
        short: 're-entry within minutes of a loss',
        advice: 'Impose a 15-minute cooldown after every loss before the next entry.',
      });
    }
    if (overtradeDays > 0) {
      offenders.push({
        label: 'Overtrading',
        count: overtradeDays,
        short: 'days with 6+ trades',
        advice: 'Set a fixed daily trade cap and stop once it is reached.',
      });
    }
    if (oversizeCount > 0) {
      offenders.push({
        label: 'Oversizing',
        count: oversizeCount,
        short: 'trades risking more than 5%',
        advice: 'Keep every trade sized at 2% of your balance or less.',
      });
    }
    if (emotionalCount > 0) {
      offenders.push({
        label: 'Emotional Discipline',
        count: emotionalCount,
        short: 'trades logged under emotional states',
        advice: 'Run the pre-trade checklist before every entry.',
      });
    }
    offenders.sort((a, b) => b.count - a.count);
    const weakest = offenders[0] ?? null;
    const weakestArea: ProfileMetric | null = weakest
      ? {
          label: 'Weakest Area',
          value: weakest.label,
          note: `${weakest.count} instance${weakest.count === 1 ? '' : 's'} · ${weakest.short}`,
          tone: 'warn',
        }
      : {
          label: 'Weakest Area',
          value: 'None Detected',
          note: 'No discipline violations found in your journal — impressive.',
          tone: 'good',
        };

    const recommendation: string[] = [];
    if (bestSession) {
      recommendation.push(
        `Your performance is strongest during the ${bestSession.label} window (${bestSession.winRate}% win rate over ${bestSession.total} trades) — concentrate your highest-conviction trades there.`,
      );
    }
    if (bestPair) {
      recommendation.push(
        `${bestPair.label} is your most reliable pair (${bestPair.winRate}% over ${bestPair.total} trades) — keep it at the center of your watchlist.`,
      );
    }
    if (weakest) {
      recommendation.push(`Your biggest weakness is ${weakest.label}: ${weakest.advice}`);
    }
    if (avgRiskPct !== null) {
      if (avgRiskPct > 3) {
        recommendation.push(`Your average risk of ${avgRiskPct.toFixed(1)}% is aggressive — bring sizing back toward 2% per trade.`);
      } else if (avgRiskPct > 2) {
        recommendation.push(`Your average risk of ${avgRiskPct.toFixed(1)}% is workable, but watch for drift above 3%.`);
      } else {
        recommendation.push(`Your average risk of ${avgRiskPct.toFixed(1)}% is disciplined — keep protecting your capital.`);
      }
    }
    if (overallRate < 50) {
      recommendation.push(`Your overall win rate (${overallRate}%) sits below breakeven — tighten entries and follow your checklist before trading.`);
    } else if (overallRate >= 70) {
      recommendation.push(`Your win rate (${overallRate}%) is strong — protect it by maintaining your current discipline.`);
    }

    return {
      success: true,
      profile: {
        status: 'ready',
        totalTrades,
        resolvedTrades: totalTrades,
        activeDays,
        wins,
        losses,
        style: {
          label: 'Trading Style',
          value: styleLabel,
          note: topStrategy ? `${styleNote} · Top strategy: ${topStrategy}` : styleNote,
          tone: 'neutral',
        },
        bestPair: bestPair
          ? { label: 'Best Pair', value: bestPair.label, note: bestPair.sub, tone: 'good' }
          : null,
        bestSession: bestSession
          ? { label: 'Best Session', value: bestSession.label, note: bestSession.sub, tone: 'good' }
          : null,
        avgRisk,
        bestPerformance,
        weakestArea,
        recommendation,
      },
    };
  } catch {
    return { success: false, error: 'Failed to load trader profile' };
  }
}