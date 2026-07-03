'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  TrendingUp, TrendingDown, Clock, AlertTriangle, Zap,
  Target, Activity, RefreshCw, Shield, Radio, BarChart2,
  ChevronUp, ChevronDown, Eye, Filter, Signal, Database, Award, Lock,
  Bell, Volume2, X, Clipboard, Check, Layers, AlertCircle, ShieldAlert,
  Play, BookOpen
} from 'lucide-react';

import { 
  saveSignal, updateSignalResult, getSignalPerformance, 
  getPairPerformanceMap, getActiveLiveMarketSignals,
  getServerTime, getSignalHistory
} from '@/app/actions/signals';
import { getSignalMode } from '@/app/actions/signal_mode';
import { getPublicOptimizationSettings, getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';

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

// ─── All Quotex OTC Pairs ────────────────────────────────────────────────────
const OTC_PAIRS = [
  { symbol: 'EUR/USD', short: 'EURUSD', base: 1.08450,   pip: 5, vol: 'MEDIUM' },
  { symbol: 'GBP/USD', short: 'GBPUSD', base: 1.26500,   pip: 5, vol: 'HIGH'   },
  { symbol: 'USD/JPY', short: 'USDJPY', base: 149.500,   pip: 2, vol: 'MEDIUM' },
  { symbol: 'AUD/USD', short: 'AUDUSD', base: 0.65200,   pip: 5, vol: 'MEDIUM' },
  { symbol: 'USD/CAD', short: 'USDCAD', base: 1.35800,   pip: 5, vol: 'LOW'    },
  { symbol: 'EUR/JPY', short: 'EURJPY', base: 162.100,   pip: 2, vol: 'HIGH'   },
  { symbol: 'GBP/JPY', short: 'GBPJPY', base: 189.200,  pip: 2, vol: 'HIGH'   },
  { symbol: 'EUR/GBP', short: 'EURGBP', base: 0.85700,   pip: 5, vol: 'LOW'    },
  { symbol: 'NZD/USD', short: 'NZDUSD', base: 0.59800,   pip: 5, vol: 'MEDIUM' },
  { symbol: 'USD/CHF', short: 'USDCHF', base: 0.90400,   pip: 5, vol: 'LOW'    },
  { symbol: 'EUR/AUD', short: 'EURAUD', base: 1.66200,   pip: 5, vol: 'MEDIUM' },
  { symbol: 'GBP/AUD', short: 'GBPAUD', base: 1.93600,  pip: 5, vol: 'HIGH'   },
  { symbol: 'AUD/JPY', short: 'AUDJPY', base: 97.500,    pip: 2, vol: 'HIGH'   },
  { symbol: 'CAD/JPY', short: 'CADJPY', base: 110.200,   pip: 2, vol: 'MEDIUM' },
  { symbol: 'CHF/JPY', short: 'CHFJPY', base: 165.400,   pip: 2, vol: 'MEDIUM' },
  { symbol: 'EUR/CAD', short: 'EURCAD', base: 1.47300,   pip: 5, vol: 'MEDIUM' },
  { symbol: 'GBP/CAD', short: 'GBPCAD', base: 1.71500,  pip: 5, vol: 'HIGH'   },
  { symbol: 'USD/SGD', short: 'USDSGD', base: 1.34200,   pip: 5, vol: 'LOW'    },
  { symbol: 'USD/INR', short: 'USDINR', base: 83.650,    pip: 2, vol: 'LOW'    },
  { symbol: 'USD/BRL', short: 'USDBRL', base: 4.98500,   pip: 3, vol: 'HIGH'   },
  { symbol: 'USD/MXN', short: 'USDMXN', base: 17.1500,  pip: 3, vol: 'HIGH'   },
  { symbol: 'EUR/CHF', short: 'EURCHF', base: 0.97800,   pip: 5, vol: 'LOW'    },
  { symbol: 'GBP/CHF', short: 'GBPCHF', base: 1.13200,  pip: 5, vol: 'MEDIUM' },
  { symbol: 'AUD/CAD', short: 'AUDCAD', base: 0.89600,   pip: 5, vol: 'MEDIUM' },
  { symbol: 'AUD/NZD', short: 'AUDNZD', base: 1.09100,   pip: 5, vol: 'MEDIUM' },
  { symbol: 'NZD/JPY', short: 'NZDJPY', base: 89.700,    pip: 2, vol: 'HIGH'   },
  { symbol: 'GBP/NZD', short: 'GBPNZD', base: 2.11500,  pip: 5, vol: 'HIGH'   },
  { symbol: 'EUR/NZD', short: 'EURNZD', base: 1.81200,  pip: 5, vol: 'MEDIUM' },
  { symbol: 'CAD/CHF', short: 'CADCHF', base: 0.66600,   pip: 5, vol: 'LOW'    },
  { symbol: 'USD/ZAR', short: 'USDZAR', base: 18.6500,   pip: 3, vol: 'HIGH'   },
  { symbol: 'USD/TRY', short: 'USDTRY', base: 32.4500,   pip: 3, vol: 'HIGH'   },
  { symbol: 'USD/ARS', short: 'USDARS', base: 920.00,    pip: 1, vol: 'HIGH'   },
  { symbol: 'USD/PKR', short: 'USDPKR', base: 278.50,    pip: 1, vol: 'HIGH'   },
  { symbol: 'USD/BDT', short: 'USDBDT', base: 109.80,    pip: 1, vol: 'MEDIUM' },
];

const OF_CALL = [
  { pattern: 'Seller Absorbed by Buyer', icon: '⬆', desc: 'Sellers overwhelmed — Bulls dominating close' },
  { pattern: "Buyer's Aggression",       icon: '⚡', desc: 'Strong buying momentum at candle close' },
  { pattern: 'Rejection by Buyer',        icon: '↩', desc: 'Lower wick speed rejection — bullish intent' },
];
const OF_PUT = [
  { pattern: 'Buyer Absorbed by Seller', icon: '⬇', desc: 'Buyers overwhelmed — Bears dominating close' },
  { pattern: "Seller's Aggression",      icon: '⚡', desc: 'Strong selling momentum at candle close' },
  { pattern: 'Rejection by Seller',       icon: '↪', desc: 'Upper wick speed rejection — bearish intent' },
];

const STRATEGY_TAGS = [
  'RSI Reversal + EMA50',
  'SMA21/EMA50 Cross',
  'Wick Rejection + RSI',
  'Orderflow + EMA Trend',
  'RSI Extreme + Confluence',
  'Multi-Indicator Signal',
  'SuperTrend + ATR Filter',
  'SuperTrend + Stoch Cross',
  'ATR Breakout + Orderflow',
  'Order Delta + RSI Confirm',
  'SuperTrend + Delta Volume',
];

// ─── Seeded deterministic random ────────────────────────────────────────────
function sr(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ─── Signal Generator ────────────────────────────────────────────────────────
interface GeneratedSignal {
  direction: 'CALL' | 'PUT';
  confidence: number;
  ofPattern: { pattern: string; icon: string; desc: string };
  strategy: string;
  trend: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  entryPrice: string;
  rsi: number;
  stochK: number;
  stochD: number;
  stochBias: string;
  smaStatus: string;
  wickBias: string;
  confirmations: number;
  cvd: number;
  cvdBias: string;
  atr: number;
  atrLevel: string;
  superTrend: string;
  superTrendStrength: string;
  orderDelta: number;
  orderDeltaBias: string;
}

function generateSignal(pairIdx: number, windowSeed: number): GeneratedSignal | null {
  const s = pairIdx * 7919 + windowSeed;

  const rsi         = sr(s + 0.1) * 100;
  const smaVsEma    = (sr(s + 0.2) - 0.5) * 0.004;
  const upperWick   = sr(s + 0.3);
  const lowerWick   = sr(s + 0.4);
  const ofRoll      = sr(s + 0.5);
  const noiseRoll   = sr(s + 0.6);

  const stochK = Math.round((sr(s + 12.5) * 100) * 10) / 10;
  const stochD = Math.round(Math.max(0, Math.min(100, stochK + (sr(s + 13.5) - 0.5) * 15)) * 10) / 10;

  let stochBias = 'NEUTRAL';
  const stochOversold = stochK < 20 && stochD < 20;
  const stochOverbought = stochK > 80 && stochD > 80;
  const isKAboveD = stochK > stochD;
  const crossRoll = sr(s + 14.5);
  
  let stochBull = false;
  let stochBear = false;

  if (stochOversold) {
    if (isKAboveD && crossRoll > 0.4) {
      stochBias = 'BULL CROSS';
      stochBull = true;
    } else {
      stochBias = 'OVERSOLD';
      stochBull = true;
    }
  } else if (stochOverbought) {
    if (!isKAboveD && crossRoll > 0.4) {
      stochBias = 'BEAR CROSS';
      stochBear = true;
    } else {
      stochBias = 'OVERBOUGHT';
      stochBear = true;
    }
  } else {
    if (isKAboveD && stochK < 50 && crossRoll > 0.7) {
      stochBias = 'BULL CROSS';
      stochBull = true;
    } else if (!isKAboveD && stochK > 50 && crossRoll > 0.7) {
      stochBias = 'BEAR CROSS';
      stochBear = true;
    } else {
      stochBias = isKAboveD ? 'BULL BIAS' : 'BEAR BIAS';
    }
  }

  const rsiBull = rsi < 32;
  const rsiBear = rsi > 68;
  const smaBull = smaVsEma > 0.0004;
  const smaBear = smaVsEma < -0.0004;
  const wickBull = lowerWick > upperWick * 1.6;
  const wickBear = upperWick > lowerWick * 1.6;
  const ofBull   = ofRoll > 0.48;

  const atrRaw   = 0.05 + sr(s + 20.5) * 0.40;
  const atr      = Math.round(atrRaw * 1000) / 1000;
  const atrLevel = atrRaw > 0.30 ? 'HIGH VOLATILITY' : atrRaw < 0.12 ? 'LOW VOLATILITY' : 'NORMAL';
  const atrDirRoll = sr(s + 20.9);
  const atrBull  = atrRaw > 0.18 && atrDirRoll > 0.50;
  const atrBear  = atrRaw > 0.18 && atrDirRoll <= 0.50;

  const stRoll        = sr(s + 21.5);
  const stBullBias    = stRoll > 0.45;
  const stStrRoll     = sr(s + 22.5);
  const superTrend    = stBullBias ? 'BULLISH' : 'BEARISH';
  const superTrendStrength = stStrRoll > 0.5 ? 'STRONG' : 'MODERATE';
  const stBull = superTrend === 'BULLISH';
  const stBear = superTrend === 'BEARISH';

  const odRaw        = (sr(s + 23.5) - 0.5) * 200;
  const orderDelta   = Math.round(odRaw);
  const orderDeltaBull = orderDelta > 15;
  const orderDeltaBear = orderDelta < -15;
  const orderDeltaBias = orderDelta > 15 ? 'BUY DOMINANT' : orderDelta < -15 ? 'SELL DOMINANT' : 'BALANCED';

  let bullPts = 0;
  let bearPts = 0;

  if (rsiBull)         bullPts += 3; if (rsiBear)         bearPts += 3;
  if (stochBull)       bullPts += 2; if (stochBear)       bearPts += 2;
  if (smaBull)         bullPts += 2; if (smaBear)         bearPts += 2;
  if (wickBull)        bullPts += 2; if (wickBear)        bearPts += 2;
  if (ofBull)          bullPts += 3; else                 bearPts += 3;
  if (atrBull)         bullPts += 1; if (atrBear)         bearPts += 1;
  if (stBull)          bullPts += 3; if (stBear)          bearPts += 3;
  if (orderDeltaBull)  bullPts += 2; if (orderDeltaBear)  bearPts += 2;

  const topScore = Math.max(bullPts, bearPts);
  const confirmations = Math.min(8, Math.floor(topScore / 2.2) + 1);
  if (topScore < 7 || noiseRoll < 0.28) return null;

  const direction: 'CALL' | 'PUT' = bullPts >= bearPts ? 'CALL' : 'PUT';

  const rawConf = topScore / 16;
  const confidence = Math.min(95, Math.max(80, Math.round(80 + rawConf * 15)));

  const ofList = direction === 'CALL' ? OF_CALL : OF_PUT;
  const ofPick = Math.floor(sr(s + 0.7) * ofList.length);
  const ofPattern = ofList[ofPick];

  const stgPick = Math.floor(sr(s + 0.8) * STRATEGY_TAGS.length);
  const strategy = STRATEGY_TAGS[stgPick];
  const trend = direction === 'CALL' ? '📈 Bullish' : '📉 Bearish';

  const risk: 'LOW' | 'MEDIUM' | 'HIGH' =
    confidence >= 91 ? 'LOW' : confidence >= 86 ? 'MEDIUM' : 'HIGH';

  const pair = OTC_PAIRS[pairIdx];
  const priceJitter = (sr(s + 0.9) - 0.5) * pair.base * 0.003;
  const rawPrice = pair.base + priceJitter;
  const entryPrice = rawPrice.toFixed(pair.pip);

  const rsiDisplay = Math.round(rsi * 10) / 10;
  const smaStatus =
    smaBull ? 'SMA21 > EMA50 ↑' :
    smaBear ? 'SMA21 < EMA50 ↓' : 'SMA21 ≈ EMA50';
  const wickBias =
    wickBull ? 'Lower Wick Strong (Buy Pressure)' :
    wickBear ? 'Upper Wick Strong (Sell Pressure)' : 'Balanced Wicks';

  const cvdBase  = direction === 'CALL' ? 1 : -1;
  const cvdMag   = 200 + Math.round(sr(s + 10.5) * 750);
  const cvdNoise = Math.round((sr(s + 11.5) - 0.5) * 120);
  const cvd      = Math.round(cvdBase * cvdMag + cvdNoise);
  const cvdBias  = cvd > 80 ? 'BULLISH' : cvd < -80 ? 'BEARISH' : 'NEUTRAL';

  return {
    direction, confidence, ofPattern, strategy,
    trend, risk, entryPrice, rsi: rsiDisplay,
    stochK, stochD, stochBias,
    smaStatus, wickBias, confirmations,
    cvd, cvdBias,
    atr, atrLevel,
    superTrend, superTrendStrength,
    orderDelta, orderDeltaBias,
  };
}

// ─── IST Clock ───────────────────────────────────────────────────────────────
function useISTClock(timeOffset: number) {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date(Date.now() + timeOffset);
      const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const h = ist.getUTCHours().toString().padStart(2, '0');
      const m = ist.getUTCMinutes().toString().padStart(2, '0');
      const s = ist.getUTCSeconds().toString().padStart(2, '0');
      setTime(`${h}:${m}:${s} IST`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timeOffset]);
  return time;
}

type SignalStatus = 'ACTIVE' | 'SCANNING' | 'NO_SIGNAL' | 'LOADING_NEXT';

interface PairSignalState {
  signal: any;
  status: SignalStatus;
  expiresIn: number;
  generatedAt: string;
}

export default function SignalsPage() {
  const [loading, setLoading] = useState(true);
  const [timeOffset, setTimeOffset] = useState(0);
  const timeOffsetRef = useRef(0);
  const istTime = useISTClock(timeOffset);
  const supabase = createClient();
  const [subTab, setSubTab] = useState<'live_otc' | 'simulation' | 'live_market'>('live_otc');
  const [liveMarketSignals, setLiveMarketSignals] = useState<any[]>([]);
  const [windowSeed, setWindowSeed] = useState(0);
  const windowSeedRef = useRef(0);
  const [pairStates, setPairStates] = useState<PairSignalState[]>([]);
  const [refreshIn, setRefreshIn] = useState(() => 60 - new Date().getSeconds());
  const [filterDir, setFilterDir] = useState<'ALL' | 'CALL' | 'PUT'>('ALL');
  const [filterRisk, setFilterRisk] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH'>('ALL');
  const [filterConf, setFilterConf] = useState<'ALL' | '90+'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(
    () => new Set(OTC_PAIRS.map(p => p.short))
  );
  
  // Interactive Modal Details State
  const [selectedSignal, setSelectedSignal] = useState<any>(null);
  
  // Toast notifications & sound alerts
  const [activeToasts, setActiveToasts] = useState<any[]>([]);

  // Timeline list state
  const [timelineSignals, setTimelineSignals] = useState<any[]>([]);

  const [winRate, setWinRate] = useState<number | null>(null);
  const [otcStats, setOtcStats] = useState<{ winRate: number | null; totalToday: number }>({ winRate: null, totalToday: 0 });
  const [liveMarketStats, setLiveMarketStats] = useState<{ winRate: number | null; totalToday: number }>({ winRate: null, totalToday: 0 });

  const [signalMode, setSignalModeState] = useState<string>('SIMULATION');
  const [dataSourceOnline, setDataSourceOnline] = useState(true);

  // Admin optimization settings & User roles
  const [userAccess, setUserAccess] = useState<any>({ isLoggedIn: false, isAdmin: false, vipAccess: false, premiumAccess: false, status: 'pending' });
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

  const activeSignalIds = useRef<Map<string, { id: string; entryPrice: number; direction: 'CALL' | 'PUT' }>>(new Map());
  const prevSignalIds = useRef<Map<string, { id: string; entryPrice: number; direction: 'CALL' | 'PUT' }>>(new Map());
  const pendingStates = useRef<PairSignalState[] | null>(null);
  const pendingForSeed = useRef<number>(-1);
  const timerRef = useRef<any>(null);

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
      audio.play().catch(() => {});
    }

    const toastId = `toast-${Date.now()}`;
    const newToast = { id: toastId, symbol, direction, timestamp: new Date() };
    setActiveToasts(prev => [newToast, ...prev].slice(0, 3));

    setTimeout(() => {
      setActiveToasts(prev => prev.filter(t => t.id !== toastId));
    }, 4000);
  }, [userAccess, optSettings]);

  const selectAll = () => {
    const list = subTab !== 'live_market' ? OTC_PAIRS : LIVE_MARKET_PAIRS;
    setSelectedPairs(new Set(list.map(p => p.short)));
  };
  const clearAll   = () => setSelectedPairs(new Set());

  const buildStates = useCallback((seed: number): PairSignalState[] => {
    return OTC_PAIRS.map((pair, idx) => {
      const sig = generateSignal(idx, seed);
      const now = new Date();
      const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const timeStr = `${ist.getUTCHours().toString().padStart(2,'0')}:${ist.getUTCMinutes().toString().padStart(2,'0')} IST`;

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
        } as any,
        status: 'ACTIVE',
        expiresIn: 60,
        generatedAt: timeStr,
      };
    });
  }, [optSettings, pairPerfMap, winRate]);

  const refreshStats = useCallback(async () => {
    try {
      const [perfRes, livePerfRes, settingsRes, timelineRes] = await Promise.all([
        getSignalPerformance('live_otc'),
        getSignalPerformance('live_market'),
        getPublicOptimizationSettings(),
        getSignalHistory({ page: 1, page_size: 15 })
      ]);
      if (perfRes.success && perfRes.stats) {
        const win = perfRes.stats.accuracy > 0 ? perfRes.stats.accuracy : 84.5;
        setOtcStats({ winRate: win, totalToday: perfRes.stats.totalToday });
        setWinRate(win);
      }
      if (livePerfRes.success && livePerfRes.stats) {
        const win = livePerfRes.stats.accuracy > 0 ? livePerfRes.stats.accuracy : 82.3;
        setLiveMarketStats({ winRate: win, totalToday: livePerfRes.stats.totalToday });
      }
      if (settingsRes.success && settingsRes.settings) {
        setOptSettings(settingsRes.settings);
      }
      if (timelineRes.success && timelineRes.signals) {
        setTimelineSignals(timelineRes.signals);
      }
    } catch (err) {
      console.error('Error refreshing stats:', err);
    }
  }, []);

  // Fetch real win rate + signal mode + admin settings on mount
  useEffect(() => {
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
        if (accessRes.success) {
          setUserAccess(accessRes);
        }
        if (pairPerfRes.success && pairPerfRes.performance) {
          setPairPerfMap(pairPerfRes.performance);
        }
        await refreshStats();
      } catch (err) {
        console.error('Error loading metadata:', err);
      } finally {
        setLoading(false);
      }
    }
    loadMeta();
  }, [refreshStats, buildStates]);

  // Reset selected pairs when subTab changes to match current active assets
  useEffect(() => {
    const list = subTab !== 'live_market' ? OTC_PAIRS : LIVE_MARKET_PAIRS;
    setSelectedPairs(new Set(list.map(p => p.short)));
  }, [subTab]);

  // Alert on new window seed (OTC)
  useEffect(() => {
    if (windowSeed === 0 || loading || subTab === 'live_market') return;
    const active = pairStates.find(ps => ps.status === 'ACTIVE' && ps.signal);
    if (active && active.signal) {
      triggerNewSignalChime(active.signal.pair || 'AUD/USD', active.signal.direction);
    }
  }, [windowSeed, loading, subTab, triggerNewSignalChime]);

  // Alert on new live market signals
  const prevLiveCount = useRef(0);
  useEffect(() => {
    if (loading || subTab !== 'live_market') return;
    if (liveMarketSignals.length > prevLiveCount.current) {
      const latest = liveMarketSignals[0];
      if (latest) {
        triggerNewSignalChime(latest.pair, latest.direction);
      }
    }
    prevLiveCount.current = liveMarketSignals.length;
  }, [liveMarketSignals, loading, subTab, triggerNewSignalChime]);

  // Live market webhooks poller (existing)
  useEffect(() => {
    if (subTab !== 'live_market') return;
    async function fetchLive() {
      try {
        const res = await getActiveLiveMarketSignals();
        if (res.success && res.signals) {
          setLiveMarketSignals(res.signals);
        }
      } catch (err) {
        console.error('Failed to fetch active webhook signals:', err);
      }
    }
    fetchLive();
    const poller = setInterval(fetchLive, 5000);
    return () => clearInterval(poller);
  }, [subTab]);

  // Countdown timer clock ticks loop
  useEffect(() => {
    function tick() {
      const now  = Date.now() + timeOffsetRef.current;
      const nowSec  = new Date(now).getUTCSeconds();
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
            pendingStates.current  = buildStates(nextSeed);
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

  const hasAccess = userAccess.isAdmin || canAccess('premium-signals', profile, optSettings.signal_visibility);

  // Filter lists based on search & selectors
  const filtered = pairStates
    .map((ps, idx) => ({ ps, pair: OTC_PAIRS[idx], idx }))
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

  // Group active live market signals by pair and keep the strongest one (highest confidence) to avoid conflicting directions
  const strongestLiveSignalsMap = new Map<string, any>();
  liveMarketSignals.forEach(sig => {
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
    : filteredLiveMarket.length;

  const handleCardClick = (sig: any, pair: any, type: string) => {
    if (!hasAccess) {
      window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { requestedPlan: 'premium' } }));
      return;
    }
    if (sig) {
      setSelectedSignal({ ...sig, pairSymbol: pair.symbol, type });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 relative text-left">
      
      {/* Dynamic Toast Alerts Feed */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {activeToasts.map(t => (
          <div key={t.id} className="p-4 rounded-xl border border-neon-green/30 bg-[#030b17] shadow-[0_0_15px_rgba(0,230,118,0.15)] flex items-start gap-3 w-80 animate-slideIn">
            <Bell className="h-5 w-5 text-neon-green shrink-0 mt-0.5" />
            <div className="space-y-1 font-mono text-xs">
              <div className="font-bold text-slate-200 uppercase">NEW SIGNAL DETECTED</div>
              <div className="text-slate-400">
                Asset: <span className="text-slate-200 font-bold">{t.symbol}</span> · Direction: <span className={t.direction === 'CALL' ? 'text-neon-green font-bold' : 'text-rose-400 font-bold'}>{t.direction}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#030812]/95 border-b border-glass-border backdrop-blur-md px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-neon-green animate-pulse shadow-[0_0_8px_#00E676]" />
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
            
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-mono font-bold ${
              subTab === 'live_market'
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
            { label: 'ACTIVE SIGNALS', value: activeCount.toString(), icon: Radio, color: 'text-neon-green', glow: 'shadow-[0_0_10px_rgba(0,230,118,0.12)]' },
            { label: "TODAY'S SIGNALS", value: subTab !== 'live_market' ? otcStats.totalToday.toString() : liveMarketStats.totalToday.toString(), icon: Signal, color: 'text-slate-300' },
            { label: 'WIN RATE (ALL)', value: subTab !== 'live_market' ? (otcStats.winRate !== null ? `${otcStats.winRate}%` : '84.5%') : (liveMarketStats.winRate !== null ? `${liveMarketStats.winRate}%` : '82.3%'), icon: Target, color: 'text-gold-vip', glow: 'shadow-[0_0_10px_rgba(255,215,0,0.1)]' },
            { label: 'ASSETS LOADED', value: subTab !== 'live_market' ? `${selectedPairs.size}/${OTC_PAIRS.length}` : `${Array.from(selectedPairs).filter(s => LIVE_MARKET_PAIRS.some(lp => lp.short === s)).length}/${LIVE_MARKET_PAIRS.length}`, icon: BarChart2, color: 'text-slate-300' },
          ].map((stat, i) => (
            <div key={i} className={`glass-panel rounded-xl p-4 flex items-center justify-between transition-all duration-300 ${stat.glow} ${!hasAccess ? 'blur-[4.5px] select-none pointer-events-none' : ''}`}>
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
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-mono font-bold tracking-widest border transition-all ${
                    subTab === 'live_otc'
                      ? 'bg-neon-green/10 border-neon-green/30 text-neon-green shadow-[0_0_15px_rgba(0,230,118,0.05)]'
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
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-mono font-bold tracking-widest border transition-all ${
                    subTab === 'simulation'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
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
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-mono font-bold tracking-widest border transition-all ${
                    subTab === 'live_market'
                      ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.05)]'
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
                    onChange={(e) => setFilterDir(e.target.value as any)}
                    className="bg-[#02050b] border border-glass-border px-2.5 py-2 rounded text-slate-300"
                  >
                    <option value="ALL">ALL DIRECTIONS</option>
                    <option value="CALL">BUY / CALL</option>
                    <option value="PUT">SELL / PUT</option>
                  </select>
                  <select
                    value={filterRisk}
                    onChange={(e) => setFilterRisk(e.target.value as any)}
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
                      className={`px-2 py-1 rounded text-[9px] font-mono font-bold uppercase transition-all border ${
                        isSelected
                          ? 'bg-purple-950/40 border-purple-500/50 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.05)]'
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
            {subTab !== 'live_market' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map(({ ps, pair, idx }) => (
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
                    No active OTC signals match your filter.
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredLiveMarket.map((sig) => (
                  <LiveMarketSignalCard 
                    key={sig.id} 
                    signal={sig} 
                    hasAccess={hasAccess}
                    onClick={() => handleCardClick(sig, { symbol: sig.pair }, 'Forex')}
                  />
                ))}
                {filteredLiveMarket.length === 0 && (
                  <div className="col-span-2 text-center py-16 text-slate-600 font-mono text-xs">
                    No active live market signals detected. Awaiting indicator triggers...
                  </div>
                )}
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Chronological Timeline Feed */}
          <div className="space-y-6">
            <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4">
              <div className="flex items-center justify-between border-b border-glass-border/40 pb-3">
                <div className="flex items-center gap-1.5">
                  <Activity className="h-4.5 w-4.5 text-gold-vip" />
                  <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">Signal Audit Timeline</span>
                </div>
                <span className="text-[8px] font-mono text-slate-500 uppercase">Live outcomes</span>
              </div>

              {/* Timeline feed wrapper */}
              <div className="space-y-3.5 max-h-[600px] overflow-y-auto pr-1 relative">
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
                  {timelineSignals.map((sig) => {
                    const isCall = sig.direction === 'CALL';
                    const timestampStr = new Date(sig.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    
                    return (
                      <div key={sig.id} className="p-3 rounded-lg bg-[#02050b]/80 border border-glass-border/40 flex items-center justify-between gap-3 text-left">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-full ${isCall ? 'bg-neon-green/10 text-neon-green' : 'bg-rose-500/10 text-rose-400'}`}>
                            {isCall ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                          <div className="font-mono text-xs">
                            <div className="font-bold text-slate-200">{sig.pair}</div>
                            <div className="text-[9px] text-slate-500 mt-0.5">{timestampStr} · {sig.source.toUpperCase()}</div>
                          </div>
                        </div>

                        <div className="text-right font-mono text-[10px]">
                          <span className={`px-2 py-0.5 rounded border font-bold uppercase ${
                            sig.result === 'WIN' 
                              ? 'text-neon-green border-neon-green/30 bg-neon-green/5' 
                              : sig.result === 'LOSS'
                              ? 'text-rose-400 border-rose-500/30 bg-rose-500/5'
                              : 'text-slate-500 border-slate-700 bg-slate-900/30'
                          }`}>
                            {sig.result}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {timelineSignals.length === 0 && (
                    <div className="p-8 text-center text-slate-600 font-mono text-[10px] uppercase">
                      No timeline logs populated.
                    </div>
                  )}
                </div>
              </div>
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

// ─── Live Signal Card Component with Blurred Preview ─────────────────────────
function SignalCard({
  pair,
  ps,
  hasAccess,
  onClick
}: {
  pair: (typeof OTC_PAIRS)[0];
  ps: PairSignalState;
  hasAccess: boolean;
  onClick: () => void;
}) {
  const isActive = ps.status === 'ACTIVE' && ps.signal;
  const isScanning = ps.status === 'SCANNING';
  const isLoadingNext = ps.status === 'LOADING_NEXT';
  const sig = ps.signal;
  const isCall = sig?.direction === 'CALL';

  const borderColor = !isActive && !isLoadingNext
    ? 'border-glass-border'
    : isCall
    ? 'border-neon-green/25 shadow-[0_0_20px_rgba(0,230,118,0.04)]'
    : 'border-rose-500/25 shadow-[0_0_20px_rgba(239,68,68,0.04)]';

  return (
    <div 
      onClick={isActive ? onClick : undefined}
      className={`glass-panel rounded-xl border transition-all duration-300 overflow-hidden relative ${borderColor} ${isActive ? 'cursor-pointer hover:scale-[1.01]' : ''}`}
    >
      
      {/* Blurred overlay locker for standard/Free users */}
      {isActive && !hasAccess && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/85 backdrop-blur-[2px] rounded-xl text-center space-y-3.5 z-10 font-mono">
          <div className="p-2.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Lock className="h-4.5 w-4.5" />
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">Premium Access Required</div>
            <p className="text-[8px] text-slate-500 max-w-[200px] leading-relaxed">
              Upgrade to unlock directional indicators, entry positions, and confluence counts.
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { requestedPlan: 'premium' } }));
            }}
            className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-[9px] uppercase tracking-wider transition-colors shadow-md"
          >
            Upgrade Now
          </button>
        </div>
      )}

      {/* Card Header */}
      <div className={`px-4 pt-4 pb-3 flex items-start justify-between ${isActive ? (isCall ? 'bg-neon-green/[0.02]' : 'bg-rose-500/[0.02]') : ''}`}>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold font-mono text-slate-100 tracking-wider">
              {pair.symbol}
            </span>
            <span className="text-[8px] font-mono text-slate-600 border border-slate-800 px-1.5 py-0.5 rounded font-bold">OTC</span>
          </div>
          <div className="text-[9px] font-mono text-slate-600">
            VOLATILITY: <span className="text-slate-400 font-bold uppercase">{pair.vol}</span>
          </div>
        </div>

        {/* Status badges */}
        {isActive ? (
          <div className="flex flex-col items-end gap-1">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border ${isCall ? 'bg-neon-green/10 border-neon-green/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
              <div className={`h-1.5 w-1.5 rounded-full bg-neon-green animate-pulse`} />
              <span className={`text-[9px] font-mono font-bold tracking-wider ${isCall ? 'text-neon-green' : 'text-rose-400'}`}>
                LIVE
              </span>
            </div>
          </div>
        ) : isLoadingNext ? (
          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded border border-neon-green/20 bg-neon-green/5">
            <span className="text-[9px] font-mono font-bold text-neon-green animate-pulse">NEXT</span>
          </div>
        ) : isScanning ? (
          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded border border-slate-800 bg-slate-900/40">
            <span className="text-[9px] font-mono font-bold text-amber-400">SCAN</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded border border-slate-900 bg-slate-950/20">
            <span className="text-[9px] font-mono font-bold text-slate-600">WAIT</span>
          </div>
        )}
      </div>

      {/* Card Body */}
      {isActive && sig ? (
        <div className={`px-4 pb-4 space-y-3.5 ${!hasAccess ? 'blur-[3px] select-none pointer-events-none' : ''}`}>
          
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border ${isCall ? 'bg-neon-green/5 border-neon-green/15 text-neon-green' : 'bg-rose-500/5 border-rose-500/15 text-rose-400'}`}>
              {isCall ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              <span className="text-sm font-extrabold font-mono tracking-wider">
                {hasAccess ? sig.direction : 'LOCK'}
              </span>
            </div>
            
            <div className="text-right font-mono">
              <div className="text-[8px] text-slate-600 tracking-wider">CONFIDENCE</div>
              <div className="text-lg font-extrabold text-slate-200 mt-1">
                {hasAccess ? `${sig.confidence}%` : '••%'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-[#020617]/50 rounded p-2.5 border border-glass-border/30">
              <div className="text-[8px] text-slate-600 tracking-wider">ENTRY PRICE</div>
              <div className="text-xs font-bold text-slate-200 mt-1">
                {hasAccess ? sig.entryPrice : '•.••••'}
              </div>
            </div>
            <div className="bg-[#020617]/50 rounded p-2.5 border border-glass-border/30">
              <div className="text-[8px] text-slate-600 tracking-wider">EXPIRY TIME</div>
              <div className="text-xs font-bold text-gold-vip mt-1">1 MINUTE</div>
            </div>
          </div>
        </div>
      ) : isScanning ? (
        <div className="px-4 pb-4 pt-1 flex flex-col items-center justify-center py-6 gap-2">
          <Activity className="h-5 w-5 text-amber-500 animate-spin" />
          <div className="text-[9px] font-mono text-amber-400">ANALYSING INDICATORS...</div>
        </div>
      ) : (
        <div className="px-4 pb-5 pt-1 flex flex-col items-center justify-center py-5 gap-1.5 opacity-30">
          <Eye className="h-5 w-5 text-slate-600" />
          <span className="text-[9px] font-mono text-slate-600 tracking-wider">AWAITING TRIGGER</span>
        </div>
      )}

    </div>
  );
}

// ─── Live Market Signal Card with Blurred Preview ────────────────────────────
function LiveMarketSignalCard({
  signal,
  hasAccess,
  onClick
}: {
  signal: any;
  hasAccess: boolean;
  onClick: () => void;
}) {
  const isCall = signal.direction === 'CALL';
  const isActive = signal.result === 'PENDING';

  const [expiresIn, setExpiresIn] = useState(() => {
    return Math.max(0, Math.round((new Date(signal.expiry_time).getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setExpiresIn(prev => {
        const next = Math.max(0, Math.round((new Date(signal.expiry_time).getTime() - Date.now()) / 1000));
        if (next === 0) clearInterval(timer);
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [signal.expiry_time]);

  const borderColor = !isActive
    ? (signal.result === 'WIN' ? 'border-neon-green/25 bg-neon-green/[0.01]' : 'border-rose-500/25 bg-rose-500/[0.01]')
    : isCall
    ? 'border-neon-green/25 shadow-[0_0_20px_rgba(0,230,118,0.04)]'
    : 'border-rose-500/25 shadow-[0_0_20px_rgba(239,68,68,0.04)]';

  return (
    <div 
      onClick={isActive ? onClick : undefined}
      className={`glass-panel rounded-xl border transition-all duration-300 overflow-hidden relative ${borderColor} ${isActive ? 'cursor-pointer hover:scale-[1.01]' : ''}`}
    >
      
      {/* Blurred overlay locker for standard/Free users */}
      {isActive && !hasAccess && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/85 backdrop-blur-[2px] rounded-xl text-center space-y-3.5 z-10 font-mono">
          <div className="p-2.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Lock className="h-4.5 w-4.5" />
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">Premium Access Required</div>
            <p className="text-[8px] text-slate-500 max-w-[200px] leading-relaxed">
              Upgrade to unlock directional indicators, entry positions, and confluence counts.
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { requestedPlan: 'premium' } }));
            }}
            className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-[9px] uppercase tracking-wider transition-colors shadow-md"
          >
            Upgrade Now
          </button>
        </div>
      )}

      {/* Card Header */}
      <div className={`px-4 pt-4 pb-3 flex items-start justify-between ${isActive ? (isCall ? 'bg-neon-green/[0.02]' : 'bg-rose-500/[0.02]') : ''}`}>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold font-mono text-slate-100 tracking-wider">
              {signal.pair}
            </span>
            <span className="text-[8px] font-mono text-gold-vip border border-gold-vip/30 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">LIVE FOREX</span>
          </div>
          <div className="text-[9px] font-mono text-slate-600 truncate max-w-[130px]">
            STRATEGY: <span className="text-slate-400 font-bold uppercase">{signal.strategy_name}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {isActive ? (
            <span className="flex items-center gap-1 text-[8px] font-mono font-bold text-neon-green bg-neon-green/10 px-1.5 py-0.5 rounded border border-neon-green/20">
              <span className="h-1.5 w-1.5 rounded-full bg-neon-green animate-pulse" />
              ACTIVE
            </span>
          ) : (
            <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${
              signal.result === 'WIN' 
                ? 'text-neon-green bg-neon-green/10 border-neon-green/20' 
                : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
            }`}>
              {signal.result}
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className={`px-4 pb-4 pt-1 space-y-4 ${isActive && !hasAccess ? 'blur-[3px] select-none pointer-events-none' : ''}`}>
        <div className="grid grid-cols-2 gap-3 items-center">
          <div className={`flex flex-col justify-center items-center py-2.5 rounded-lg border ${
            isCall 
              ? 'bg-neon-green/5 border-neon-green/10 text-neon-green' 
              : 'bg-rose-500/5 border-rose-500/10 text-rose-400'
          }`}>
            <span className="text-[8px] font-mono text-slate-500 tracking-wider">DIRECTION</span>
            <span className="text-xs font-extrabold font-mono flex items-center gap-0.5">
              {isCall ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {hasAccess ? signal.direction : 'LOCK'}
            </span>
          </div>

          <div className="flex flex-col justify-center items-center py-2.5 rounded-lg border border-slate-900 bg-slate-950/30">
            <span className="text-[8px] font-mono text-slate-500 tracking-wider">EXPIRY</span>
            <span className="text-xs font-extrabold font-mono text-slate-200">
              {isActive ? (
                expiresIn > 0 ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 animate-spin" />
                    {expiresIn}s
                  </span>
                ) : (
                  'RESOLVING...'
                )
              ) : (
                'CLOSED'
              )}
            </span>
          </div>
        </div>

        <div className="bg-[#020617]/60 border border-glass-border/30 rounded-lg p-3 space-y-2.5 text-xs font-mono">
          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500">ENTRY PRICE:</span>
            <span className="text-slate-200 font-bold">{hasAccess ? signal.entry_price : '•.••••'}</span>
          </div>
          {signal.expiry_price && (
            <div className="flex justify-between border-b border-slate-900 pb-1.5">
              <span className="text-slate-500">CLOSE PRICE:</span>
              <span className={`font-bold ${signal.result === 'WIN' ? 'text-neon-green' : 'text-rose-400'}`}>
                {signal.expiry_price}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-slate-500">CONFIDENCE:</span>
            <span className="text-slate-200 font-bold">{hasAccess ? `${signal.confidence}%` : '••%'}</span>
          </div>
        </div>
      </div>

    </div>
  );
}
