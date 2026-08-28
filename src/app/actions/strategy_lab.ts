'use server';

import { createClient } from '@/lib/supabase/server';

export interface StrategyLabFilter {
  pair: string;          // 'ALL' or specific pair like 'EUR/USD (OTC)' or 'EUR/USD OTC'
  direction: 'ALL' | 'CALL' | 'PUT';
  expiry: string;        // '1 MIN'
  period: 'last_7_days' | 'last_30_days' | 'last_90_days' | 'all' | 'custom';
  customDateFrom?: string;
  customDateTo?: string;
  session?: string;      // 'ALL' or hour string like '16:00' or minute '16:26'
}

export interface SetupPerformance {
  setup: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

export interface DirectionalEdge {
  callWins: number;
  callLosses: number;
  callTotal: number;
  callWinRate: number;
  putWins: number;
  putLosses: number;
  putTotal: number;
  putWinRate: number;
}

export interface StrategyLabAnalysisResult {
  pairAnalyzed: string;
  signals: number;         // Total signals including pending
  settledSignals: number;  // Resolved count (wins + losses + refunds)
  wins: number;
  losses: number;
  refunds: number;
  pending: number;         // Pending / active scans
  winRate: number;         // e.g. 70.45
  bestSession: string;     // e.g. '5:25 PM' or '05:00 PM'
  bestPair: string;        // e.g. 'EUR/USD (OTC)'
  strongestSetup: string;  // e.g. 'Momentum Continuation'
  worstCondition: string;  // e.g. 'Low Volatility'
  directionalEdge: DirectionalEdge;
  setupBreakdown: SetupPerformance[];
  aiVerdict: string;
  hourlyDistribution: { hour: string; winRate: number; wins: number; losses: number; count: number }[];
}

function normalizePair(pairName: string): string {
  if (!pairName) return '';
  return pairName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .replace(/OTC$/, '');
}

function displayPairName(pairName: string): string {
  if (!pairName || pairName === 'ALL') return 'ALL OTC PAIRS';
  const clean = pairName
    .replace(/\s*\(OTC\)/i, '')
    .replace(/\s+OTC/i, '')
    .trim();
  if (clean.length === 6 && !clean.includes('/')) {
    return `${clean.slice(0, 3)}/${clean.slice(3)} (OTC)`;
  }
  return clean.includes('(OTC)') ? clean : `${clean} (OTC)`;
}

function formatSessionTime(dateObj: Date): string {
  return dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatHourLabel(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${ampm}`;
}

export async function analyzeStrategyLab(filters: StrategyLabFilter): Promise<{
  success: boolean;
  data?: StrategyLabAnalysisResult;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    // Base query on individual user's LIVE OTC signals
    let query = supabase
      .from('signals')
      .select('id, pair, direction, entry_time, expiry_time, result, override_result, confidence, strategy_name, risk_level')
      .eq('user_id', user.id)
      .eq('source', 'live_otc');

    // Direction filter
    if (filters.direction && filters.direction !== 'ALL') {
      query = query.eq('direction', filters.direction);
    }

    // Period filter
    const now = new Date();
    if (filters.period === 'last_7_days') {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      query = query.gte('entry_time', past7.toISOString());
    } else if (filters.period === 'last_30_days') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      query = query.gte('entry_time', past30.toISOString());
    } else if (filters.period === 'last_90_days') {
      const past90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      query = query.gte('entry_time', past90.toISOString());
    } else if (filters.period === 'custom') {
      if (filters.customDateFrom) {
        query = query.gte('entry_time', new Date(filters.customDateFrom).toISOString());
      }
      if (filters.customDateTo) {
        const end = new Date(filters.customDateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte('entry_time', end.toISOString());
      }
    }

    const { data: rows, error: queryError } = await query.order('entry_time', { ascending: false });

    if (queryError) {
      console.error('[StrategyLab] DB Error:', queryError);
      return { success: false, error: 'Failed to retrieve signal history.' };
    }

    const pairDisplay = displayPairName(filters.pair);

    if (!rows || rows.length === 0) {
      return {
        success: true,
        data: {
          pairAnalyzed: pairDisplay,
          signals: 0,
          settledSignals: 0,
          wins: 0,
          losses: 0,
          refunds: 0,
          pending: 0,
          winRate: 0,
          bestSession: 'N/A',
          bestPair: 'N/A',
          strongestSetup: 'Awaiting Scans',
          worstCondition: 'Awaiting Scans',
          directionalEdge: {
            callWins: 0, callLosses: 0, callTotal: 0, callWinRate: 0,
            putWins: 0, putLosses: 0, putTotal: 0, putWinRate: 0,
          },
          setupBreakdown: [],
          aiVerdict: `⚡ Awaiting scan executions on ${pairDisplay} to generate strategic intelligence.`,
          hourlyDistribution: [],
        },
      };
    }

    // Filter by pair in-memory to handle formatting nuances ("EUR/USD OTC" vs "EUR/USD (OTC)")
    const targetPairNorm = filters.pair === 'ALL' ? 'ALL' : normalizePair(filters.pair);
    
    const allMatching = rows.filter((r) => {
      if (targetPairNorm !== 'ALL') {
        const rowPairNorm = normalizePair(r.pair);
        if (rowPairNorm !== targetPairNorm) return false;
      }

      // Session time filter if set
      if (filters.session && filters.session !== 'ALL') {
        const entryDate = new Date(r.entry_time);
        const [filterHour, filterMin] = filters.session.split(':').map(Number);
        if (!isNaN(filterHour)) {
          if (filterMin !== undefined && !isNaN(filterMin)) {
            // Match within 30 min window of selected time
            const entryHour = entryDate.getHours();
            const entryMin = entryDate.getMinutes();
            if (entryHour !== filterHour || Math.abs(entryMin - filterMin) > 15) {
              return false;
            }
          } else {
            if (entryDate.getHours() !== filterHour) return false;
          }
        }
      }

      return true;
    });

    // Count pending vs settled
    let pendingCount = 0;
    let wins = 0;
    let losses = 0;
    let refunds = 0;

    let callWins = 0;
    let callLosses = 0;
    let putWins = 0;
    let putLosses = 0;

    // Trackers for stats
    const pairStats: Record<string, { wins: number; total: number }> = {};
    const hourStats: Record<number, { wins: number; total: number; exactTimes: string[] }> = {};
    const setupStats: Record<string, { wins: number; losses: number; total: number }> = {};
    const conditionStats: Record<string, { losses: number; total: number }> = {};

    allMatching.forEach((row) => {
      const res = (row.override_result || row.result || '').toUpperCase();
      const p = normalizePair(row.pair) || 'OTC ASSET';
      const entryD = new Date(row.entry_time);
      const hour = entryD.getHours();
      const setup = row.strategy_name || 'Momentum Continuation';
      const condition = row.risk_level === 'HIGH' || (row.confidence && row.confidence < 75)
        ? 'Low Volatility'
        : 'Choppy Consolidation';

      if (['PENDING', 'SCANNING', 'WAITING_FOR_ENTRY'].includes(res)) {
        pendingCount++;
        return; // Don't include pending in win rate calculations
      }

      if (res === 'WIN') {
        wins++;
        if (row.direction === 'CALL') callWins++;
        if (row.direction === 'PUT') putWins++;
      } else if (res === 'LOSS') {
        losses++;
        if (row.direction === 'CALL') callLosses++;
        if (row.direction === 'PUT') putLosses++;
      } else if (res === 'REFUND') {
        refunds++;
      } else {
        return; // Skip FAILED or NO TRADE
      }

      // Pair stats
      if (!pairStats[p]) pairStats[p] = { wins: 0, total: 0 };
      pairStats[p].total++;
      if (res === 'WIN') pairStats[p].wins++;

      // Hour stats
      if (!hourStats[hour]) hourStats[hour] = { wins: 0, total: 0, exactTimes: [] };
      hourStats[hour].total++;
      if (res === 'WIN') {
        hourStats[hour].wins++;
        hourStats[hour].exactTimes.push(formatSessionTime(entryD));
      }

      // Setup stats
      if (!setupStats[setup]) setupStats[setup] = { wins: 0, losses: 0, total: 0 };
      setupStats[setup].total++;
      if (res === 'WIN') setupStats[setup].wins++;
      if (res === 'LOSS') setupStats[setup].losses++;

      // Condition stats
      if (!conditionStats[condition]) conditionStats[condition] = { losses: 0, total: 0 };
      conditionStats[condition].total++;
      if (res === 'LOSS') conditionStats[condition].losses++;
    });

    const settledTotal = wins + losses;
    const winRate = settledTotal > 0 ? Number(((wins / settledTotal) * 100).toFixed(2)) : 0;
    const totalSignals = wins + losses + refunds + pendingCount;

    // Directional Edge calculation
    const callTotal = callWins + callLosses;
    const callWinRate = callTotal > 0 ? Number(((callWins / callTotal) * 100).toFixed(1)) : 0;
    const putTotal = putWins + putLosses;
    const putWinRate = putTotal > 0 ? Number(((putWins / putTotal) * 100).toFixed(1)) : 0;

    // Calculate Best Pair
    let bestPair = 'N/A';
    let bestPairRate = -1;
    for (const [pName, stats] of Object.entries(pairStats)) {
      const pRate = stats.total > 0 ? stats.wins / stats.total : 0;
      if (pRate > bestPairRate || (pRate === bestPairRate && stats.total > (pairStats[bestPair]?.total || 0))) {
        bestPairRate = pRate;
        bestPair = pName;
      }
    }

    // Calculate Best Session
    let bestSession = 'N/A';
    let bestHourRate = -1;
    let topHour = -1;
    for (const [hStr, stats] of Object.entries(hourStats)) {
      const h = Number(hStr);
      const hRate = stats.total > 0 ? stats.wins / stats.total : 0;
      if (hRate > bestHourRate || (hRate === bestHourRate && stats.total > (hourStats[topHour]?.total || 0))) {
        bestHourRate = hRate;
        topHour = h;
        if (stats.exactTimes.length > 0) {
          bestSession = stats.exactTimes[0];
        } else {
          bestSession = formatHourLabel(h);
        }
      }
    }

    // Calculate Strongest Setup
    let strongestSetup = 'Momentum Continuation';
    let bestSetupRate = -1;
    for (const [sName, stats] of Object.entries(setupStats)) {
      const sRate = stats.total > 0 ? stats.wins / stats.total : 0;
      if (sRate > bestSetupRate) {
        bestSetupRate = sRate;
        strongestSetup = sName;
      }
    }

    // Calculate Worst Condition
    let worstCondition = 'Low Volatility';
    let highestLossRate = -1;
    for (const [cName, stats] of Object.entries(conditionStats)) {
      const lRate = stats.total > 0 ? stats.losses / stats.total : 0;
      if (lRate > highestLossRate) {
        highestLossRate = lRate;
        worstCondition = cName;
      }
    }

    // Setup Breakdown List
    const setupBreakdown: SetupPerformance[] = Object.entries(setupStats)
      .map(([sName, stats]) => ({
        setup: sName,
        wins: stats.wins,
        losses: stats.losses,
        total: stats.total,
        winRate: stats.total > 0 ? Number(((stats.wins / stats.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.winRate - a.winRate || b.total - a.total);

    // AI Strategy Verdict Generation
    let aiVerdict = '';
    if (totalSignals === 0) {
      aiVerdict = `⚡ Awaiting scan executions on ${pairDisplay} to generate strategic intelligence.`;
    } else if (winRate >= 80) {
      aiVerdict = `🔥 HIGH EDGE CONFIRMED: ${pairDisplay} demonstrates an elite ${winRate}% accuracy with ${strongestSetup}. Best session window is ${bestSession}. Caution: watch for ${worstCondition}.`;
    } else if (winRate >= 60) {
      aiVerdict = `⚖️ SOLID STRATEGY EDGE: ${pairDisplay} maintains a consistent ${winRate}% accuracy. Model "${strongestSetup}" provides the highest probability setup. Peak accuracy near ${bestSession}.`;
    } else if (settledTotal > 0) {
      aiVerdict = `⚠️ ELEVATED CHOP / VOLATILITY: Accuracy is ${winRate}%. Market conditions show high risk during ${worstCondition}. Consider filtering for "${strongestSetup}" or testing alternative pairs like ${bestPair}.`;
    } else {
      aiVerdict = `⏳ SCANS IN PROGRESS: ${pendingCount} active scans currently pending resolution.`;
    }

    // Hourly distribution sorted chronologically by hour
    const hourlyDistribution = Object.entries(hourStats)
      .map(([hStr, stats]) => {
        const h = Number(hStr);
        return {
          hourNum: h,
          hour: formatHourLabel(h),
          winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0,
          wins: stats.wins,
          losses: stats.total - stats.wins,
          count: stats.total,
        };
      })
      .sort((a, b) => a.hourNum - b.hourNum)
      .map(({ hour, winRate, wins, losses, count }) => ({ hour, winRate, wins, losses, count }));

    return {
      success: true,
      data: {
        pairAnalyzed: pairDisplay,
        signals: totalSignals,
        settledSignals: settledTotal,
        wins,
        losses,
        refunds,
        pending: pendingCount,
        winRate,
        bestSession: bestSession !== 'N/A' ? bestSession : '5:25 PM',
        bestPair: bestPair !== 'N/A' ? displayPairName(bestPair) : (filters.pair !== 'ALL' ? displayPairName(filters.pair) : 'EUR/USD (OTC)'),
        strongestSetup: strongestSetup || 'Momentum Continuation',
        worstCondition: worstCondition || 'Low Volatility',
        directionalEdge: {
          callWins,
          callLosses,
          callTotal,
          callWinRate,
          putWins,
          putLosses,
          putTotal,
          putWinRate,
        },
        setupBreakdown,
        aiVerdict,
        hourlyDistribution,
      },
    };
  } catch (err: any) {
    console.error('[analyzeStrategyLab] Exception:', err);
    return { success: false, error: 'Internal error analyzing strategy data.' };
  }
}
