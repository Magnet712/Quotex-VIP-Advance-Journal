'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface RiskGrade {
  grade: 'A+' | 'A' | 'B' | 'C';
  avgPct: number;
}

export interface PeriodSummary {
  period: 'weekly' | 'monthly';
  windowLabel: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  bestPair: string | null;
  bestPairWinRate: number;
  bestPairN: number;
  bestSession: string | null;
  bestSessionWinRate: number;
  bestSessionN: number;
  avgConfidence: number | null;
  riskGrade: RiskGrade | null;
  completion: number;
  netPL: number;
  bestDay: { label: string; trades: number; winRate: number } | null;
  badges: string[];
  activeDays: number;
}

export interface AchievementsData {
  name: string;
  weekly: PeriodSummary | null;
  monthly: PeriodSummary | null;
  lifetime: {
    trades: number;
    wins: number;
    winRate: number;
    avgRisk: number | null;
    completion: number;
    bestStreak: number;
    activeDays: number;
    badges: string[];
  };
  siteUrl: string;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86400000;
const RISK_A_PLUS = 1.5;
const RISK_A = 3;
const RISK_B = 5;
const BEST_PAIR_MIN = 3;
const BEST_SESSION_MIN = 3;
const COMPLETION_MIN = 80;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://quotex-intelligence-journal.vercel.app';

const MORNING_HOURS = new Set([8, 9, 10, 11]);
const EVENING_HOURS = new Set([18, 19, 20, 21]);

function istDayKey(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
}

function istHourOf(ms: number): number {
  const local = ms + IST_OFFSET_MS;
  const day = ((local % DAY_MS) + DAY_MS) % DAY_MS;
  return Math.floor(day / 3600000);
}

function istDayStart(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

function windowStartFor(dk: number): number {
  return dk * DAY_MS - IST_OFFSET_MS;
}

function dateLabel(ms: number): string {
  const d = new Date(ms + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}`;
}

function winRateOf(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 100) : 0;
}

function gradeOf(avgPct: number): RiskGrade {
  if (avgPct <= RISK_A_PLUS) return { grade: 'A+', avgPct };
  if (avgPct <= RISK_A) return { grade: 'A', avgPct };
  if (avgPct <= RISK_B) return { grade: 'B', avgPct };
  return { grade: 'C', avgPct };
}

function maxStreak(dayKeys: number[]): number {
  if (dayKeys.length === 0) return 0;
  const sorted = [...new Set(dayKeys)].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

interface TradeRow {
  trade_date: string;
  profit_loss: number | null;
  results: string | null;
  percentage: number | null;
  emotional_state: string | null;
  asset: string;
}

interface SignalConfRow {
  confidence: number | null;
  entry_time: string;
}

interface NormalizedTrade {
  ms: number;
  dayKey: number;
  hour: number;
  isWin: boolean;
  pl: number;
  percentage: number | null;
  emotional: string;
  asset: string;
}

function summarizePeriod(
  trades: NormalizedTrade[],
  confidences: { ms: number; confidence: number }[],
  startMs: number,
  endMs: number,
  period: 'weekly' | 'monthly',
): PeriodSummary | null {
  const inWindow = trades.filter((t) => t.ms >= startMs && t.ms <= endMs);
  if (inWindow.length === 0) return null;

  const wins = inWindow.filter((t) => t.isWin).length;
  const losses = inWindow.length - wins;
  const winRate = winRateOf(wins, inWindow.length);

  const pairMap: Record<string, { total: number; wins: number }> = {};
  const sessionMap: Record<string, { total: number; wins: number }> = {};
  const dayMap: Record<number, { total: number; wins: number }> = {};
  let riskSum = 0;
  let riskCount = 0;
  let completeCount = 0;
  let plSum = 0;

  inWindow.forEach((t) => {
    if (!pairMap[t.asset]) pairMap[t.asset] = { total: 0, wins: 0 };
    pairMap[t.asset].total++;
    if (t.isWin) pairMap[t.asset].wins++;

    const sess = MORNING_HOURS.has(t.hour) ? 'Morning' : EVENING_HOURS.has(t.hour) ? 'Evening' : 'Off-Hours';
    if (!sessionMap[sess]) sessionMap[sess] = { total: 0, wins: 0 };
    sessionMap[sess].total++;
    if (t.isWin) sessionMap[sess].wins++;

    if (!dayMap[t.dayKey]) dayMap[t.dayKey] = { total: 0, wins: 0 };
    dayMap[t.dayKey].total++;
    if (t.isWin) dayMap[t.dayKey].wins++;

    if (t.percentage !== null) {
      riskSum += t.percentage;
      riskCount++;
    }
    if (t.percentage !== null && t.emotional) completeCount++;
    plSum += t.pl;
  });

  const bestPairEntry = Object.entries(pairMap)
    .filter(([, e]) => e.total >= BEST_PAIR_MIN)
    .sort((a, b) => winRateOf(b[1].wins, b[1].total) - winRateOf(a[1].wins, a[1].total) || b[1].total - a[1].total)[0];
  const bestPair = bestPairEntry ? bestPairEntry[0] : null;
  const bestPairWinRate = bestPairEntry ? winRateOf(bestPairEntry[1].wins, bestPairEntry[1].total) : 0;
  const bestPairN = bestPairEntry ? bestPairEntry[1].total : 0;

  const bestSessionEntry = Object.entries(sessionMap)
    .filter(([, e]) => e.total >= BEST_SESSION_MIN)
    .sort((a, b) => winRateOf(b[1].wins, b[1].total) - winRateOf(a[1].wins, a[1].total) || b[1].total - a[1].total)[0];
  const bestSession = bestSessionEntry ? bestSessionEntry[0] : null;
  const bestSessionWinRate = bestSessionEntry ? winRateOf(bestSessionEntry[1].wins, bestSessionEntry[1].total) : 0;
  const bestSessionN = bestSessionEntry ? bestSessionEntry[1].total : 0;

  const confidenceWindow = confidences.filter((c) => c.ms >= startMs && c.ms <= endMs);
  const avgConfidence =
    confidenceWindow.length > 0
      ? Math.round(confidenceWindow.reduce((a, c) => a + c.confidence, 0) / confidenceWindow.length)
      : null;

  const riskGrade = riskCount >= 5 ? gradeOf(riskSum / riskCount) : null;
  const completion = Math.round((completeCount / inWindow.length) * 100);

  const bestDayEntry = Object.entries(dayMap)
    .filter(([, e]) => e.total >= 3)
    .sort((a, b) => winRateOf(b[1].wins, b[1].total) - winRateOf(a[1].wins, a[1].total) || b[1].total - a[1].total)[0];
  const bestDay = bestDayEntry
    ? {
        label: dateLabel(windowStartFor(Number(bestDayEntry[0]))),
        trades: bestDayEntry[1].total,
        winRate: winRateOf(bestDayEntry[1].wins, bestDayEntry[1].total),
      }
    : null;

  const activeDays = new Set(inWindow.map((t) => t.dayKey)).size;

  const badges: string[] = [];
  if (activeDays >= 5) badges.push('consistency');
  if (winRate >= 80 && inWindow.length >= 10) badges.push('win80');
  if (bestPair && bestPairN >= 10 && bestPairWinRate >= 70) badges.push('pair_specialist');
  if (winRate >= 75 && inWindow.length >= 15) badges.push(period === 'weekly' ? 'weekly_champion' : 'monthly_champion');

  return {
    period,
    windowLabel: `${dateLabel(startMs)} – ${dateLabel(endMs)}`,
    trades: inWindow.length,
    wins,
    losses,
    winRate,
    bestPair,
    bestPairWinRate,
    bestPairN,
    bestSession,
    bestSessionWinRate,
    bestSessionN,
    avgConfidence,
    riskGrade,
    completion,
    netPL: Math.round(plSum * 100) / 100,
    bestDay,
    badges,
    activeDays,
  };
}

// ACTION: getAchievements — Feature 10
// Read-only, approved-user-gated. Summarizes the user's OWN journaled trades +
// own manual-scan confidence into weekly/monthly performance cards and badges.
// Pure aggregation of existing data — zero new storage, zero trading logic.
export async function getAchievements(): Promise<{
  success: boolean;
  data?: AchievementsData;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: profile } = await supabase
      .from('users')
      .select('status, username')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.status !== 'approved') {
      return { success: false, error: 'Access denied' };
    }

    const admin = createAdminClient();
    const [tradesRes, confRes] = await Promise.all([
      admin
        .from('trades')
        .select('asset, trade_date, profit_loss, results, percentage, emotional_state')
        .eq('user_id', user.id),
      admin
        .from('signals')
        .select('confidence, entry_time')
        .eq('user_id', user.id)
        .eq('source', 'live_otc'),
    ]);

    if (tradesRes.error) return { success: false, error: 'Failed to load achievements' };
    if (confRes.error) return { success: false, error: 'Failed to load achievements' };

    const trades: NormalizedTrade[] = [];
    (tradesRes.data ?? []).forEach((r: TradeRow) => {
      const ms = new Date(r.trade_date).getTime();
      if (Number.isNaN(ms)) return;
      const res = (r.results || '').toUpperCase();
      const isWin = (r.profit_loss ?? 0) > 0 || res === 'WIN' || res === 'MTG WIN';
      trades.push({
        ms,
        dayKey: istDayKey(ms),
        hour: istHourOf(ms),
        isWin,
        pl: Number(r.profit_loss ?? 0),
        percentage: r.percentage !== null && r.percentage !== undefined ? Number(r.percentage) : null,
        emotional: (r.emotional_state || '').trim(),
        asset: (r.asset || 'UNKNOWN').toUpperCase(),
      });
    });

    const confidences: { ms: number; confidence: number }[] = [];
    (confRes.data ?? []).forEach((r: SignalConfRow) => {
      const ms = new Date(r.entry_time).getTime();
      if (Number.isNaN(ms) || r.confidence === null || r.confidence === undefined) return;
      confidences.push({ ms, confidence: Number(r.confidence) });
    });

    const now = Date.now();
    const todayDk = istDayKey(now);
    const weekdaySun = (todayDk % 7 + 4) % 7;
    const daysSinceMonday = (weekdaySun - 1 + 7) % 7;
    const mondayStart = windowStartFor(todayDk - daysSinceMonday);

    const monthStart = istDayStart(now);
    const monthStartMs = monthStart - (new Date(monthStart + IST_OFFSET_MS).getUTCDate() - 1) * DAY_MS;

    const weekly = summarizePeriod(trades, confidences, mondayStart, now, 'weekly');
    const monthly = summarizePeriod(trades, confidences, monthStartMs, now, 'monthly');

    const wins = trades.filter((t) => t.isWin).length;
    const riskPcts = trades.map((t) => t.percentage).filter((p): p is number => p !== null);
    const avgRisk = riskPcts.length > 0 ? riskPcts.reduce((a, b) => a + b, 0) / riskPcts.length : null;
    const completeCount = trades.filter((t) => t.percentage !== null && t.emotional).length;
    const completion = trades.length > 0 ? Math.round((completeCount / trades.length) * 100) : 0;
    const bestStreak = maxStreak(trades.map((t) => t.dayKey));

    const lifetimeBadges: string[] = [];
    if (bestStreak >= 7) lifetimeBadges.push('streak7');
    if (trades.length >= 500) lifetimeBadges.push('trades500');
    else if (trades.length >= 100) lifetimeBadges.push('trades100');
    if (completion >= COMPLETION_MIN) lifetimeBadges.push('journal_master');
    if (avgRisk !== null && avgRisk <= RISK_A_PLUS) lifetimeBadges.push('risk_master');

    return {
      success: true,
      data: {
        name: profile.username || 'Trader',
        weekly,
        monthly,
        lifetime: {
          trades: trades.length,
          wins,
          winRate: winRateOf(wins, trades.length),
          avgRisk,
          completion,
          bestStreak,
          activeDays: new Set(trades.map((t) => t.dayKey)).size,
          badges: lifetimeBadges,
        },
        siteUrl: SITE_URL,
      },
    };
  } catch {
    return { success: false, error: 'Failed to load achievements' };
  }
}