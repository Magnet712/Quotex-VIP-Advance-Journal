'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface StreakBadge {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  target: number;
  current: number;
  earned: boolean;
}

export interface StreakSummary {
  currentTradeStreak: number;
  bestTradeStreak: number;
  currentRitualStreak: number;
  bestRitualStreak: number;
  totalTrades: number;
  disciplinedTrades: number;
  activeToday: boolean;
  firstTradeDate: string | null;
  badges: StreakBadge[];
  nextBadge: StreakBadge | null;
  nextProgress: number;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const MAX_RISK_PCT = 2;

function dayKey(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / 86400000);
}

function currentStreak(days: Set<number>, todayKey: number): number {
  let cursor = days.has(todayKey) ? todayKey : todayKey - 1;
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor--;
  }
  return n;
}

function bestStreak(days: Set<number>): number {
  const sorted = [...days].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    if (prev !== null && d === prev + 1) {
      run++;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

interface BadgeSpec {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  target: number;
}

const BADGE_SPECS: BadgeSpec[] = [
  { id: 'first-trade', emoji: '🟢', label: 'First Trade Logged', desc: 'Log your first trade in the Journal', target: 1 },
  { id: 'streak-3', emoji: '🔥', label: '3-Day Streak', desc: 'Log trades 3 days in a row', target: 3 },
  { id: 'streak-7', emoji: '⚡', label: '7-Day Streak', desc: 'Log trades 7 days in a row', target: 7 },
  { id: 'master-30', emoji: '🏆', label: '30-Day Journal Master', desc: 'Any journaling activity 30 days in a row', target: 30 },
  { id: 'trades-100', emoji: '📊', label: '100 Trades Analyzed', desc: 'Log and analyze 100 trades', target: 100 },
  { id: 'risk-steward', emoji: '🛡️', label: 'Risk Steward', desc: `Log 50 trades at ${MAX_RISK_PCT}% risk or less`, target: 50 },
];

interface TradeRow {
  trade_date: string;
  percentage: number | null;
}

interface SignalRow {
  entry_time: string;
}

// ACTION: getStreakSummary
// Read-only, approved-user-gated. Aggregates the CURRENT user's own journaling
// activity (trades + own OTC scans) to compute streaks and badges. Zero new
// storage — everything derived live from existing per-user rows.
export async function getStreakSummary(): Promise<{
  success: boolean;
  streaks?: StreakSummary;
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
    const [tradesRes, signalsRes] = await Promise.all([
      admin.from('trades').select('trade_date, percentage').eq('user_id', user.id),
      admin.from('signals').select('entry_time').eq('source', 'live_otc').eq('user_id', user.id),
    ]);

    const tradeDays = new Set<number>();
    const ritualDays = new Set<number>();
    let totalTrades = 0;
    let disciplinedTrades = 0;
    let firstTradeMs: number | null = null;

    (tradesRes.data ?? []).forEach((r: TradeRow) => {
      const ms = new Date(r.trade_date).getTime();
      if (Number.isNaN(ms)) return;
      tradeDays.add(dayKey(ms));
      ritualDays.add(dayKey(ms));
      totalTrades++;
      if (r.percentage !== null && r.percentage >= 0 && r.percentage <= MAX_RISK_PCT) {
        disciplinedTrades++;
      }
      if (firstTradeMs === null || ms < firstTradeMs) firstTradeMs = ms;
    });

    (signalsRes.data ?? []).forEach((r: SignalRow) => {
      const ms = new Date(r.entry_time).getTime();
      if (Number.isNaN(ms)) return;
      ritualDays.add(dayKey(ms));
    });

    const todayKey = dayKey(Date.now());
    const currentTradeStreak = currentStreak(tradeDays, todayKey);
    const bestTradeStreak = bestStreak(tradeDays);
    const currentRitualStreak = currentStreak(ritualDays, todayKey);
    const bestRitualStreak = bestStreak(ritualDays);

    const badgeCurrent: Record<string, number> = {
      'first-trade': totalTrades,
      'streak-3': bestTradeStreak,
      'streak-7': bestTradeStreak,
      'master-30': bestRitualStreak,
      'trades-100': totalTrades,
      'risk-steward': disciplinedTrades,
    };

    const badges: StreakBadge[] = BADGE_SPECS.map((spec) => {
      const current = badgeCurrent[spec.id] ?? 0;
      return {
        ...spec,
        current,
        earned: current >= spec.target,
      };
    });

    const nextBadge = badges.find((b) => !b.earned) ?? null;
    const nextProgress = nextBadge
      ? Math.min(100, Math.round((nextBadge.current / nextBadge.target) * 100))
      : 100;

    return {
      success: true,
      streaks: {
        currentTradeStreak,
        bestTradeStreak,
        currentRitualStreak,
        bestRitualStreak,
        totalTrades,
        disciplinedTrades,
        activeToday: tradeDays.has(todayKey),
        firstTradeDate: firstTradeMs !== null ? new Date(firstTradeMs).toISOString() : null,
        badges,
        nextBadge,
        nextProgress,
      },
    };
  } catch {
    return { success: false, error: 'Failed to load streak summary' };
  }
}