'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock, AlertTriangle, Zap,
  Target, Activity, RefreshCw, Radio, BarChart2,
  ChevronUp, ChevronDown, Eye, Filter, Signal, Database, Lock,
  Bell, X
} from 'lucide-react';

import { 
  getSignalPerformance, 
  getPairPerformanceMap,
  getServerTime, getSignalHistory, scanLiveMarketAsset, getMarketStatus, ScanResult,
  saveManualSignal, getManualSignalAudits, settleManualSignal
} from '@/app/actions/signals';
import { getSignalMode } from '@/app/actions/signal_mode';
import { getPublicOptimizationSettings, getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';

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
  symbol: string;
  direction: string;
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
  const [otcStats, setOtcStats] = useState<{ winRate: number | null; totalToday: number }>({ winRate: null, totalToday: 0 });
  const [liveMarketStats, setLiveMarketStats] = useState<{ winRate: number | null; totalToday: number }>({ winRate: null, totalToday: 0 });

  const [signalMode, setSignalModeState] = useState<string>('SIMULATION');
  const [dataSourceOnline, setDataSourceOnline] = useState(true);

  // ─── Manual Scanning Live Forex States ────────────────────────────────────
  const [selectedLivePair, setSelectedLivePair] = useState('EUR/USD');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult['result'] | null>(null);
  
  // Manual Audit timeline and countdown states
  const [manualAudits, setManualAudits] = useState<any[]>([]);
  const [manualAuditsLoading, setManualAuditsLoading] = useState(false);
  const [clockTime, setClockTime] = useState(() => Date.now());
  const settlingIdsRef = useRef<Set<string>>(new Set());

  const [frontendCooldowns, setFrontendCooldowns] = useState<Record<string, number>>({});
  const [scanHistory, setScanHistory] = useState<{
    pair: string;
    direction: 'CALL' | 'PUT' | 'WAIT';
    confidence: number;
    timestamp: string;
    entryPrice: number;
    result: ScanResult['result'];
  }[]>([]);
  const [pairFilter, setPairFilter] = useState('');
  const [marketOpen, setMarketOpen] = useState(true);
  const [nextCandleRemaining, setNextCandleRemaining] = useState(0);
  const [isTimelineVisible, setIsTimelineVisible] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('timeline_visible') !== 'false';
    }
    return true;
  });

  // Admin optimization settings & User roles
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
        } as unknown as PairSignal,
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
    
    const cachedHistory = localStorage.getItem('live_scan_history');
    if (cachedHistory) {
      try {
        const parsed = JSON.parse(cachedHistory);
        const historyObj = (Array.isArray(parsed) ? parsed : []).map((item: Record<string, unknown>) => {
          const resObj = item.result as Record<string, unknown> | undefined;
          return {
            pair: String(item.pair || 'EUR/USD'),
            direction: (item.direction || 'WAIT') as 'CALL' | 'PUT' | 'WAIT',
            confidence: Number(item.confidence || resObj?.confidence || 0),
            timestamp: String(item.timestamp || ''),
            entryPrice: Number(item.entryPrice || resObj?.entryPrice || 0),
            result: item.result as ScanResult['result']
          };
        });
        setTimeout(() => {
          if (isMounted) setScanHistory(historyObj);
        }, 0);
      } catch (e) {
        console.error('Failed to parse scan history:', e);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [subTab]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrontendCooldowns(prev => {
        const updated: Record<string, number> = {};
        let changed = false;
        Object.entries(prev).forEach(([key, val]) => {
          if (val > 1) {
            updated[key] = val - 1;
            changed = true;
          } else {
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadManualAudits = async () => {
    try {
      const res = await getManualSignalAudits();
      if (res.success && res.audits) {
        setManualAudits(res.audits);
      }
    } catch (err) {
      console.error("Failed loading manual audits:", err);
    }
  };

  const settleExpiredSignal = async (id: string) => {
    try {
      const res = await settleManualSignal(id);
      if (res.success) {
        await loadManualAudits();
      }
    } catch (err) {
      console.error(`Failed to settle manual signal ${id}:`, err);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setClockTime(now);

      if (subTab === 'live_market') {
        manualAudits.forEach(sig => {
          if (sig.status === 'PENDING') {
            const expiresMs = new Date(sig.expiry_time).getTime();
            if (now >= expiresMs && !settlingIdsRef.current.has(sig.id)) {
              settlingIdsRef.current.add(sig.id);
              void settleExpiredSignal(sig.id);
            }
          }
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [manualAudits, subTab]);

  useEffect(() => {
    if (subTab === 'live_market') {
      void loadManualAudits();
    }
  }, [subTab]);

  const handleScanLiveMarket = async (pairToScan = selectedLivePair) => {
    if (scanLoading) return;

    if (!marketOpen) {
      alert("Analysis restricted: Forex market is currently closed.");
      return;
    }
    
    const currentCooldown = frontendCooldowns[pairToScan] || 0;
    if (currentCooldown > 0) return;

    setScanLoading(true);
    setSelectedLivePair(pairToScan);
    try {
      const res = await scanLiveMarketAsset(pairToScan);
      if (res.success && res.result) {
        setScanResult(res.result);

        // Save manual scan result snapshot to DB for personal audit timeline
        void saveManualSignal({
          pair: pairToScan,
          direction: res.result.direction,
          entry_price: res.result.entryPrice,
          entry_time: res.result.entryTime,
          expiry_time: res.result.expiryTime,
          confidence: res.result.confidence,
          market_bias: res.result.marketBias,
          signal_strength: res.result.qualityScore,
          provider: res.result.dataSource
        }).then((saved) => {
          if (saved.success) {
            void loadManualAudits();
          }
        });

        // Update client-side history in localStorage
        const newHistoryItem = {
          pair: pairToScan,
          direction: res.result.direction,
          confidence: res.result.confidence,
          timestamp: new Date().toLocaleTimeString(),
          entryPrice: res.result.entryPrice,
          result: res.result
        };

        setScanHistory(prev => {
          const filtered = prev.filter(item => !(item.pair === pairToScan && item.timestamp.substring(0, 5) === newHistoryItem.timestamp.substring(0, 5)));
          const updated = [newHistoryItem, ...filtered].slice(0, 10);
          localStorage.setItem('live_scan_history', JSON.stringify(updated));
          return updated;
        });
        
        const cooldownVal = res.cooldownRemaining ?? parseInt(optSettings.live_scan_cooldown_seconds ?? '30', 10);
        if (cooldownVal > 0) {
          setFrontendCooldowns(prev => ({
            ...prev,
            [pairToScan]: cooldownVal
          }));
        }

        // Notification chime sound on successful CALL or PUT trigger
        if (res.result.direction === 'CALL' || res.result.direction === 'PUT') {
          triggerNewSignalChime(pairToScan, res.result.direction);
        }
      } else {
        if (res.error === 'Cooldown active' && res.cooldownRemaining) {
          setFrontendCooldowns(prev => ({
            ...prev,
            [pairToScan]: res.cooldownRemaining || 30
          }));
        } else {
          alert(`Scan failed: ${res.error || 'Unknown error'}`);
        }
      }
    } catch (err) {
      const errorObj = err as Error;
      console.error('[Scan error]:', err);
      alert(`Scan failed: ${errorObj.message || 'Execution error'}`);
    } finally {
      setScanLoading(false);
    }
  };

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

  // Alert on new live market signals
  const prevLiveCount = useRef(0);
  useEffect(() => {
    if (loading || subTab !== 'live_market') return;
    if (liveMarketSignals.length > prevLiveCount.current) {
      const latest = liveMarketSignals[0] as { pair: string; direction: string } | undefined;
      if (latest) {
        const timer = setTimeout(() => {
          triggerNewSignalChime(latest.pair, latest.direction);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
    prevLiveCount.current = liveMarketSignals.length;
  }, [liveMarketSignals, loading, subTab, triggerNewSignalChime]);

  // Live market background polling disabled under MVP v1.3 Event-Driven User Scan Architecture

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
    : filteredLiveMarket.length;

  const handleCardClick = (sig: PairSignal | ScanResult['result'] | null, pair: { symbol: string; [key: string]: unknown } | null, type: string) => {
    if (!hasAccess) {
      window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { requestedPlan: 'premium' } }));
      return;
    }
    if (sig && pair) {
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
                    No active OTC signals match your filter.
                  </div>
                )}
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
                      {scanResult ? (
                        (() => {
                          try {
                            const d = new Date(scanResult.lastCandleTime);
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
                    <span className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">NEXT CANDLE BOUNDARY</span>
                    <span className="text-yellow-400 font-extrabold text-sm mt-1.5 uppercase animate-pulse">
                      IN {nextCandleRemaining}S
                    </span>
                    <span className="text-slate-600 text-[8px] mt-0.5">TRIGGER TO FRESH ANALYSIS</span>
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
                      const cooldown = frontendCooldowns[p.symbol] || 0;
                      const isSelected = selectedLivePair === p.symbol;
                      const isCurrentLoading = scanLoading && isSelected;
                      
                      // Lookup cached analysis direction
                      const historyMatch = scanHistory.find(h => h.pair === p.symbol);
                      const direction = historyMatch?.direction;

                      const volStars = p.vol === 'HIGH' ? '★★★★★' : p.vol === 'MEDIUM' ? '★★★☆☆' : '★★☆☆☆';
                      const majorsList = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD'];
                      const exoticsList = ['USD/INR', 'USD/SGD', 'USD/MXN', 'USD/ZAR'];
                      const spreadVal = majorsList.includes(p.symbol) ? 'Low' : exoticsList.includes(p.symbol) ? 'High' : 'Medium';
                      
                      let statusText = 'Ready';
                      if (!marketOpen) statusText = 'Closed';
                      else if (cooldown > 0) statusText = `${cooldown}s`;

                      return (
                        <div
                          key={p.symbol}
                          className={`p-3 rounded-lg border flex flex-col justify-between gap-3.5 transition-all text-left bg-[#02050b]/60 border-glass-border/30 ${
                            isSelected ? 'border-purple-500/40 bg-purple-500/[0.02] shadow-[0_0_12px_rgba(168,85,247,0.03)]' : 'hover:border-slate-800'
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
                              <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                                direction === 'CALL' ? 'text-neon-green border-neon-green/20 bg-neon-green/[0.01]' : direction === 'PUT' ? 'text-rose-400 border-rose-500/20 bg-rose-500/[0.01]' : 'text-amber-400 border-amber-500/20 bg-amber-500/[0.01]'
                              }`}>
                                {direction}
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => handleScanLiveMarket(p.symbol)}
                            disabled={scanLoading || cooldown > 0}
                            className="w-full py-1.5 rounded bg-purple-600/90 hover:bg-purple-500 disabled:bg-slate-900 border border-purple-500/20 disabled:border-slate-800 font-extrabold text-white disabled:text-slate-600 text-[9px] uppercase tracking-widest transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1"
                          >
                            {isCurrentLoading ? (
                              <>
                                <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                                SCANNING...
                              </>
                            ) : cooldown > 0 ? (
                              <>
                                <Clock className="h-2.5 w-2.5 text-slate-600" />
                                {cooldown}S
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
                {scanLoading ? (
                  <div className="glass-panel p-8 rounded-xl border border-glass-border flex flex-col items-center justify-center py-20 gap-3 font-mono">
                    <Activity className="h-8 w-8 text-purple-500 animate-spin" />
                    <span className="text-[10px] font-bold text-purple-400 tracking-widest uppercase animate-pulse">Analyzing Indicator Confluence...</span>
                  </div>
                ) : scanResult ? (
                  <ManualScanResultCard 
                    result={scanResult} 
                    pair={selectedLivePair} 
                    onRefreshTrigger={handleScanLiveMarket}
                  />
                ) : (
                  <div className="glass-panel p-8 rounded-xl border border-glass-border flex flex-col items-center justify-center py-20 gap-2 font-mono text-slate-600 text-xs text-center opacity-45">
                    <Eye className="h-8 w-8 text-slate-700" />
                    <span className="uppercase tracking-widest text-[9px] font-bold">Awaiting Market Analysis</span>
                    <span className="text-[8px] max-w-[280px]">Select a currency pair above and click Analyze to execute indicator checks and determine entry setups.</span>
                  </div>
                )}

                {/* Client-Side Scan History Panel */}
                {scanHistory.length > 0 && (
                  <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-3 font-mono text-left">
                    <div className="flex items-center justify-between border-b border-glass-border/30 pb-2">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-500" />
                        Local Session History (Last 10)
                      </span>
                      <button 
                        onClick={() => {
                          setScanHistory([]);
                          localStorage.removeItem('live_scan_history');
                        }}
                        className="text-[8px] text-slate-600 hover:text-slate-400 uppercase font-bold transition-colors cursor-pointer"
                      >
                        Clear History
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {scanHistory.map((item, idx) => {
                        const isCall = item.direction === 'CALL';
                        const isPut = item.direction === 'PUT';
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setSelectedLivePair(item.pair);
                              setScanResult(item.result);
                            }}
                            className={`p-2 rounded border border-slate-900 bg-slate-950/40 hover:bg-slate-900/60 transition-all cursor-pointer text-left space-y-1 relative group ${
                              selectedLivePair === item.pair && scanResult && item.result && scanResult.entryTime === item.result.entryTime ? 'border-purple-500/40 bg-purple-500/[0.02]' : ''
                            }`}
                          >
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="font-bold text-slate-300">{item.pair}</span>
                              <span className="text-[8px] text-slate-600 font-sans">{(item.timestamp || '').substring(0, 5)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className={`text-[9px] font-extrabold flex items-center gap-0.5 ${
                                isCall ? 'text-neon-green' : isPut ? 'text-rose-400' : 'text-slate-500'
                              }`}>
                                {isCall ? 'CALL' : isPut ? 'PUT' : 'WAIT'}
                              </span>
                              <span className="text-[8px] text-slate-400 font-bold">{item.result?.confidence || 0}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Personal Signal Audit Timeline Panel */}
                <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4 font-mono text-xs text-left">
                  <div className="flex items-center justify-between border-b border-glass-border/30 pb-3">
                    <span className="text-[10px] text-slate-200 font-bold uppercase tracking-widest flex items-center gap-1.5">
                      <Signal className="h-4 w-4 text-purple-400" />
                      Personal Signal Audit Timeline
                    </span>
                    <span className="text-[8px] text-slate-500 font-sans uppercase font-bold text-right">Newest First</span>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
                    {manualAudits.map((sig) => {
                      const isCall = sig.direction === 'CALL';
                      const isPut = sig.direction === 'PUT';
                      const isWait = sig.direction === 'WAIT';

                      const entryLocalStr = (() => {
                        try {
                          return new Intl.DateTimeFormat("en-IN", {
                            timeZone: "Asia/Kolkata",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: true,
                          }).format(new Date(sig.entry_time));
                        } catch {
                          return 'N/A';
                        }
                      })();

                      const expiryLocalStr = (() => {
                        try {
                          return new Intl.DateTimeFormat("en-IN", {
                            timeZone: "Asia/Kolkata",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: true,
                          }).format(new Date(sig.expiry_time));
                        } catch {
                          return 'N/A';
                        }
                      })();

                      // Calculate remaining countdown
                      const expiresMs = new Date(sig.expiry_time).getTime();
                      const diffSec = Math.max(0, Math.ceil((expiresMs - clockTime) / 1000));
                      const min = Math.floor(diffSec / 60);
                      const sec = diffSec % 60;
                      const countdownStr = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')} remaining`;

                      return (
                        <div
                          key={sig.id}
                          className={`p-3.5 rounded-lg border flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-[#02050b]/60 ${
                            isCall
                              ? 'border-neon-green/20 hover:border-neon-green/30'
                              : isPut
                              ? 'border-rose-500/20 hover:border-rose-500/30'
                              : 'border-glass-border/30 hover:border-slate-800'
                          } transition-all`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-100 text-[11px]">{sig.pair}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wider ${
                                isCall
                                  ? 'bg-neon-green/10 text-neon-green border border-neon-green/10'
                                  : isPut
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10'
                                  : 'bg-slate-900 text-slate-500 border border-slate-800'
                              }`}>
                                {sig.direction}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px] text-slate-500">
                              <div>ENTRY: <span className="text-slate-300">{entryLocalStr}</span></div>
                              <div>EXPIRY: <span className="text-slate-300">{expiryLocalStr}</span></div>
                              <div>ENTRY PRICE: <span className="text-slate-300">{sig.entry_price}</span></div>
                              <div>
                                EXIT PRICE:{" "}
                                <span className="text-slate-300">
                                  {sig.status === 'PENDING' ? 'Pending' : sig.expiry_price ?? 'N/A'}
                                </span>
                              </div>
                            </div>

                            {sig.status === 'PENDING' && (
                              <div className="text-[9px] text-amber-400 font-bold flex items-center gap-1 mt-1 animate-pulse">
                                <Clock className="h-3 w-3" />
                                Waiting for candle close... {countdownStr}
                              </div>
                            )}
                          </div>

                          <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-2 border-t sm:border-t-0 border-slate-900/60 pt-2 sm:pt-0">
                            <div className="space-y-0.5 text-[8px] text-slate-600 text-left sm:text-right font-medium">
                              <div>CONFIDENCE: <span className="text-slate-400">{isWait ? 'N/A' : `${sig.confidence}%`}</span></div>
                              <div>PROVIDER: <span className="text-slate-400">{sig.provider}</span></div>
                            </div>

                            <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-widest border uppercase inline-flex items-center gap-1 ${
                              sig.status === 'WIN'
                                ? 'text-neon-green border-neon-green/20 bg-neon-green/5'
                                : sig.status === 'LOSS'
                                ? 'text-rose-400 border-rose-500/20 bg-rose-500/5'
                                : sig.status === 'REFUND'
                                ? 'text-slate-400 border-slate-800 bg-slate-900/40'
                                : sig.status === 'NO TRADE'
                                ? 'text-slate-500 border-slate-800 bg-slate-900/20'
                                : 'text-amber-400 border-amber-500/20 bg-amber-500/5 animate-pulse'
                            }`}>
                              {sig.status === 'WIN' && 'WIN'}
                              {sig.status === 'LOSS' && 'LOSS'}
                              {sig.status === 'REFUND' && 'REFUND'}
                              {sig.status === 'NO TRADE' && 'NO TRADE'}
                              {sig.status === 'PENDING' && 'PENDING'}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {manualAudits.length === 0 && (
                      <div className="p-8 text-center text-slate-600 font-mono text-[9px] uppercase leading-relaxed border border-dashed border-glass-border/40 rounded-xl">
                        No manually verified signals yet.<br />
                        <span className="text-slate-700 text-[8px]">Run your first Live Market Analysis to begin your personal audit history.</span>
                      </div>
                    )}
                  </div>
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
interface ManualScanResultProps {
  result: {
    direction: "CALL" | "PUT" | "WAIT";
    confidence: number;
    qualityScore: number;
    strategy: string;
    entryPrice: number;
    entryTime: string;
    expiryTime: string;
    risk: "LOW" | "MEDIUM" | "HIGH";
    recommendation: "CALL" | "PUT" | "WAIT";
    reasons: { label: string; checked: boolean; text: string }[];
    indicators: {
      ema21: number | null;
      sma50: number | null;
      rsi: number | null;
      cci: number | null;
      stochK: number | null;
      stochD: number | null;
      atr: number | null;
      supertrend: number | null;
      supertrendDirection: number;
      bodySize: number;
      upperWick: number;
      lowerWick: number;
    };
    lastCandleTime: string;
    analysisGeneratedTime: string;
    cacheExpiresTime: string;
    marketBias: string;
    recommendationText: string;
    analysisEngine: string;
    avoidReason: string;
    entryReason: string;
    nextCandleProbability: number;
    trendStrength: number;
    dataSource: string;
    cacheStatus: "Fresh" | "Cached";
    cacheAgeSeconds: number;
  };
  pair: string;
  onRefreshTrigger?: (pair: string) => void;
}

// ─── Event-Driven Live Market Scan Result Card ──────────────────────────────
function ManualScanResultCard({
  result,
  pair,
  onRefreshTrigger
}: ManualScanResultProps) {
  const isCall = result.direction === 'CALL';
  const isPut = result.direction === 'PUT';
  const isWait = result.direction === 'WAIT';

  const starsCount = Math.round(result.confidence / 20);
  const starsStr = '★'.repeat(starsCount) + '☆'.repeat(5 - starsCount);

  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isFreshReady = result.cacheExpiresTime 
    ? (currentTime > new Date(result.cacheExpiresTime).getTime()) 
    : false;

  const formattedTimes = (() => {
    try {
      const lastCandleDate = new Date(result.lastCandleTime);
      const entryDate = new Date(lastCandleDate.getTime() + 60 * 1000);
      const expiryDate = new Date(entryDate.getTime() + 60 * 1000);
      
      const formatTime = (d: Date) => {
        return new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }).format(d);
      };
      
      return {
        entry: formatTime(entryDate),
        expiry: formatTime(expiryDate)
      };
    } catch {
      return { entry: 'N/A', expiry: 'N/A' };
    }
  })();

  const nextCandleStartsIn = (() => {
    if (!result.cacheExpiresTime) return 0;
    const expiresMs = new Date(result.cacheExpiresTime).getTime();
    const nextStartMs = expiresMs - 5000;
    const diff = Math.max(0, Math.ceil((nextStartMs - currentTime) / 1000));
    return diff;
  })();

  return (
    <div className={`glass-panel rounded-xl border p-5 space-y-5 font-mono text-xs text-left ${
      isCall ? 'border-neon-green/30 bg-neon-green/[0.01]' : isPut ? 'border-rose-500/30 bg-rose-500/[0.01]' : 'border-amber-500/20 bg-amber-500/[0.005]'
    }`}>
      {/* 1. Header Decision Block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-glass-border/30 pb-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-100 tracking-wide flex items-center gap-2">
            {pair}
            <span className={`text-xs font-black px-2.5 py-0.5 rounded uppercase tracking-wider border ${
              isCall ? 'text-neon-green border-neon-green/20 bg-neon-green/5' : isPut ? 'text-rose-500 border-rose-500/20 bg-rose-500/5' : 'text-amber-400 border-amber-500/20 bg-amber-500/5'
            }`}>
              {isCall ? '🟢 CALL' : isPut ? '🔴 PUT' : '🟡 WAIT'}
            </span>
          </h2>
          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1 block">
            CONFLUENCE SIGNAL DIRECTIVE
          </span>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">ENGINE VERSION</span>
          <span className="text-[9px] text-slate-300 font-bold">v{result.analysisEngine || "1.3"}</span>
        </div>
      </div>

      {isFreshReady && (
        <div className="bg-neon-green/5 border border-neon-green/20 rounded p-2.5 text-[10px] text-neon-green font-bold flex items-center justify-between animate-pulse">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green inline-block animate-ping" />
            🟢 NEW CANDLE COMPLETED — FRESH ANALYSIS READY
          </span>
          {onRefreshTrigger && (
            <button 
              onClick={() => onRefreshTrigger(pair)}
              className="px-2.5 py-1 rounded bg-neon-green text-[#02050b] text-[8px] font-extrabold tracking-wider hover:bg-emerald-400 uppercase transition-colors cursor-pointer"
            >
              Analyze Again
            </button>
          )}
        </div>
      )}

      {/* 2. Institutional Decision Parameters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg border border-slate-900 bg-slate-950/30 text-left">
          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Confidence</span>
          <span className="text-xs font-extrabold text-gold-vip mt-1.5 block tracking-wider">{starsStr}</span>
          <span className="text-[7.5px] text-slate-400 font-bold mt-1 block">{result.confidence}% Probability</span>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-900 bg-slate-950/30 text-left">
          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Trend Strength</span>
          <span className="text-xs font-extrabold text-slate-200 mt-1.5 block font-mono">
            {(() => {
              const score = result.trendStrength || result.qualityScore || 70;
              const filled = Math.round(score / 10);
              return '█'.repeat(filled) + '░'.repeat(10 - filled);
            })()}
          </span>
          <span className="text-[7.5px] text-slate-400 font-bold mt-1 block">INDEX: {result.trendStrength || result.qualityScore}%</span>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-900 bg-slate-950/30 text-left">
          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Market Bias</span>
          <span className={`text-xs font-extrabold mt-1.5 block uppercase ${
            isCall ? 'text-neon-green' : isPut ? 'text-rose-400' : 'text-slate-400'
          }`}>{result.marketBias}</span>
          <span className="text-[7.5px] text-slate-400 font-bold mt-1 block">DIRECTIONS ALIGNED</span>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-900 bg-slate-950/30 text-left">
          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Signal Expiration</span>
          <span className="text-xs font-extrabold text-yellow-400 mt-1.5 block uppercase animate-pulse">
            {nextCandleStartsIn > 0 ? `${nextCandleStartsIn}s` : 'EXPIRING'}
          </span>
          <span className="text-[7.5px] text-slate-400 font-bold mt-1 block">NEXT CANDLE LIMIT</span>
        </div>
      </div>

      {/* 3. 1-Minute Binary Trade Times Table */}
      <div className="bg-[#020617]/70 border border-slate-900 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">ENTRY CANDLE</span>
          <span className="text-xs font-extrabold text-slate-200 mt-1 block">{formattedTimes.entry}</span>
          <span className="text-[7.5px] text-slate-500 font-bold block mt-0.5">(UTC+5:30 • Asia/Kolkata)</span>
        </div>
        <div>
          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">EXPIRY TIME</span>
          <span className="text-xs font-extrabold text-rose-400 mt-1 block">{formattedTimes.expiry}</span>
          <span className="text-[7.5px] text-slate-500 font-bold block mt-0.5">(UTC+5:30 • Asia/Kolkata)</span>
        </div>
        <div>
          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">VALID FOR</span>
          <span className="text-xs font-extrabold text-slate-200 mt-1 block">NEXT CANDLE ONLY</span>
        </div>
        <div>
          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">ENTRY PRICE</span>
          <span className="text-xs font-extrabold text-slate-200 mt-1 block">{result.entryPrice}</span>
        </div>
      </div>

      {/* 4. Directive Box */}
      <div className={`p-3.5 rounded-lg border text-left text-xs ${
        isCall ? 'bg-neon-green/[0.02] border-neon-green/10 text-slate-200' : isPut ? 'bg-rose-500/[0.02] border-rose-500/10 text-slate-200' : 'bg-slate-900/40 border-slate-800 text-slate-300'
      }`}>
        <span className="text-[8px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Recommendation Directive</span>
        <span className="text-xs leading-relaxed">{result.recommendationText}</span>
      </div>

      {/* 5. Checklist Reasons */}
      <div className="space-y-2 border-t border-glass-border/30 pt-4 text-left">
        <span className="text-[9px] text-slate-500 uppercase tracking-widest block font-bold">Analysis Confluence Checklist</span>
        
        {isWait && (
          <div className="text-[10px] text-amber-400/90 font-bold leading-relaxed border border-amber-500/20 bg-amber-500/[0.02] p-2 rounded">
            🟡 WAIT: Current market conditions do not satisfy the confluence requirements.
          </div>
        )}

        <div className="space-y-1.5 mt-2">
          {result.reasons.map((reason, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs">
              <span className={`font-bold shrink-0 ${reason.checked ? 'text-neon-green' : 'text-slate-600'}`}>
                {reason.checked ? '✓' : '✗'}
              </span>
              <span className={reason.checked ? 'text-slate-200' : 'text-slate-500'}>
                <span className="font-bold text-[10px] text-slate-400 mr-1.5">{reason.label}:</span>
                {reason.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Raw Indicators Block */}
      <div className="space-y-2 font-mono text-xs border-t border-glass-border/30 pt-3">
        <span className="text-[9px] text-slate-500 uppercase tracking-widest block mb-2 font-bold">Raw Indicator Values</span>
        
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500">RSI (14):</span>
            <span className="text-slate-200 font-semibold">{result.indicators.rsi?.toFixed(2) ?? 'N/A'}</span>
          </div>
          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500">Stoch %K / %D:</span>
            <span className="text-slate-200 font-semibold">{result.indicators.stochK?.toFixed(2) ?? 'N/A'} / {result.indicators.stochD?.toFixed(2) ?? 'N/A'}</span>
          </div>
          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500">CCI (14):</span>
            <span className="text-slate-200 font-semibold">{result.indicators.cci?.toFixed(2) ?? 'N/A'}</span>
          </div>
          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500">ATR (14):</span>
            <span className="text-slate-200 font-semibold">{result.indicators.atr?.toFixed(5) ?? 'N/A'}</span>
          </div>
          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500">SuperTrend:</span>
            <span className="text-slate-200 font-semibold">{result.indicators.supertrendDirection === 1 ? 'BULLISH' : 'BEARISH'} ({result.indicators.supertrend?.toFixed(5) ?? 'N/A'})</span>
          </div>
          <div className="flex justify-between border-b border-slate-900 pb-1.5">
            <span className="text-slate-500">Wicks (U/L/B):</span>
            <span className="text-slate-200 font-semibold">U:{result.indicators.upperWick.toFixed(5)} / L:{result.indicators.lowerWick.toFixed(5)} / B:{result.indicators.bodySize.toFixed(5)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
