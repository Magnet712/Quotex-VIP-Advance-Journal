'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface MagnetActivity {
  key: 'QUIET' | 'NORMAL' | 'ELEVATED' | 'HIGH';
  label: string;
  emoji: string;
  note: string;
}

export interface MagnetPair {
  pair: string;
  winRate: number;
  n: number;
  source: 'today' | '90d';
}

export interface MagnetRisk {
  key: 'LOW' | 'MODERATE' | 'HIGH';
  label: string;
  avg: number;
  note: string;
}

export interface MagnetPersonal {
  winRate: number;
  wins: number;
  losses: number;
  n: number;
}

export interface MagnetInsight {
  ready: boolean;
  lines: string[];
  warmth: string;
}

export interface MagnetData {
  dateLabel: string;
  activity: MagnetActivity;
  bestPair: MagnetPair | null;
  aiStrength: { winRate: number; n: number };
  risk: MagnetRisk | null;
  personal: MagnetPersonal | null;
  insight: MagnetInsight;
}

const LOOKBACK_DAYS = 90;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const BEST_PAIR_TODAY_MIN = 3;
const BEST_PAIR_90D_MIN = 10;
const RISK_SAMPLE_MIN = 5;
const INSIGHT_TRADES_MIN = 10;
const INSIGHT_TRADES_WARM = 5;
const BEST_HOUR_MIN = 3;
const HIGH_DAILY = 6;
const ENDURANCE_MIN_DAYS = 3;
const ENDURANCE_GAP = 8;
const CRITICAL_RISK = 3;

function istTodayStart(nowMs: number): number {
  const local = nowMs + IST_OFFSET_MS;
  const dayStart = Math.floor(local / 86400000) * 86400000;
  return dayStart - IST_OFFSET_MS;
}

function istHourOf(ms: number): number {
  const local = ms + IST_OFFSET_MS;
  const day = ((local % 86400000) + 86400000) % 86400000;
  return Math.floor(day / 3600000);
}

function hourLabel(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00 IST`;
}

function winRateOf(wins: number, signals: number): number {
  return signals > 0 ? Math.round((wins / signals) * 100) : 0;
}

interface SignalsRow {
  pair: string;
  result: string;
  override_result: string | null;
  entry_time: string;
}

interface TradesRow {
  trade_date: string;
  profit_loss: number | null;
  results: string | null;
  percentage: number | null;
}

// ACTION: getMagnetIntelligence — Feature 9 (Central)
// Read-only, approved-user-gated. Consolidates the site's "brain" into one
// daily-open snapshot:
//   - Market Activity       (community manual-scan volume today vs 90d avg)
//   - Best Performing Pair  (community manual scans, today then 90d fallback)
//   - AI Signal Strength    (90d community manual-scan win rate)
//   - Trader Risk Status    (user's own journaled risk percentage)
//   - Your Personal Performance (user's own journal win rate)
//   - AI Insight            (user's best IST hour + endurance + risk, sample-gated)
// All metrics are honest aggregations of existing data — zero new storage.
export async function getMagnetIntelligence(): Promise<{
  success: boolean;
  data?: MagnetData;
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
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();

    const [signalsRes, tradesRes] = await Promise.all([
      admin
        .from('signals')
        .select('pair, result, override_result, entry_time')
        .eq('source', 'live_otc')
        .not('user_id', 'is', null)
        .gte('entry_time', since),
      admin
        .from('trades')
        .select('trade_date, profit_loss, results, percentage')
        .eq('user_id', user.id),
    ]);

    if (signalsRes.error) return { success: false, error: 'Failed to load AI intelligence' };
    if (tradesRes.error) return { success: false, error: 'Failed to load AI intelligence' };

    const nowMs = Date.now();
    const todayStart = istTodayStart(nowMs);

    let totalResolved = 0;
    let totalWins = 0;
    let todayResolved = 0;
    const pairMap: Record<string, { signals: number; wins: number; todaySignals: number; todayWins: number }> = {};

    (signalsRes.data ?? []).forEach((r: SignalsRow) => {
      const eff = r.override_result ?? r.result;
      if (eff !== 'WIN' && eff !== 'LOSS') return;

      const t = new Date(r.entry_time).getTime();
      const isToday = t >= todayStart;

      totalResolved++;
      if (eff === 'WIN') totalWins++;
      if (isToday) todayResolved++;

      if (!pairMap[r.pair]) pairMap[r.pair] = { signals: 0, wins: 0, todaySignals: 0, todayWins: 0 };
      const p = pairMap[r.pair];
      p.signals++;
      if (eff === 'WIN') p.wins++;
      if (isToday) {
        p.todaySignals++;
        if (eff === 'WIN') p.todayWins++;
      }
    });

    const dailyAvg = totalResolved / LOOKBACK_DAYS;
    let activity: MagnetActivity;
    if (totalResolved === 0) {
      activity = {
        key: 'NORMAL',
        label: 'Normal',
        emoji: '🟢',
        note: 'Community signal history is still building — check back after the first manual scans resolve.',
      };
    } else {
      const ratio = todayResolved / dailyAvg;
      if (ratio > 2.5) {
        activity = {
          key: 'HIGH',
          label: 'High Activity',
          emoji: '🔴',
          note: `${todayResolved} scans today — ${Math.round(dailyAvg)} daily average. Hot session for signal flow.`,
        };
      } else if (ratio >= 1.5) {
        activity = {
          key: 'ELEVATED',
          label: 'Elevated',
          emoji: '🟡',
          note: `${todayResolved} scans today vs ${Math.round(dailyAvg)} daily average.`,
        };
      } else if (ratio <= 0.3) {
        activity = {
          key: 'QUIET',
          label: 'Quiet',
          emoji: '🟢',
          note: `${todayResolved} scans today vs ${Math.round(dailyAvg)} daily average.`,
        };
      } else {
        activity = {
          key: 'NORMAL',
          label: 'Normal',
          emoji: '🟢',
          note: `${todayResolved} scans today vs ${Math.round(dailyAvg)} daily average.`,
        };
      }
    }

    let bestPair: MagnetPair | null = null;
    const todayBest = Object.entries(pairMap)
      .filter(([, e]) => e.todaySignals >= BEST_PAIR_TODAY_MIN)
      .sort(
        (a, b) =>
          winRateOf(b[1].todayWins, b[1].todaySignals) - winRateOf(a[1].todayWins, a[1].todaySignals) ||
          b[1].todaySignals - a[1].todaySignals,
      );
    if (todayBest.length > 0) {
      bestPair = {
        pair: todayBest[0][0],
        winRate: winRateOf(todayBest[0][1].todayWins, todayBest[0][1].todaySignals),
        n: todayBest[0][1].todaySignals,
        source: 'today',
      };
    } else {
      const histBest = Object.entries(pairMap)
        .filter(([, e]) => e.signals >= BEST_PAIR_90D_MIN)
        .sort(
          (a, b) =>
            winRateOf(b[1].wins, b[1].signals) - winRateOf(a[1].wins, a[1].signals) ||
            b[1].signals - a[1].signals,
        );
      if (histBest.length > 0) {
        bestPair = {
          pair: histBest[0][0],
          winRate: winRateOf(histBest[0][1].wins, histBest[0][1].signals),
          n: histBest[0][1].signals,
          source: '90d',
        };
      }
    }

    const trades: { ms: number; isWin: boolean; percentage: number | null }[] = [];
    (tradesRes.data ?? []).forEach((r: TradesRow) => {
      const ms = new Date(r.trade_date).getTime();
      if (Number.isNaN(ms)) return;
      const res = (r.results || '').toUpperCase();
      const isWin = (r.profit_loss ?? 0) > 0 || res === 'WIN' || res === 'MTG WIN';
      trades.push({
        ms,
        isWin,
        percentage: r.percentage !== null && r.percentage !== undefined ? Number(r.percentage) : null,
      });
    });

    const wins = trades.filter((t) => t.isWin).length;
    const losses = trades.length - wins;
    const personal: MagnetPersonal | null =
      trades.length > 0
        ? { winRate: Math.round((wins / trades.length) * 100), wins, losses, n: trades.length }
        : null;

    let risk: MagnetRisk | null = null;
    const riskPcts = trades.map((t) => t.percentage).filter((p): p is number => p !== null);
    if (riskPcts.length >= RISK_SAMPLE_MIN) {
      const avg = riskPcts.reduce((a, b) => a + b, 0) / riskPcts.length;
      const key = avg <= 1.5 ? 'LOW' : avg <= CRITICAL_RISK ? 'MODERATE' : 'HIGH';
      risk = {
        key,
        label: key === 'LOW' ? 'Low' : key === 'MODERATE' ? 'Moderate' : 'Aggressive',
        avg,
        note: `Avg ${avg.toFixed(1)}% risk per trade · ${riskPcts.length} logged`,
      };
    }

    const insight: MagnetInsight = { ready: false, lines: [], warmth: '' };
    if (trades.length < INSIGHT_TRADES_MIN) {
      if (trades.length >= INSIGHT_TRADES_WARM) {
        insight.warmth = `Almost there — log ${INSIGHT_TRADES_MIN - trades.length} more trades to unlock your personal AI insight.`;
      } else {
        insight.warmth = `Keep journaling — your personal AI insight unlocks after ${INSIGHT_TRADES_MIN} thoroughly logged trades.`;
      }
    } else {
      insight.ready = true;
      const hourMap: Record<number, { total: number; wins: number }> = {};
      const dayMap: Record<number, { total: number; wins: number }> = {};
      trades.forEach((t) => {
        const h = istHourOf(t.ms);
        if (!hourMap[h]) hourMap[h] = { total: 0, wins: 0 };
        hourMap[h].total++;
        if (t.isWin) hourMap[h].wins++;

        const dk = Math.floor((t.ms + IST_OFFSET_MS) / 86400000);
        if (!dayMap[dk]) dayMap[dk] = { total: 0, wins: 0 };
        dayMap[dk].total++;
        if (t.isWin) dayMap[dk].wins++;
      });

      const bestHour = Object.entries(hourMap)
        .filter(([, e]) => e.total >= BEST_HOUR_MIN)
        .sort((a, b) => winRateOf(b[1].wins, b[1].total) - winRateOf(a[1].wins, a[1].total) || b[1].total - a[1].total)[0];
      if (bestHour) {
        insight.lines.push(
          `You perform best around ${hourLabel(Number(bestHour[0]))} (${winRateOf(bestHour[1].wins, bestHour[1].total)}% win rate over ${bestHour[1].total} trades).`,
        );
      }

      const highDays = Object.entries(dayMap).filter(([, e]) => e.total >= HIGH_DAILY);
      const lowDays = Object.entries(dayMap).filter(([, e]) => e.total < HIGH_DAILY);
      if (highDays.length >= ENDURANCE_MIN_DAYS && lowDays.length >= ENDURANCE_MIN_DAYS) {
        const highWins = highDays.reduce((a, [, e]) => a + e.wins, 0);
        const highTotal = highDays.reduce((a, [, e]) => a + e.total, 0);
        const lowWins = lowDays.reduce((a, [, e]) => a + e.wins, 0);
        const lowTotal = lowDays.reduce((a, [, e]) => a + e.total, 0);
        const highW = winRateOf(highWins, highTotal);
        if (highW <= winRateOf(lowWins, lowTotal) - ENDURANCE_GAP) {
          insight.lines.push(`Your win rate drops to ${highW}% on days you trade ${HIGH_DAILY}+ — quality over quantity.`);
        } else {
          insight.lines.push(`Your performance holds steady even on high-volume days (${highW}% on ${HIGH_DAILY}+ trade days).`);
        }
      }

      if (risk && risk.avg > CRITICAL_RISK) {
        insight.lines.push('Your average risk is aggressive — sizing down toward 2% per trade could stabilize your P/L.');
      }

      if (insight.lines.length === 0) {
        insight.lines.push('Your journal shows balanced, steady trading — keep executing your plan.');
      }
    }

    let dateLabel = 'Today';
    try {
      dateLabel = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(nowMs));
    } catch {
      // fallback label above
    }

    return {
      success: true,
      data: {
        dateLabel,
        activity,
        bestPair,
        aiStrength: { winRate: winRateOf(totalWins, totalResolved), n: totalResolved },
        risk,
        personal,
        insight,
      },
    };
  } catch {
    return { success: false, error: 'Failed to load AI intelligence' };
  }
}