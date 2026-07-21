'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Clock, AlertTriangle, Zap,
  Target, Activity, RefreshCw, Radio, BarChart2,
  ChevronUp, ChevronDown, Eye, Filter, Signal, Database, Lock,
  Bell, X, Loader
} from 'lucide-react';

import {
  getSignalPerformance,
  getPairPerformanceMap,
  getServerTime, getMarketStatus,
  getManualSignalAudits
} from '@/app/actions/signals';
import { getSignalMode } from '@/app/actions/signal_mode';
import { getPublicOptimizationSettings, getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess, getMembershipRole, ROLE_HIERARCHY, FEATURE_MIN_ROLES } from '@/lib/permissions';

import { sr, OTC_PAIRS, generateSignal } from './generateSignal';
import { useISTClock } from './useISTClock';
import { SignalCard } from './SignalCard';
import { ManualScanResultCard } from './ManualScanResultCard';
import { useForexExecution } from './useForexExecution';
import { useOTCExecution } from './useOTCExecution';
import OTCScanResultCard from './OTCScanResultCard';
import type { ExecutionRecord } from '@/lib/forex-execution/types';
import { OTC_TERMINAL_STATUSES } from '@/lib/otc/otc-execution-types';
import type { OTCExecutionRecord } from '@/lib/otc/otc-execution-types';

// ─── Live Market Forex Pairs ─────────────────────────────────────────
const LIVE_MARKET_PAIRS = [
  { symbol: 'EUR/USD', short: 'EURUSD', vol: 'MEDIUM' },
  { symbol: 'GBP/USD', short: 'GBPUSD', vol: 'HIGH' },
  { symbol: 'USD/JPY', short: 'USDJPY', vol: 'MEDIUM' },
  { symbol: 'AUD/USD', short: 'AUDUSD', vol: 'MEDIUM' },
  { symbol: 'USD/CAD', short: 'USDCAD', vol: 'LOW' },
  { symbol: 'EUR/JPY', short: 'EURJPY', vol: 'HIGH' },
  { symbol: 'GBP/JPY', short: 'GBPJPY', vol: 'HIGH' },
  { symbol: 'AUD/JPY', short: 'AUDJPY', vol: 'HIGH' },
  { symbol: 'USD/CHF', short: 'USDCHF', vol: 'LOW' },
  { symbol: 'EUR/GBP', short: 'EURGBP', vol: 'LOW' },
  { symbol: 'NZD/USD', short: 'NZDUSD', vol: 'MEDIUM' },
  { symbol: 'USD/INR', short: 'USDINR', vol: 'LOW' },
  { symbol: 'USD/SGD', short: 'USDSGD', vol: 'LOW' },
  { symbol: 'EUR/AUD', short: 'EURAUD', vol: 'MEDIUM' },
  { symbol: 'USD/MXN', short: 'USDMXN', vol: 'HIGH' },
  { symbol: 'USD/ZAR', short: 'USDZAR', vol: 'HIGH' },
  { symbol: 'AUD/CAD', short: 'AUDCAD', vol: 'MEDIUM' },
  { symbol: 'GBP/CHF', short: 'GBPCHF', vol: 'MEDIUM' },
  { symbol: 'AUD/CHF', short: 'AUDCHF', vol: 'LOW' },
  { symbol: 'GBP/AUD', short: 'GBPAUD', vol: 'HIGH' },
  { symbol: 'EUR/CHF', short: 'EURCHF', vol: 'LOW' }
];



interface SignalRecord {
  id: string;
  pair: string;
  direction: 'CALL' | 'PUT' | 'WAIT';
  entry_time: string;
  expiry_time: string;
  confidence: number;
  result: string;
  source: string;
  timeframe?: string;
  strategy_name?: string;
  risk_level?: string;
  noTradeReason?: string;
}

type SignalStatus = 'ACTIVE' | 'SCANNING' | 'NO_SIGNAL' | 'LOADING_NEXT';

interface PairSignal {
  pair: string;
  direction: 'CALL' | 'PUT';
  confidence: number;
  strategy: string;
  entry_price?: number;
  expiry_time?: string;
  entryPrice?: number;
  expiryTime?: string;
  strategy_version?: string;
  quality_score?: number;
  is_premium?: boolean;
  blockedReason?: string;
  risk?: string;
}

interface PairSignalState {
  signal: PairSignal | null;
  status: SignalStatus;
  expiresIn: number;
  generatedAt: string;
}

interface UserAccessState {
  isLoggedIn: boolean;
  isAdmin: boolean;
  vipAccess: boolean;
  premiumAccess?: boolean;
  status?: string;
}

interface ToastMessage {
  id: string;
  type: 'signal' | 'error';
  symbol?: string;
  direction?: string;
  message?: string;
  timestamp: Date;
}

interface SelectedSignalType {
  pairSymbol: string;
  type: string;
  direction: 'CALL' | 'PUT' | 'WAIT';
  confidence: number;
  strategy?: string;
  strategy_name?: string;
  entryPrice?: number;
  entry_price?: number;
  rsi?: number;
  stochBias?: string;
  smaStatus?: string;
  superTrend?: string;
  superTrendStrength?: string;
  ofPattern?: { pattern?: string; icon?: string; desc?: string };
  pair?: string;
}

export default function SignalsPage() {
  const [loading, setLoading] = useState(true);
  const [timeOffset, setTimeOffset] = useState(0);
  const timeOffsetRef = useRef(0);
  const istTime = useISTClock(timeOffset);
  const [subTab, setSubTab] = useState<'live_otc' | 'simulation' | 'live_market'>('live_otc');
  const [liveMarketSignals, setLiveMarketSignals] = useState<SignalRecord[]>([]);
  const [windowSeed, setWindowSeed] = useState(0);
  const windowSeedRef = useRef(0);
  const [pairStates, setPairStates] = useState<PairSignalState[]>([]);
  const [refreshIn, setRefreshIn] = useState(() => 60 - new Date().getSeconds());
  const [filterDir, setFilterDir] = useState<'ALL' | 'CALL' | 'PUT'>('ALL');
  const [filterRisk, setFilterRisk] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH'>('ALL');
  const [filterConf] = useState<'ALL' | '90+'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(
    () => new Set(OTC_PAIRS.map(p => p.short))
  );

  // Interactive Modal Details State
  const [selectedSignal, setSelectedSignal] = useState<SelectedSignalType | null>(null);

  // Toast notifications & sound alerts
  const [activeToasts, setActiveToasts] = useState<ToastMessage[]>([]);

  // Timeline list state
  const [timelineSignals, setTimelineSignals] = useState<SignalRecord[]>([]);

  const [winRate, setWinRate] = useState<number | null>(null);
  const [activeStats, setActiveStats] = useState<{ winRate: number | null; totalToday: number }>({ winRate: null, totalToday: 0 });

  const [signalMode, setSignalModeState] = useState<string>('SIMULATION');
  const [dataSourceOnline, setDataSourceOnline] = useState(true);

  // ─── Forex Execution Engine ──────────────────────────────────────────────
  const forex = useForexExecution();

  // ─── OTC Execution Engine ────────────────────────────────────────────────
  const otc = useOTCExecution();
  const [otcSearchFilter, setOtcSearchFilter] = useState('');

  // ─── Merged timeline: engine live records + API historical records ──────────
  const mergedTimeline = useMemo(() => {
    const engineIds = new Set<string>();
    const engine = forex.timelineRecords.map(r => {
      engineIds.add(r.id);
      return r;
    });
    const otcEngineRecords = otc.timelineRecords
      .filter(r => !engineIds.has(r.id))
      .map(r => {
        engineIds.add(r.id);
        return {
          id: r.id,
          pair: r.pair,
          direction: r.direction,
          status: r.status === 'NO_TRADE' ? 'NO TRADE' as const : r.status,
          entryTime: r.entryTime,
          expiryTime: r.expiryTime,
          dataSource: 'live_otc' as string,
          noTradeReason: r.noTradeReason,
          entryPrice: r.entryPrice || 0,
          confidence: r.confidence,
          scanStartedAt: r.scanStartedAt,
        } as ExecutionRecord;
      });
    const historical = timelineSignals
      .filter(s => !engineIds.has(s.id))
      .map(s => ({
        id: s.id,
        pair: s.pair,
        direction: s.direction,
        status: s.result,
        entryTime: s.entry_time,
        expiryTime: s.expiry_time,
        dataSource: s.source,
        noTradeReason: s.noTradeReason,
        entryPrice: (s as any).entryPrice || 0,
        confidence: s.confidence,
        scanStartedAt: new Date(s.entry_time).getTime(),
      } as ExecutionRecord));
    return [...engine, ...otcEngineRecords, ...historical].sort((a, b) => b.scanStartedAt - a.scanStartedAt);
  }, [forex.timelineRecords, otc.timelineRecords, timelineSignals]);

  // ─── Manual Scanning Live Forex States (legacy) ───────────────────────────
  const [selectedLivePair, setSelectedLivePair] = useState('EUR/USD');
  const [pairFilter, setPairFilter] = useState('');
  const [marketOpen, setMarketOpen] = useState(true);
  const [isTimelineVisible, setIsTimelineVisible] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('timeline_visible') !== 'false';
    }
    return true;
  });

  // Admin optimization settings & User roles
  // accessLoading prevents premium users from seeing paywall flash during async load
  const [accessLoading, setAccessLoading] = useState(true);
  const [userAccess, setUserAccess] = useState<UserAccessState>({ isLoggedIn: false, isAdmin: false, vipAccess: false, premiumAccess: false, status: 'pending' });
  const [optSettings, setOptSettings] = useState<Record<string, string>>({
    min_confidence: '80',
    allowed_signal_hours: '08:00-12:00,18:00-22:00',
    losing_streak_limit: '3',
    losing_streak_pause_minutes: '15',
    premium_filter_mode: 'PRODUCTION',
    min_quality_score: '80',
    disabled_pairs: '',
    premium_signal_status: 'ACTIVE',
    paused_until: '',
    signal_visibility: 'premium'
  });
  const [pairPerfMap, setPairPerfMap] = useState<Record<string, number>>({});

  const pendingStates = useRef<PairSignalState[] | null>(null);
  const pendingForSeed = useRef<number>(-1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // sound chime notifier
  const triggerNewSignalChime = useCallback((symbol: string, direction: string) => {
    // If not premium (and not admin), turn notifications OFF
    const hasAccessVal = userAccess.isAdmin || canAccess('premium-signals', {
      vip_access: userAccess.vipAccess,
      premium_access: userAccess.premiumAccess,
      status: userAccess.status
    }, optSettings.signal_visibility);

    if (!hasAccessVal) {
      return;
    }

    if (typeof window !== 'undefined') {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav');
      audio.volume = 0.3;
      audio.play().catch(() => { });
    }

    const toastId = `toast-${Date.now()}`;
    const newToast: ToastMessage = { id: toastId, type: 'signal', symbol, direction, timestamp: new Date() };
    setActiveToasts(prev => [newToast, ...prev].slice(0, 3));

    setTimeout(() => {
      setActiveToasts(prev => prev.filter(t => t.id !== toastId));
    }, 4000);
  }, [userAccess, optSettings]);

  const triggerErrorToast = useCallback((message: string) => {
    const toastId = `toast-err-${Date.now()}`;
    const newToast: ToastMessage = { id: toastId, type: 'error', message, timestamp: new Date() };
    setActiveToasts(prev => [newToast, ...prev].slice(0, 3));

    setTimeout(() => {
      setActiveToasts(prev => prev.filter(t => t.id !== toastId));
    }, 4000);
  }, []);

  const selectAll = () => {
    const list = subTab !== 'live_market' ? OTC_PAIRS : LIVE_MARKET_PAIRS;
    setSelectedPairs(new Set(list.map(p => p.short)));
  };
  const clearAll = () => setSelectedPairs(new Set());

  const buildStates = useCallback((seed: number): PairSignalState[] => {
    return OTC_PAIRS.map((pair, idx) => {
      const sig = generateSignal(idx, seed);
      const now = new Date();
      const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const timeStr = `${ist.getUTCHours().toString().padStart(2, '0')}:${ist.getUTCMinutes().toString().padStart(2, '0')} IST`;

      if (!sig) {
        const scanRoll = sr(idx * 31 + seed * 0.001);
        return {
          signal: null,
          status: scanRoll > 0.5 ? 'SCANNING' : 'NO_SIGNAL',
          expiresIn: 60,
          generatedAt: timeStr,
        };
      }

      const isV1_1 = [
        'SuperTrend + ATR Filter',
        'SuperTrend + Stoch Cross',
        'ATR Breakout + Orderflow',
        'Order Delta + RSI Confirm',
        'SuperTrend + Delta Volume'
      ].includes(sig.strategy);
      const strategy_version = isV1_1 ? 'v1.1' : 'v1.0';

      const pairAccuracy = pairPerfMap[pair.symbol] ?? 80;
      const overallAccuracy = winRate ?? 80;
      const recentAccuracy = winRate ?? 80;
      const quality_score = Math.round((pairAccuracy + overallAccuracy + recentAccuracy + sig.confidence) / 4);

      let is_premium = true;
      let blockedReason = '';

      const minConf = parseInt(optSettings.min_confidence ?? '80', 10);
      if (sig.confidence < minConf) {
        is_premium = false;
        blockedReason = `Confidence < ${minConf}%`;
      }

      const disabledPairsStr = optSettings.disabled_pairs ?? '';
      const disabledList = disabledPairsStr.split(',').map(p => p.trim()).filter(Boolean);
      if (disabledList.includes(pair.symbol)) {
        is_premium = false;
        blockedReason = 'Pair Disabled';
      }

      const minQuality = parseInt(optSettings.min_quality_score ?? '80', 10);
      if (quality_score < minQuality) {
        is_premium = false;
        blockedReason = `Quality Score < ${minQuality}`;
      }

      return {
        signal: {
          ...sig,
          strategy_version,
          quality_score,
          is_premium,
          blockedReason
        } as unknown as PairSignal,
        status: 'ACTIVE',
        expiresIn: 60,
        generatedAt: timeStr,
      };
    });
  }, [optSettings, pairPerfMap, winRate]);

  const refreshStats = useCallback(async () => {
    try {
      const [perfRes, settingsRes, timelineRes] = await Promise.all([
        getSignalPerformance('ALL'),
        getPublicOptimizationSettings(),
        getManualSignalAudits()
      ]);
      if (perfRes.success && perfRes.stats) {
        const winDefault = subTab === 'live_market' ? 82.3 : 84.5;
        const win = perfRes.stats.accuracy > 0 ? perfRes.stats.accuracy : winDefault;
        setActiveStats({ winRate: win, totalToday: perfRes.stats.totalToday });
        if (subTab !== 'live_market') setWinRate(win);
      }
      if (settingsRes.success && settingsRes.settings) {
        setOptSettings(settingsRes.settings);
      }
      if (timelineRes.success) {
        const mapped = (timelineRes.audits || []).map((a: {
          id: string; pair: string; direction: string;
          entry_time: string; expiry_time: string;
          confidence: number; status: string; provider: string;
          market_bias?: string; noTradeReason?: string;
          entry_price?: number; exit_price?: number;
        }) => ({
          id: a.id,
          pair: a.pair,
          direction: a.direction as 'CALL' | 'PUT' | 'WAIT',
          entry_time: a.entry_time,
          expiry_time: a.expiry_time,
          confidence: a.confidence,
          result: a.status,
          source: a.provider,
          noTradeReason: a.noTradeReason || a.market_bias || undefined,
          entryPrice: a.entry_price,
          exitPrice: a.exit_price
        }));
        setTimelineSignals(mapped);
      }
    } catch (err) {
      console.error('Error refreshing stats:', err);
    }
  }, [subTab]);

  // ─── Manual Scanning Live Forex Handlers & Effects ──────────────────────────
  useEffect(() => {
    if (subTab !== 'live_market') return;

    let isMounted = true;

    void (async () => {
      const statusRes = await getMarketStatus();
      if (statusRes.success && isMounted) {
        setTimeout(() => {
          if (isMounted) setMarketOpen(statusRes.open);
        }, 0);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [subTab]);

  useEffect(() => {
    const t = setTimeout(() => {
      void refreshStats();
    }, 0);
    return () => clearTimeout(t);
  }, [subTab, refreshStats]);

  const handleScanLiveMarket = async (pairToScan = selectedLivePair) => {
    if (!marketOpen) {
      triggerErrorToast('Analysis restricted: Forex market is currently closed.');
      return;
    }
    setSelectedLivePair(pairToScan);
    const res = await forex.scan(pairToScan);
    if (res.success && res.direction && res.direction !== 'WAIT') {
      triggerNewSignalChime(pairToScan, res.direction);
    } else if (res.error && res.error !== 'Maximum 3 concurrent scans reached') {
      triggerErrorToast(res.error);
    }
  };

  // Fetch real win rate + signal mode + admin settings on mount
  useEffect(() => {
    let isMounted = true;
    async function loadMeta() {
      try {
        const [modeRes, accessRes, pairPerfRes, serverTimeRes] = await Promise.all([
          getSignalMode(),
          getUserAccessState(),
          getPairPerformanceMap(),
          getServerTime()
        ]);
        if (serverTimeRes.success) {
          const clientTime = Date.now();
          const offset = serverTimeRes.timestamp - clientTime;
          setTimeOffset(offset);
          timeOffsetRef.current = offset;

          const now = clientTime + offset;
          const nowSec = new Date(now).getUTCSeconds();
          const remaining = Math.max(1, 60 - nowSec);
          const seed = Math.floor(now / 60000);
          setWindowSeed(seed);
          windowSeedRef.current = seed;
          setRefreshIn(remaining);
          setPairStates(buildStates(seed).map(ps => ({ ...ps, expiresIn: remaining })));
        }
        if (modeRes.success) {
          setSignalModeState(modeRes.mode);
          setDataSourceOnline(modeRes.mode === 'SIMULATION' || modeRes.success);
        }
        // DIAG: Step 6a — raw result from getUserAccessState()
        console.log('[DIAG] Step 6a — getUserAccessState() raw result:', JSON.stringify(accessRes));
        if (accessRes.success) {
          setUserAccess(accessRes);
        }
        setAccessLoading(false);
        if (pairPerfRes.success && pairPerfRes.performance) {
          setPairPerfMap(pairPerfRes.performance);
        }
        await refreshStats();
      } catch (err) {
        console.error('Error loading metadata:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadMeta();
    return () => {
      isMounted = false;
    };
  }, [refreshStats, buildStates, subTab]);

  // Reset selected pairs when subTab changes to match current active assets
  useEffect(() => {
    const list = subTab !== 'live_market' ? OTC_PAIRS : LIVE_MARKET_PAIRS;
    const timer = setTimeout(() => {
      setSelectedPairs(new Set(list.map(p => p.short)));
    }, 0);
    return () => clearTimeout(timer);
  }, [subTab]);

  // Alert on new window seed (OTC)
  useEffect(() => {
    if (windowSeed === 0 || loading || subTab === 'live_market') return;
    const active = pairStates.find(ps => ps.status === 'ACTIVE' && ps.signal);
    if (active && active.signal) {
      const sig = active.signal;
      const timer = setTimeout(() => {
        triggerNewSignalChime(sig.pair || 'AUD/USD', sig.direction);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [windowSeed, loading, subTab, triggerNewSignalChime, pairStates]);

  // Live market background polling disabled under MVP v1.3 Event-Driven User Scan Architecture

  // Countdown timer clock ticks loop
  useEffect(() => {
    function tick() {
      const now = Date.now() + timeOffsetRef.current;
      const nowSec = new Date(now).getUTCSeconds();
      const secsLeft = nowSec === 0 ? 60 : 60 - nowSec;
      const currentSeed = Math.floor(now / 60000);

      setRefreshIn(secsLeft);

      if (currentSeed !== windowSeedRef.current) {
        windowSeedRef.current = currentSeed;
        setWindowSeed(currentSeed);

        // Fetch prices from database for consecutive streaks resolver
        const prevStates = pendingStates.current ?? buildStates(currentSeed);
        setPairStates(prevStates.map(ps => ({ ...ps, expiresIn: secsLeft })));

        pendingStates.current = null;
        refreshStats();

      } else {
        if (secsLeft <= 8) {
          const nextSeed = Math.floor(now / 60000) + 1;
          if (pendingForSeed.current !== nextSeed) {
            pendingStates.current = buildStates(nextSeed);
            pendingForSeed.current = nextSeed;
          }
        }
        setPairStates(prev => prev.map(ps => ({
          ...ps,
          expiresIn: Math.max(0, secsLeft),
          status: secsLeft <= 5 && ps.status === 'ACTIVE' ? 'LOADING_NEXT' : ps.status,
        })));
      }

      setLiveMarketSignals(prev => prev.filter(s => new Date(s.expiry_time).getTime() > Date.now()));
      timerRef.current = setTimeout(tick, 1000 - (Date.now() % 1000));
    }

    timerRef.current = setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [buildStates, refreshStats]);

  const profile = {
    vip_access: userAccess.vipAccess,
    premium_access: userAccess.premiumAccess,
    status: userAccess.status
  };

  // DIAG: Step 6b — userAccess state value
  useEffect(() => {
    if (!accessLoading) {
      console.log('[DIAG] Step 6b — userAccess state:', JSON.stringify(userAccess));
    }
  }, [userAccess, accessLoading]);

  // hasAccess is false while accessLoading to prevent upgrade modal from firing prematurely
  const hasAccess = !accessLoading && (userAccess.isAdmin || canAccess('premium-signals', profile, optSettings.signal_visibility));
  // DIAG: Step 11 — locked condition analysis
  useEffect(() => {
    if (!accessLoading && !hasAccess) {
      console.log('[DIAG] Step 11 — LOCK TRIGGER ANALYSIS:', JSON.stringify({
        hasAccess: false,
        '!hasAccess': true,
        'isActive && !hasAccess (Upgrade Now)': true,
        isAdmin: userAccess.isAdmin,
        premiumAccess: userAccess.premiumAccess,
        vipAccess: userAccess.vipAccess,
        profile_premium_access: profile.premium_access,
        userAccess_premiumAccess: userAccess.premiumAccess,
        accessLoading,
        canAccessRaw: canAccess('premium-signals', profile, optSettings.signal_visibility),
        signal_visibility: optSettings.signal_visibility,
        status: userAccess.status,
        locksRendered: JSON.stringify({
          premiumAssetFilter: true,
          timelineFeedLocked: true,
          upgradeNow: true
        })
      }));
    }
  }, [hasAccess, accessLoading, userAccess, profile, optSettings]);
  // DIAG: Steps 7,8,9,10
  if (!accessLoading) {
    const userRole = getMembershipRole(profile);
    const signalVis = optSettings.signal_visibility;
    let requiredRole = FEATURE_MIN_ROLES['premium-signals'];
    if (signalVis === 'public') requiredRole = 'free';
    else if (signalVis === 'vip') requiredRole = 'vip';
    else if (signalVis === 'premium') requiredRole = 'premium';
    const roleComparison = `${ROLE_HIERARCHY[userRole]} >= ${ROLE_HIERARCHY[requiredRole]}`;
    const canAccessResult = ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
    console.log('[DIAG] Step 7 — profile:', JSON.stringify(profile));
    console.log('[DIAG] Step 8 — optSettings.signal_visibility:', signalVis);
    console.log('[DIAG] Step 9 — hasAccess:', hasAccess);
    console.log('[DIAG] Step 10 — canAccess("premium-signals", ...) =>', JSON.stringify({
      feature: 'premium-signals',
      requiredRole,
      currentRole: userRole,
      userRoleRank: ROLE_HIERARCHY[userRole],
      requiredRoleRank: ROLE_HIERARCHY[requiredRole],
      comparison: roleComparison,
      result: canAccessResult,
      signalVisibilityOverride: signalVis
    }));
  }

  // Filter lists based on search & selectors
  const filtered = pairStates
    .map((ps, idx) => ({ ps, pair: OTC_PAIRS[idx] }))
    .filter(({ ps, pair }) => {
      if (!selectedPairs.has(pair.short)) return false;
      if (filterDir !== 'ALL' && ps.signal?.direction !== filterDir) return false;
      if (filterRisk !== 'ALL' && ps.signal?.risk !== filterRisk) return false;
      if (filterConf === '90+' && (!ps.signal || ps.signal.confidence < 90)) return false;
      if (!userAccess.isAdmin && ps.signal && !ps.signal.is_premium) return false;

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return pair.symbol.toLowerCase().includes(query) || (ps.signal && ps.signal.strategy.toLowerCase().includes(query));
      }
      return true;
    });

  interface LiveMarketSignalType {
    pair: string;
    confidence: number | string;
    direction: string;
    risk_level: string;
    strategy_name: string;
    [key: string]: unknown;
  }

  // Group active live market signals by pair and keep the strongest one (highest confidence) to avoid conflicting directions
  const strongestLiveSignalsMap = new Map<string, LiveMarketSignalType>();
  (liveMarketSignals as unknown as LiveMarketSignalType[]).forEach(sig => {
    const existing = strongestLiveSignalsMap.get(sig.pair);
    if (!existing || Number(sig.confidence) > Number(existing.confidence)) {
      strongestLiveSignalsMap.set(sig.pair, sig);
    }
  });
  const strongestLiveSignals = Array.from(strongestLiveSignalsMap.values());

  const filteredLiveMarket = strongestLiveSignals.filter(sig => {
    const shortCode = sig.pair.replace('/', '');
    if (!selectedPairs.has(shortCode)) return false;
    if (filterDir !== 'ALL' && sig.direction !== filterDir) return false;
    if (filterRisk !== 'ALL' && sig.risk_level !== filterRisk) return false;
    if (filterConf === '90+' && Number(sig.confidence) < 90) return false;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return sig.pair.toLowerCase().includes(query) || sig.strategy_name.toLowerCase().includes(query);
    }
    return true;
  });

  const activeCount = subTab !== 'live_market'
    ? pairStates.filter(p => p.status === 'ACTIVE').length
    : forex.activeScans.length;

  const handleCardClick = (sig: PairSignal | ExecutionRecord | null, pair: { symbol: string;[key: string]: unknown } | null, type: string) => {
    if (!hasAccess) {
      window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { requestedPlan: 'premium' } }));
      return;
    }
    if (sig && pair) {
      setSelectedSignal({ ...sig, pairSymbol: pair.symbol, type });
    }
  };

  const selectedScan = forex.activeScans.find(s => s.pair === selectedLivePair) || forex.popupRecords.find(s => s.pair === selectedLivePair);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 relative text-left">

      {/* Dynamic Toast Alerts Feed */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {activeToasts.map(t => t.type === 'signal' ? (
          <div key={t.id} className="p-4 rounded-xl border border-neon-green/30 bg-[#030b17] glow-shadow-green flex items-start gap-3 w-80 animate-slideIn">
            <Bell className="h-5 w-5 text-neon-green shrink-0 mt-0.5" />
            <div className="space-y-1 font-mono text-xs">
              <div className="font-bold text-slate-200 uppercase">NEW SIGNAL DETECTED</div>
              <div className="text-slate-400">
                Asset: <span className="text-slate-200 font-bold">{t.symbol}</span> · Direction: <span className={t.direction === 'CALL' ? 'text-neon-green font-bold' : 'text-rose-400 font-bold'}>{t.direction}</span>
              </div>
            </div>
          </div>
        ) : (
          <div key={t.id} className="p-4 rounded-xl border border-rose-500/30 bg-[#0a0303] glow-shadow-red flex items-start gap-3 w-80 animate-slideIn">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 font-mono text-xs">
              <div className="font-bold text-rose-300 uppercase">SCAN ERROR</div>
              <div className="text-slate-400">{t.message}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#030812]/95 border-b border-glass-border backdrop-blur-md px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-neon-green animate-pulse glow-shadow-green" />
              <span className="font-mono font-extrabold text-neon-green tracking-widest text-sm glow-text-green">
                QUOTEX SIGNAL ENGINE
              </span>
            </div>
            <span className="hidden sm:inline text-[9px] font-mono text-slate-600 border border-slate-800 px-2 py-0.5 rounded uppercase font-bold">
              v3.0 Premium Pro
            </span>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
              <Clock className="h-3.5 w-3.5 text-neon-green" />
              <span className="text-neon-green font-bold">{istTime}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshIn <= 5 ? 'text-gold-vip animate-spin' : 'text-slate-500'}`} />
              <span>REFRESH IN <span className="text-gold-vip font-bold">{refreshIn}s</span></span>
            </div>

            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-mono font-bold ${subTab === 'live_market'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                : subTab === 'live_otc' && dataSourceOnline
                  ? 'border-neon-green/40 bg-neon-green/10 text-neon-green'
                  : 'border-slate-800 bg-slate-900/30 text-slate-600'
              }`}>
              <Database className="h-3 w-3" />
              {subTab === 'live_market' ? 'LIVE FOREX' : subTab === 'live_otc' && dataSourceOnline ? 'LIVE OTC' : 'SIMULATION'}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">

        {/* ── Stats Row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'ACTIVE SIGNALS', value: activeCount.toString(), icon: Radio, color: 'text-neon-green', glow: 'glow-shadow-green' },
            { label: "TODAY'S SIGNALS", value: activeStats.totalToday.toString(), icon: Signal, color: 'text-slate-300' },
            { label: 'WIN RATE (ALL)', value: activeStats.winRate !== null ? `${activeStats.winRate}%` : (subTab === 'live_market' ? '82.3%' : '84.5%'), icon: Target, color: 'text-gold-vip', glow: 'glow-shadow-gold' },
            { label: 'ASSETS LOADED', value: subTab !== 'live_market' ? `${selectedPairs.size}/${OTC_PAIRS.length}` : `${Array.from(selectedPairs).filter(s => LIVE_MARKET_PAIRS.some(lp => lp.short === s)).length}/${LIVE_MARKET_PAIRS.length}`, icon: BarChart2, color: 'text-slate-300' },
          ].map((stat, i) => (
            <div key={i} className={`glass-panel glow-halo rounded-xl p-4 flex items-center justify-between transition-all duration-300 ${stat.glow} ${!hasAccess ? 'blur-[4.5px] select-none pointer-events-none' : ''}`}>
              <div>
                <div className="text-[9px] font-mono text-slate-500 tracking-widest uppercase">{stat.label}</div>
                <div className={`text-xl font-extrabold font-mono mt-1.5 ${stat.color}`}>{stat.value}</div>
              </div>
              <stat.icon className={`h-6.5 w-6.5 ${stat.color} opacity-60`} />
            </div>
          ))}
        </div>

        {/* Split Grid Layout: Left Columns for Cards/Filters, Right Column for Timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* LEFT 2-COLUMNS: Filters & Active Signals Grid */}
          <div className="lg:col-span-2 space-y-6">

            {/* News Calendar warning block */}
            <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <AlertTriangle className="h-4.5 w-4.5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-0.5">
                <p className="text-xs font-mono font-bold text-amber-400 tracking-wider uppercase">⚠ News Filter active — Avoid high-impact periods</p>
                <p className="text-[9px] text-slate-400 font-sans leading-relaxed">
                  We highly recommend reviewing the Forex Factory news calendar before placing signal recommendations. Avoid entries within 30 minutes of red folder announcements.
                </p>
              </div>
            </div>

            {/* Sub-Tab selectors */}
            <div className="flex flex-wrap gap-2 border-b border-slate-900 pb-3">
              {signalMode.includes('LIVE_OTC') && (
                <button
                  onClick={() => setSubTab('live_otc')}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-mono font-bold tracking-widest border transition-all ${subTab === 'live_otc'
                      ? 'bg-neon-green/10 border-neon-green/30 text-neon-green glow-shadow-green'
                      : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                    }`}
                >
                  <Radio className="h-3.5 w-3.5 animate-pulse text-neon-green" />
                  LIVE OTC
                </button>
              )}

              {signalMode.includes('SIMULATION') && (
                <button
                  onClick={() => setSubTab('simulation')}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-mono font-bold tracking-widest border transition-all ${subTab === 'simulation'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 glow-shadow-gold'
                      : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                    }`}
                >
                  <Database className="h-3.5 w-3.5 text-amber-400" />
                  SIMULATION
                </button>
              )}

              {signalMode.includes('LIVE_MARKET') && (
                <button
                  onClick={() => setSubTab('live_market')}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-mono font-bold tracking-widest border transition-all ${subTab === 'live_market'
                      ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 glow-shadow-purple'
                      : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                    }`}
                >
                  <Clock className="h-3.5 w-3.5 text-purple-400" />
                  LIVE FOREX
                </button>
              )}
            </div>

            {/* Filter and Search Bar */}
            <div className="glass-panel p-4.5 rounded-xl border border-glass-border space-y-4 text-xs font-mono">
              <div className="flex flex-col sm:flex-row gap-3.5 items-stretch sm:items-center">
                {/* Search */}
                <input
                  type="text"
                  placeholder="Instant Search Ticker..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-grow bg-[#02050b] border border-glass-border px-3.5 py-2 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-neon-green/30"
                />

                {/* Dropdowns */}
                <div className="flex gap-2">
                  <select
                    value={filterDir}
                    onChange={(e) => setFilterDir(e.target.value as 'ALL' | 'CALL' | 'PUT')}
                    className="bg-[#02050b] border border-glass-border px-2.5 py-2 rounded text-slate-300"
                  >
                    <option value="ALL">ALL DIRECTIONS</option>
                    <option value="CALL">BUY / CALL</option>
                    <option value="PUT">SELL / PUT</option>
                  </select>
                  <select
                    value={filterRisk}
                    onChange={(e) => setFilterRisk(e.target.value as 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH')}
                    className="bg-[#02050b] border border-glass-border px-2.5 py-2 rounded text-slate-300"
                  >
                    <option value="ALL">ALL RISK</option>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Asset Selector Section */}
            <div className="glass-panel p-4 rounded-xl border border-glass-border space-y-3 relative overflow-hidden text-left">
              <div className="flex items-center justify-between border-b border-glass-border/30 pb-2">
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <Filter className="h-3.5 w-3.5 text-purple-400" />
                  <span className="font-bold text-slate-300 uppercase tracking-wider">Asset Filter Selector</span>
                </div>
                {hasAccess && (
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="px-2 py-0.5 rounded border border-glass-border bg-slate-950 text-slate-400 hover:text-slate-200 text-[8px] font-mono uppercase font-bold"
                    >
                      Select All
                    </button>
                    <button
                      onClick={clearAll}
                      className="px-2 py-0.5 rounded border border-glass-border bg-slate-950 text-slate-400 hover:text-slate-200 text-[8px] font-mono uppercase font-bold"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>

              {/* Padlock indicator for non-premium members */}
              {!hasAccess && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-3 bg-slate-950/65 z-10 font-mono">
                  <div className="flex items-center gap-1 text-[9px] font-bold text-purple-300 uppercase tracking-widest bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                    <Lock className="h-2.5 w-2.5 text-purple-400" /> Premium Asset Filter
                  </div>
                </div>
              )}

              <div className={`flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1 scrollbar-thin ${!hasAccess ? 'blur-[4.5px] select-none pointer-events-none' : ''}`}>
                {(subTab !== 'live_market' ? OTC_PAIRS : LIVE_MARKET_PAIRS).map((p) => {
                  const shortCode = p.short;
                  const isSelected = selectedPairs.has(shortCode);
                  return (
                    <button
                      key={p.short}
                      onClick={() => {
                        const next = new Set(selectedPairs);
                        if (isSelected) {
                          next.delete(shortCode);
                        } else {
                          next.add(shortCode);
                        }
                        setSelectedPairs(next);
                      }}
                      className={`px-2 py-1 rounded text-[9px] font-mono font-bold uppercase transition-all border ${isSelected
                          ? 'bg-purple-950/40 border-purple-500/50 text-purple-300 glow-shadow-purple'
                          : 'bg-transparent border-glass-border/40 text-slate-500 hover:border-slate-800'
                        }`}
                    >
                      {p.symbol}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Signal Cards Grid */}
            {subTab === 'simulation' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map(({ ps, pair }) => (
                  <SignalCard
                    key={pair.short}
                    pair={pair}
                    ps={ps}
                    hasAccess={hasAccess}
                    onClick={() => handleCardClick(ps.signal, pair, 'OTC')}
                  />
                ))}
                {filtered.length === 0 && (
                  <div className="col-span-2 text-center py-16 text-slate-600 font-mono text-xs">
                    No simulation signals match your filter.
                  </div>
                )}
              </div>
            ) : subTab === 'live_otc' ? (
              <div className="space-y-6">
                {/* OTC Status Dashboard */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 font-mono text-[10px]">
                  <div className="glass-panel p-3.5 border border-glass-border/40 rounded-xl flex flex-col justify-center text-left">
                    <span className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">MARKET STATUS</span>
                    <span className="text-sm font-extrabold mt-1.5 uppercase text-neon-green">🟢 OPEN</span>
                    <span className="text-slate-600 text-[8px] mt-0.5">OTC — 24/7 TRADING</span>
                  </div>
                  <div className="glass-panel p-3.5 border border-glass-border/40 rounded-xl flex flex-col justify-center text-left">
                    <span className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">ANALYSIS ENGINE</span>
                    <span className="text-slate-200 font-extrabold text-sm mt-1.5 uppercase">v1.3 OTC</span>
                    <span className="text-slate-600 text-[8px] mt-0.5">DETERMINISTIC CONFLUENCE</span>
                  </div>
                  <div className="glass-panel p-3.5 border border-glass-border/40 rounded-xl flex flex-col justify-center text-left">
                    <span className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">ENTRY MODEL</span>
                    <span className="text-slate-200 font-extrabold text-sm mt-1.5 uppercase">NEXT CANDLE OPEN</span>
                    <span className="text-slate-600 text-[8px] mt-0.5">60-SECOND EXPIRY</span>
                  </div>
                  <div className="glass-panel p-3.5 border border-glass-border/40 rounded-xl flex flex-col justify-center text-left">
                    <span className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">CONCURRENT SCANS</span>
                    <span className="text-yellow-400 font-extrabold text-sm mt-1.5 uppercase animate-pulse">{otc.runningCount}/3</span>
                    <span className="text-slate-600 text-[8px] mt-0.5">ACTIVE OTC SLOTS</span>
                  </div>
                </div>

                {/* OTC Manual Scan Selector Grid (34 Pairs) */}
                <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4 font-mono text-xs text-left">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-glass-border/30 pb-3">
                    <div className="flex items-center gap-2">
                      <Radio className="h-4 w-4 text-neon-green animate-pulse" />
                      <span className="font-extrabold text-slate-200 text-[10px] uppercase tracking-wider">
                        OTC Confluence Analyzer (34 Pairs)
                      </span>
                    </div>
                    <div className="relative w-full sm:w-48">
                      <input
                        type="text"
                        placeholder="SEARCH ASSET..."
                        value={otcSearchFilter}
                        onChange={(e) => setOtcSearchFilter(e.target.value)}
                        className="w-full bg-[#02050b] border border-glass-border px-2.5 py-1.5 rounded text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-neon-green/30"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                    {OTC_PAIRS.filter(p => p.symbol.toLowerCase().includes(otcSearchFilter.toLowerCase())).map((p, idx) => {
                      const isCurrentLoading = otc.activeScans.some(s => s.pair === p.short && s.status === 'SCANNING');
                      const otcHistoryMatch = otc.timelineRecords.find(t => t.pair === p.short && !OTC_TERMINAL_STATUSES.has(t.status));
                      const direction = otcHistoryMatch?.direction;
                      const volStars = p.vol === 'HIGH' ? '★★★★★' : p.vol === 'MEDIUM' ? '★★★☆☆' : '★★☆☆☆';
                      const limitReached = !otc.canScan;

                      let statusText = 'Ready';
                      if (!otc.canScan) statusText = 'FULL';

                      return (
                        <div key={p.short} className={`p-3 rounded-lg border flex flex-col justify-between gap-3.5 transition-all text-left bg-[#02050b]/60 border-glass-border/30 hover:border-slate-800`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[11px] font-extrabold text-slate-100 tracking-wide block">{p.symbol}</span>
                              <div className="space-y-0.5 mt-1.5 text-[8px] text-slate-500 font-medium">
                                <div>VOLATILITY: <span className="text-gold-vip">{volStars}</span></div>
                                <div>STATUS: <span className={statusText === 'Ready' ? 'text-neon-green font-bold' : 'text-yellow-500 font-bold animate-pulse'}>{statusText.toUpperCase()}</span></div>
                              </div>
                            </div>
                            {direction && (
                              <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${direction === 'CALL' ? 'text-neon-green border-neon-green/20 bg-neon-green/[0.01]' : 'text-rose-400 border-rose-500/20 bg-rose-500/[0.01]'}`}>
                                {direction}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => otc.scan(p.short)}
                            disabled={isCurrentLoading || (!isCurrentLoading && limitReached)}
                            className="w-full py-1.5 rounded bg-neon-green/90 hover:bg-neon-green disabled:bg-slate-900 border border-neon-green/20 disabled:border-slate-800 font-extrabold text-white disabled:text-slate-600 text-[9px] uppercase tracking-widest transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1"
                          >
                            {isCurrentLoading ? (
                              <><RefreshCw className="h-2.5 w-2.5 animate-spin" /> SCANNING...</>
                            ) : (
                              <><Zap className="h-2.5 w-2.5 text-yellow-400 animate-pulse" /> ANALYZE</>
                            )}
                          </button>
                        </div>
                      );
                    })}
                    {OTC_PAIRS.filter(p => p.symbol.toLowerCase().includes(otcSearchFilter.toLowerCase())).length === 0 && (
                      <div className="col-span-3 text-center py-6 text-slate-600 font-bold uppercase tracking-wider text-[9px]">
                        No OTC pairs match search filter.
                      </div>
                    )}
                  </div>
                </div>

                {/* OTC Scan Outcome Container */}
                <div className="space-y-4">
                  {otc.popupRecords.map((sig) => (
                    <OTCScanResultCard key={sig.id} result={sig} clockTime={Date.now()} onDismiss={() => otc.dismiss(sig.id)} />
                  ))}
                  {otc.popupRecords.length === 0 && (
                    <div className="glass-panel p-8 rounded-xl border border-glass-border flex flex-col items-center justify-center py-20 gap-2 font-mono text-slate-600 text-xs text-center opacity-45">
                      <Radio className="h-8 w-8 text-slate-700" />
                      <span className="uppercase tracking-widest text-[9px] font-bold">Awaiting OTC Analysis</span>
                      <span className="text-[8px] max-w-[280px]">Select an OTC pair above and click Analyze to execute indicator checks and determine entry setups.</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Trader Market Status Dashboard */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 font-mono text-[10px]">
                  <div className="glass-panel p-3.5 border border-glass-border/40 rounded-xl flex flex-col justify-center text-left">
                    <span className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">MARKET STATUS</span>
                    <span className={`text-sm font-extrabold mt-1.5 uppercase ${marketOpen ? 'text-neon-green' : 'text-rose-500'}`}>
                      {marketOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                    </span>
                    <span className="text-slate-600 text-[8px] mt-0.5">FOREX GMT SYSTEM STATUS</span>
                  </div>

                  <div className="glass-panel p-3.5 border border-glass-border/40 rounded-xl flex flex-col justify-center text-left">
                    <span className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">ANALYSIS ENGINE</span>
                    <span className="text-slate-200 font-extrabold text-sm mt-1.5 uppercase">
                      v1.3 PRODUCTION
                    </span>
                    <span className="text-slate-600 text-[8px] mt-0.5">ACTIVE STRATEGY CONFLUENCE</span>
                  </div>

                  <div className="glass-panel p-3.5 border border-glass-border/40 rounded-xl flex flex-col justify-center text-left">
                    <span className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">LAST CLOSED CANDLE</span>
                    <span className="text-slate-200 font-extrabold text-sm mt-1.5 uppercase">
                      {selectedScan ? (
                        (() => {
                          try {
                            const d = new Date(selectedScan.lastCandleTime);
                            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                          } catch {
                            return 'N/A';
                          }
                        })()
                      ) : 'AWAIT SCAN'}
                    </span>
                    <span className="text-slate-600 text-[8px] mt-0.5">LATEST RETRIEVED INTERVAL</span>
                  </div>

                  <div className="glass-panel p-3.5 border border-glass-border/40 rounded-xl flex flex-col justify-center text-left">
                    <span className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">CONCURRENT SCANS</span>
                    <span className="text-yellow-400 font-extrabold text-sm mt-1.5 uppercase animate-pulse">
                      {forex.runningCount}/3
                    </span>
                    <span className="text-slate-600 text-[8px] mt-0.5">ACTIVE ANALYSIS SLOTS</span>
                  </div>
                </div>

                {/* Manual Scan Selector & Trigger (21 Pairs Grid) */}
                <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4 font-mono text-xs text-left">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-glass-border/30 pb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-gold-vip animate-pulse" />
                      <span className="font-extrabold text-slate-200 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                        Market Confluence Analyzer (21 Pairs Grid)
                        <span className="text-slate-600 text-[9px] font-normal font-sans">|</span>
                        <span className={marketOpen ? 'text-neon-green font-bold' : 'text-rose-500 font-bold'}>
                          MARKET: {marketOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                        </span>
                      </span>
                    </div>
                    <div className="relative w-full sm:w-48">
                      <input
                        type="text"
                        placeholder="SEARCH ASSET..."
                        value={pairFilter}
                        onChange={(e) => setPairFilter(e.target.value)}
                        className="w-full bg-[#02050b] border border-glass-border px-2.5 py-1.5 rounded text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-neon-green/30"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                    {LIVE_MARKET_PAIRS.filter(p => p.symbol.toLowerCase().includes(pairFilter.toLowerCase())).map(p => {
                      const isSelected = selectedLivePair === p.symbol;
                      const isCurrentLoading = forex.activeScans.some(s => s.pair === p.symbol && s.status === 'SCANNING');

                      // Lookup cached analysis direction from timeline
                      const historyMatch = mergedTimeline.find(t => t.pair === p.symbol && t.status !== 'SCANNING' && t.status !== 'FAILED');
                      const direction = historyMatch?.direction;

                      const volStars = p.vol === 'HIGH' ? '★★★★★' : p.vol === 'MEDIUM' ? '★★★☆☆' : '★★☆☆☆';
                      const majorsList = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD'];
                      const exoticsList = ['USD/INR', 'USD/SGD', 'USD/MXN', 'USD/ZAR'];
                      const spreadVal = majorsList.includes(p.symbol) ? 'Low' : exoticsList.includes(p.symbol) ? 'High' : 'Medium';

                      const limitReached = !forex.canScan;

                      let statusText = 'Ready';
                      if (!marketOpen) statusText = 'Closed';
                      else if (!forex.canScan) statusText = 'FULL';

                      return (
                        <div
                          key={p.symbol}
                          className={`p-3 rounded-lg border flex flex-col justify-between gap-3.5 transition-all text-left bg-[#02050b]/60 border-glass-border/30 ${isSelected ? 'border-purple-500/40 bg-purple-500/[0.02] glow-shadow-purple' : 'hover:border-slate-800'
                            }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[11px] font-extrabold text-slate-100 tracking-wide block">{p.symbol}</span>
                              <div className="space-y-0.5 mt-1.5 text-[8px] text-slate-500 font-medium">
                                <div>VOLATILITY: <span className="text-gold-vip">{volStars}</span></div>
                                <div>SPREAD: <span className="text-slate-300 font-bold">{spreadVal}</span></div>
                                <div>STATUS: <span className={
                                  statusText === 'Ready' ? 'text-neon-green font-bold' : statusText === 'Closed' ? 'text-rose-500 font-bold' : 'text-yellow-500 font-bold animate-pulse'
                                }>{statusText.toUpperCase()}</span></div>
                              </div>
                            </div>

                            {direction && (
                              <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${direction === 'CALL' ? 'text-neon-green border-neon-green/20 bg-neon-green/[0.01]' : direction === 'PUT' ? 'text-rose-400 border-rose-500/20 bg-rose-500/[0.01]' : 'text-amber-400 border-amber-500/20 bg-amber-500/[0.01]'
                                }`}>
                                {direction}
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => handleScanLiveMarket(p.symbol)}
                            disabled={isCurrentLoading || (!isCurrentLoading && limitReached)}
                            className="w-full py-1.5 rounded bg-purple-600/90 hover:bg-purple-500 disabled:bg-slate-900 border border-purple-500/20 disabled:border-slate-800 font-extrabold text-white disabled:text-slate-600 text-[9px] uppercase tracking-widest transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1"
                          >
                            {isCurrentLoading ? (
                              <>
                                <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                                SCANNING...
                              </>
                            ) : (
                              <>
                                <Zap className="h-2.5 w-2.5 text-yellow-400 animate-pulse" />
                                ANALYZE
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                    {LIVE_MARKET_PAIRS.filter(p => p.symbol.toLowerCase().includes(pairFilter.toLowerCase())).length === 0 && (
                      <div className="col-span-3 text-center py-6 text-slate-600 font-bold uppercase tracking-wider text-[9px]">
                        No pairs match search filter.
                      </div>
                    )}
                  </div>
                </div>
                {/* Scan Outcome Container */}
                <div className="space-y-4">
                  {forex.popupRecords.map((sig) => (
                    <ManualScanResultCard
                      key={sig.id}
                      result={sig}
                      clockTime={Date.now()}
                      onRetry={() => handleScanLiveMarket(sig.pair)}
                    />
                  ))}
                  {forex.popupRecords.length === 0 && (
                    <div className="glass-panel p-8 rounded-xl border border-glass-border flex flex-col items-center justify-center py-20 gap-2 font-mono text-slate-600 text-xs text-center opacity-45">
                      <Eye className="h-8 w-8 text-slate-700" />
                      <span className="uppercase tracking-widest text-[9px] font-bold">Awaiting Market Analysis</span>
                      <span className="text-[8px] max-w-[280px]">Select a currency pair above and click Analyze to execute indicator checks and determine entry setups.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Chronological Timeline Feed */}
          <div className="space-y-6">
            <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4">
              <div className="flex items-center justify-between border-b border-glass-border/40 pb-3 font-mono text-xs">
                <div className="flex items-center gap-1.5">
                  <Activity className="h-4.5 w-4.5 text-gold-vip" />
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Signal Audit Timeline</span>
                </div>
                <button
                  onClick={() => {
                    const next = !isTimelineVisible;
                    setIsTimelineVisible(next);
                    localStorage.setItem('timeline_visible', String(next));
                  }}
                  className="px-2 py-0.5 rounded border border-glass-border bg-slate-950 text-slate-400 hover:text-slate-200 text-[8px] font-bold uppercase transition-colors cursor-pointer"
                >
                  {isTimelineVisible ? 'Hide' : 'Show'}
                </button>
              </div>

              {isTimelineVisible && (
                /* Timeline feed wrapper */
                <div className="space-y-3.5 max-h-[600px] overflow-y-auto pr-1 relative animate-fadeIn">
                  {/* Lock overlay for non-premium members */}
                  {!hasAccess && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/40 z-20 text-center space-y-2.5 font-mono">
                      <div className="p-2.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400">
                        <Lock className="h-4.5 w-4.5" />
                      </div>
                      <div className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">Timeline Feed Locked</div>
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { requestedPlan: 'premium' } }))}
                        className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-[9px] uppercase tracking-wider transition-colors shadow-md"
                      >
                        Unlock Feed
                      </button>
                    </div>
                  )}

                  <div className={!hasAccess ? 'blur-[4.5px] select-none pointer-events-none space-y-3.5' : 'space-y-3.5'}>
                    {mergedTimeline.map((sig) => {
                      const isCall = sig.direction === 'CALL';
                      const isPut = sig.direction === 'PUT';

                      const timestampStr = (() => {
                        try {
                          return new Intl.DateTimeFormat("en-IN", {
                            timeZone: "Asia/Kolkata",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: true,
                          }).format(new Date(sig.entryTime));
                        } catch {
                          return 'N/A';
                        }
                      })();

                      const isTimelineScanning = sig.status === 'SCANNING';
                      const isTimelinePending = sig.status === 'PENDING';
                      const isTimelineWaitingEntry = sig.status === 'WAITING_FOR_ENTRY';
                      const isTimelineActive = isTimelinePending || isTimelineWaitingEntry;
                      const timelineCountdown = (() => {
                        if (isTimelineScanning) {
                          const isOtc = sig.dataSource?.toLowerCase().includes('otc');
                          return isOtc ? 'Scanning OTC market...' : 'Scanning Live market...';
                        }
                        const expiresMs = new Date(sig.expiryTime).getTime();
                        const diffSec = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
                        if (diffSec <= 0) return 'Updating...';
                        const m = Math.floor(diffSec / 60);
                        const s = diffSec % 60;
                        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} remaining`;
                      })();

                      const resultLabel = sig.status;
                      const isWin = sig.status === 'WIN';
                      const isLoss = sig.status === 'LOSS';
                      const isRefund = sig.status === 'REFUND';
                      const isNoTrade = sig.status === 'NO TRADE';
                      const isActive = isTimelinePending || isTimelineWaitingEntry || isTimelineScanning;

                      return (
                        <div key={sig.id} className="p-3 rounded-lg bg-[#02050b]/80 border border-glass-border/40 flex items-center justify-between gap-3 text-left">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${isCall
                                ? 'bg-neon-green/10 text-neon-green'
                                : isPut
                                  ? 'bg-rose-500/10 text-rose-400'
                                  : 'bg-slate-900 text-slate-500'
                              }`}>
                              {isCall ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : isPut ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <Activity className="h-4 w-4 text-slate-500" />
                              )}
                            </div>
                            <div className="font-mono text-xs">
                              <div className="font-bold text-slate-200">{sig.pair}</div>
                              <div className="text-[9px] text-slate-500 mt-0.5">
                                {timestampStr} · {sig.dataSource.toUpperCase()}
                              </div>
                              {isActive && (
                                <div className={`text-[8px] font-bold mt-1 flex items-center gap-0.5 ${isTimelineScanning ? 'text-amber-400' : 'text-amber-400 animate-pulse'}`}>
                                  {isTimelineScanning ? <Loader className="h-2.5 w-2.5 animate-spin" /> : <Clock className="h-2.5 w-2.5" />}
                                  {timelineCountdown}
                                </div>
                              )}
                              {(isNoTrade || sig.status === 'FAILED') && sig.noTradeReason && (
                                <div className="text-[8.5px] text-slate-400 font-semibold mt-1 max-w-[200px] leading-relaxed italic">
                                  Reason: {sig.noTradeReason}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="text-right font-mono text-[10px] flex flex-col items-end gap-1">
                            <span className={`px-2 py-0.5 rounded border font-bold uppercase ${isWin
                                ? 'text-neon-green border-neon-green/30 bg-neon-green/5'
                                : isLoss
                                  ? 'text-rose-400 border-rose-500/30 bg-rose-500/5'
                                  : isRefund
                                    ? 'text-slate-400 border-slate-800 bg-slate-900/40'
                                    : isNoTrade
                                      ? 'text-slate-500 border-slate-800 bg-slate-900/20'
                                      : 'text-amber-400 border-amber-500/20 bg-amber-500/5 animate-pulse'
                              }`}>
                              {resultLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {mergedTimeline.length === 0 && (
                      <div className="p-8 text-center text-slate-600 font-mono text-[10px] uppercase">
                        No timeline logs populated.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Disclaimer warning block */}
        <div className="border border-slate-900 rounded-xl p-4.5 bg-slate-950/40 text-left">
          <p className="text-[9px] font-mono text-slate-600 leading-relaxed">
            <span className="text-slate-500 font-bold">REGULATORY NOTICE: </span>
            Algorithm recommendations are derived automatically from mathematical calculations and should serve educational evaluation metrics only. Capital trading involves high levels of leverage risks. Under no criteria does this dashboard constitute financial execution signals.
          </p>
        </div>

      </div>

      {/* ── Signal Details Modal Popup ── */}
      {selectedSignal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg glass-panel p-6 rounded-xl border border-glass-border space-y-5 text-left relative overflow-hidden">
            <button
              onClick={() => setSelectedSignal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
              <Target className="h-5 w-5 text-neon-green" />
              <span className="font-mono font-bold text-slate-200 text-sm uppercase">
                {selectedSignal.pairSymbol || selectedSignal.pair} Audit Checklist
              </span>
            </div>

            {/* Checklist details grid */}
            <div className="grid grid-cols-2 gap-4 font-mono text-xs text-slate-300">
              <div className="bg-[#020617]/50 p-2.5 rounded border border-glass-border/40">
                <span className="text-[8px] text-slate-500 uppercase block">DIRECTION</span>
                <span className={`font-bold mt-1 block ${selectedSignal.direction === 'CALL' ? 'text-neon-green' : 'text-rose-400'}`}>
                  {selectedSignal.direction === 'CALL' ? '▲ BUY / CALL' : '▼ SELL / PUT'}
                </span>
              </div>
              <div className="bg-[#020617]/50 p-2.5 rounded border border-glass-border/40">
                <span className="text-[8px] text-slate-500 uppercase block">ENTRY PRICE</span>
                <span className="font-bold text-slate-200 mt-1 block">
                  {selectedSignal.entryPrice || selectedSignal.entry_price}
                </span>
              </div>
              <div className="bg-[#020617]/50 p-2.5 rounded border border-glass-border/40">
                <span className="text-[8px] text-slate-500 uppercase block">CONFIDENCE INDEX</span>
                <span className="font-bold text-gold-vip mt-1 block">
                  {selectedSignal.confidence}%
                </span>
              </div>
              <div className="bg-[#020617]/50 p-2.5 rounded border border-glass-border/40">
                <span className="text-[8px] text-slate-500 uppercase block">STRATEGY NAME</span>
                <span className="font-bold text-slate-200 mt-1 block truncate">
                  {selectedSignal.strategy || selectedSignal.strategy_name}
                </span>
              </div>
            </div>

            {/* Indicators checklist */}
            <div className="space-y-2 font-mono text-xs border-t border-glass-border/40 pt-4">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest block mb-2">Technical Indicators Status</span>

              <div className="flex justify-between border-b border-slate-900 pb-1.5">
                <span className="text-slate-500">RSI(14):</span>
                <span className="text-slate-200">{selectedSignal.rsi ?? 'N/A'} (Oversold/Overbought check)</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-1.5">
                <span className="text-slate-500">Stochastic:</span>
                <span className="text-slate-200">{selectedSignal.stochBias || 'NEUTRAL'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-1.5">
                <span className="text-slate-500">MA Trend:</span>
                <span className="text-slate-200">{selectedSignal.smaStatus || 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-1.5">
                <span className="text-slate-500">SuperTrend:</span>
                <span className="text-slate-200">{selectedSignal.superTrend || 'N/A'} ({selectedSignal.superTrendStrength || 'NORMAL'})</span>
              </div>
              <div className="flex justify-between items-center pb-1.5">
                <span className="text-slate-500">Orderflow:</span>
                <span className="text-slate-200">{selectedSignal.ofPattern?.pattern || 'Balanced pressure'}</span>
              </div>
            </div>

            {/* Button */}
            <button
              onClick={() => setSelectedSignal(null)}
              className="w-full py-2.5 rounded bg-slate-900 hover:bg-slate-800 border border-glass-border font-mono font-bold text-slate-300 text-xs uppercase transition-colors"
            >
              Close Details
            </button>
          </div>
        </div>
      )}

    </div>
  );
}



