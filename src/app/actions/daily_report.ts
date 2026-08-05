'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface DailyHourStat {
  hour: number;
  label: string;
  signals: number;
  wins: number;
  winRate: number;
}

export interface DailySessionStat {
  key: 'MORNING' | 'EVENING';
  label: string;
  range: string;
  signals: number;
  wins: number;
  winRate: number;
}

export interface DailyPairStat {
  pair: string;
  signals: number;
  wins: number;
  winRate: number;
  rank: number;
}

export interface DailyReportData {
  dateLabel: string;
  dateIso: string;
  today: {
    signals: number;
    wins: number;
    winRate: number;
    confidence: 'STRONG' | 'MODERATE' | 'WEAK' | null;
    bestPair: string | null;
    bestPairWinRate: number;
    bestPairSignals: number;
    bestPairSource: 'today' | '90d';
    strongestSession: DailySessionStat | null;
    strongestSessionSource: 'today' | '90d';
  };
  periods: {
    source: 'today' | '90d';
    highRisk: DailyHourStat | null;
    bestWindows: DailyHourStat[];
  };
  pairs: DailyPairStat[];
  historical: {
    sessions: DailySessionStat[];
    hours: DailyHourStat[];
    topPairs: DailyPairStat[];
    signals: number;
    wins: number;
    winRate: number;
  };
}

const LOOKBACK_DAYS = 90;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const BEST_PAIR_TODAY_MIN = 3;
const BEST_PAIR_90D_MIN = 10;
const WINDOW_TODAY_MIN = 2;
const WINDOW_90D_MIN = 10;
const USE_TODAY_MIN_RESOLVED = 6;
const PHR_90D_MIN = 5;
const SESSION_TODAY_MIN = 3;

const MORNING_HOURS = new Set([8, 9, 10, 11]);
const EVENING_HOURS = new Set([18, 19, 20, 21]);

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

function confidenceOf(winRate: number): DailyReportData['today']['confidence'] {
  if (winRate >= 70) return 'STRONG';
  if (winRate >= 50) return 'MODERATE';
  return 'WEAK';
}

function toRankedPairs(map: Record<string, { signals: number; wins: number }>, minSignals: number): DailyPairStat[] {
  return Object.entries(map)
    .filter(([, e]) => e.signals >= minSignals)
    .map(([pair, e]) => ({
      pair,
      signals: e.signals,
      wins: e.wins,
      winRate: winRateOf(e.wins, e.signals),
      rank: 0,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.signals - a.signals)
    .slice(0, 8)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

interface DailyRow {
  pair: string;
  result: string;
  override_result: string | null;
  entry_time: string;
}

// ACTION: getDailyMarketReport
// Read-only, approved-user-gated. Community-wide OTC signal aggregation across
// ALL approved users' manual scans (service-role read, same as the leaderboard).
// Generates the Daily AI Market Report live — no stored artifacts.
export async function getDailyMarketReport(): Promise<{
  success: boolean;
  report?: DailyReportData;
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

    if (error) return { success: false, error: 'Failed to load market report' };

    const nowMs = Date.now();
    const todayStart = istTodayStart(nowMs);
    const istNow = new Date(nowMs + IST_OFFSET_MS);
    const dateIso = `${istNow.getUTCFullYear()}-${(istNow.getUTCMonth() + 1).toString().padStart(2, '0')}-${istNow
      .getUTCDate()
      .toString()
      .padStart(2, '0')}`;
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

    const hourMap: Record<number, { signals: number; wins: number }> = {};
    const hourTodayMap: Record<number, { signals: number; wins: number }> = {};
    const sessionMap: Record<'MORNING' | 'EVENING', { signals: number; wins: number }> = {
      MORNING: { signals: 0, wins: 0 },
      EVENING: { signals: 0, wins: 0 },
    };
    const sessionTodayMap: Record<'MORNING' | 'EVENING', { signals: number; wins: number }> = {
      MORNING: { signals: 0, wins: 0 },
      EVENING: { signals: 0, wins: 0 },
    };
    const pairMap: Record<string, { signals: number; wins: number; todaySignals: number; todayWins: number }> = {};

    const total = { signals: 0, wins: 0, todaySignals: 0, todayWins: 0 };

    (rows ?? []).forEach((r: DailyRow) => {
      const eff = r.override_result ?? r.result;
      if (eff !== 'WIN' && eff !== 'LOSS') return;

      const t = new Date(r.entry_time).getTime();
      const hour = istHourOf(t);
      const isToday = t >= todayStart;
      const isMorning = MORNING_HOURS.has(hour);
      const isEvening = EVENING_HOURS.has(hour);

      total.signals++;
      if (eff === 'WIN') total.wins++;
      if (isToday) total.todaySignals++;
      if (isToday && eff === 'WIN') total.todayWins++;

      if (!hourMap[hour]) hourMap[hour] = { signals: 0, wins: 0 };
      hourMap[hour].signals++;
      if (eff === 'WIN') hourMap[hour].wins++;
      if (isToday) {
        if (!hourTodayMap[hour]) hourTodayMap[hour] = { signals: 0, wins: 0 };
        hourTodayMap[hour].signals++;
        if (eff === 'WIN') hourTodayMap[hour].wins++;
      }

      if (isMorning) {
        sessionMap.MORNING.signals++;
        if (eff === 'WIN') sessionMap.MORNING.wins++;
        if (isToday) {
          sessionTodayMap.MORNING.signals++;
          if (eff === 'WIN') sessionTodayMap.MORNING.wins++;
        }
      } else if (isEvening) {
        sessionMap.EVENING.signals++;
        if (eff === 'WIN') sessionMap.EVENING.wins++;
        if (isToday) {
          sessionTodayMap.EVENING.signals++;
          if (eff === 'WIN') sessionTodayMap.EVENING.wins++;
        }
      }

      if (!pairMap[r.pair]) pairMap[r.pair] = { signals: 0, wins: 0, todaySignals: 0, todayWins: 0 };
      const p = pairMap[r.pair];
      p.signals++;
      if (eff === 'WIN') p.wins++;
      if (isToday) p.todaySignals++;
      if (isToday && eff === 'WIN') p.todayWins++;
    });

    const useToday = total.todaySignals >= USE_TODAY_MIN_RESOLVED;

    const pickBestFallback = (todayMap: Record<number, { signals: number; wins: number }>, todayMin: number) => {
      return Object.entries(todayMap)
        .filter(([, e]) => e.signals >= todayMin)
        .map(([hourStr, e]) => ({
          hour: Number(hourStr),
          label: hourLabel(Number(hourStr)),
          signals: e.signals,
          wins: e.wins,
          winRate: winRateOf(e.wins, e.signals),
        }))
        .sort((a, b) => b.winRate - a.winRate || b.signals - a.signals);
    };

    const windowsSource = useToday
      ? pickBestFallback(hourTodayMap, WINDOW_TODAY_MIN)
      : pickBestFallback(hourMap, WINDOW_90D_MIN);

    const bestWindows = windowsSource.slice(0, 3);
    const riskCandidates = [...windowsSource].reverse();
    let highRisk: DailyHourStat | null = null;
    for (const h of riskCandidates) {
      if (h.winRate < 75) {
        highRisk = h;
        break;
      }
    }

    const sessionBuild = (s: { signals: number; wins: number }, key: 'MORNING' | 'EVENING', label: string, range: string): DailySessionStat | null => {
      return s.signals > 0
        ? { key, label, range, signals: s.signals, wins: s.wins, winRate: winRateOf(s.wins, s.signals) }
        : null;
    };

    const pickSession = (
      todaySk: { signals: number; wins: number },
      histSk: { signals: number; wins: number },
      todayMin: number,
      key: 'MORNING' | 'EVENING',
      label: string,
      range: string,
    ): { stat: DailySessionStat | null; source: 'today' | '90d' } => {
      if (todaySk.signals >= todayMin) return { stat: sessionBuild(todaySk, key, label, range), source: 'today' };
      if (histSk.signals >= WINDOW_90D_MIN) return { stat: sessionBuild(histSk, key, label, range), source: '90d' };
      return { stat: null, source: '90d' };
    };

    const morningSk = pickSession(sessionTodayMap.MORNING, sessionMap.MORNING, SESSION_TODAY_MIN, 'MORNING', 'Morning', '08:00–12:00 IST');
    const eveningSk = pickSession(sessionTodayMap.EVENING, sessionMap.EVENING, SESSION_TODAY_MIN, 'EVENING', 'Evening', '18:00–22:00 IST');
    const candidates = [morningSk, eveningSk].filter((c): c is { stat: DailySessionStat; source: 'today' | '90d' } => Boolean(c.stat));
    let strongestSession: DailySessionStat | null = null;
    let strongestSessionSource: 'today' | '90d' = '90d';
    if (candidates.length > 0) {
      candidates.sort((a, b) => (b.stat!.winRate - a.stat!.winRate) || (b.stat!.signals - a.stat!.signals));
      strongestSession = candidates[0].stat;
      strongestSessionSource = candidates[0].source;
    }

    let bestPair: string | null = null;
    let bestPairWinRate = 0;
    let bestPairSignals = 0;
    let bestPairSource: 'today' | '90d' = '90d';
    const todayBest = Object.entries(pairMap)
      .filter(([, e]) => e.todaySignals >= BEST_PAIR_TODAY_MIN)
      .sort((a, b) => winRateOf(b[1].todayWins, b[1].todaySignals) - winRateOf(a[1].todayWins, a[1].todaySignals) || b[1].todaySignals - a[1].todaySignals);
    if (todayBest.length > 0) {
      bestPair = todayBest[0][0];
      bestPairWinRate = winRateOf(todayBest[0][1].todayWins, todayBest[0][1].todaySignals);
      bestPairSignals = todayBest[0][1].todaySignals;
      bestPairSource = 'today';
    } else {
      const histBest = Object.entries(pairMap)
        .filter(([, e]) => e.signals >= BEST_PAIR_90D_MIN)
        .sort((a, b) => winRateOf(b[1].wins, b[1].signals) - winRateOf(a[1].wins, a[1].signals) || b[1].signals - a[1].signals);
      if (histBest.length > 0) {
        bestPair = histBest[0][0];
        bestPairWinRate = winRateOf(histBest[0][1].wins, histBest[0][1].signals);
        bestPairSignals = histBest[0][1].signals;
      }
    }

    const pairsToday: Record<string, { signals: number; wins: number }> = {};
    Object.entries(pairMap).forEach(([pair, e]) => {
      if (e.todaySignals > 0) pairsToday[pair] = { signals: e.todaySignals, wins: e.todayWins };
    });

    const historicalSessions: DailySessionStat[] = ['MORNING', 'EVENING']
      .map((k) =>
        sessionBuild(sessionMap[k as 'MORNING' | 'EVENING'], k as 'MORNING' | 'EVENING', k === 'MORNING' ? 'Morning' : 'Evening', k === 'MORNING' ? '08:00–12:00 IST' : '18:00–22:00 IST'),
      )
      .filter((s): s is DailySessionStat => Boolean(s));

    const historicalHours = Object.entries(hourMap)
      .map(([hourStr, e]) => ({
        hour: Number(hourStr),
        label: hourLabel(Number(hourStr)),
        signals: e.signals,
        wins: e.wins,
        winRate: winRateOf(e.wins, e.signals),
      }))
      .filter((h) => h.signals >= WINDOW_90D_MIN)
      .sort((a, b) => b.winRate - a.winRate || b.signals - a.signals)
      .slice(0, 8);

    const report: DailyReportData = {
      dateLabel,
      dateIso,
      today: {
        signals: total.todaySignals,
        wins: total.todayWins,
        winRate: winRateOf(total.todayWins, total.todaySignals),
        confidence: total.todaySignals > 0 ? confidenceOf(winRateOf(total.todayWins, total.todaySignals)) : null,
        bestPair,
        bestPairWinRate,
        bestPairSignals,
        bestPairSource,
        strongestSession,
        strongestSessionSource,
      },
      periods: {
        source: useToday ? 'today' : '90d',
        highRisk,
        bestWindows,
      },
      pairs: toRankedPairs(pairsToday, 1),
      historical: {
        sessions: historicalSessions,
        hours: historicalHours,
        topPairs: toRankedPairs(
          Object.fromEntries(Object.entries(pairMap).map(([pair, e]) => [pair, { signals: e.signals, wins: e.wins }])),
          PHR_90D_MIN,
        ),
        signals: total.signals,
        wins: total.wins,
        winRate: winRateOf(total.wins, total.signals),
      },
    };

    return { success: true, report };
  } catch {
    return { success: false, error: 'Failed to load market report' };
  }
}