'use client';

/**
 * Premium Signal History Page
 * Route: /dashboard/signal-history
 *
 * Displays the complete permanent record of all generated signals
 * with filters, real performance analytics, and lifecycle status.
 *
 * Data source: Supabase signals table (read-only, never deletes)
 * Used for: Premium subscription credibility + performance proof
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Target, Activity, Filter,
  ChevronLeft, ChevronRight, RefreshCw, Download, BarChart2,
  Calendar, Layers, CheckCircle, XCircle, Clock, Zap,
  AlertTriangle, Database, Radio, Lock
} from 'lucide-react';
import {
  getSignalHistory,
  getSignalPerformance,
  getDistinctPairs,
  type SignalHistoryFilters,
} from '@/app/actions/signals';
import { getSignalMode } from '@/app/actions/signal_mode';
import { getUserAccessState } from '@/app/actions/admin_optimization';

// ─── Strategy list (mirrors signals page — NOT modified) ──────────────────
const STRATEGY_TAGS = [
  'ALL',
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

// ─── Types ────────────────────────────────────────────────────────────────
interface Signal {
  id:            string;
  pair:          string;
  timeframe:     string;
  direction:     'CALL' | 'PUT';
  entry_price:   number;
  entry_time:    string;
  expiry_time:   string | null;
  expiry_price:  number | null;
  strategy_name: string;
  confidence:    number;
  risk_level:    string | null;
  result:        'PENDING' | 'WIN' | 'LOSS';
  source:        'simulation' | 'live_otc' | 'live_market';
  created_at:    string;
}

interface PerformanceStats {
  total:    number;
  wins:     number;
  losses:   number;
  pending:  number;
  accuracy: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    timeZone:    'Asia/Kolkata',
    day:         '2-digit',
    month:       'short',
    hour:        '2-digit',
    minute:      '2-digit',
    hour12:      false,
  }) + ' IST';
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────
export default function SignalHistoryPage() {
  // ── State ──────────────────────────────────────────────────────────────
  const [signals,    setSignals]    = useState<Signal[]>([]);
  const [total,      setTotal]      = useState(0);
  const [stats,      setStats]      = useState<PerformanceStats | null>(null);
  const [pairs,      setPairs]      = useState<string[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [signalMode, setSignalMode] = useState<string>('SIMULATION');
  const [userAccess, setUserAccess] = useState<any>({
    vipAccess: false,
    premiumAccess: false,
    status: 'pending'
  });

  // Load user access state on mount
  useEffect(() => {
    getUserAccessState().then(res => {
      if (res.success) {
        setUserAccess(res);
      }
    });
  }, []);

  // Filters
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [selPair,    setSelPair]    = useState('ALL');
  const [selStrategy, setSelStrategy] = useState('ALL');
  const [selResult,  setSelResult]  = useState<'ALL' | 'PENDING' | 'WIN' | 'LOSS'>('ALL');
  const [selSource,  setSelSource]  = useState<'ALL' | 'simulation' | 'live_otc' | 'live_market'>('ALL');
  const [page,       setPage]       = useState(1);
  const PAGE_SIZE = 50;

  // ── Load data ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: SignalHistoryFilters = {
        page,
        page_size: PAGE_SIZE,
        result:    selResult,
        source:    selSource,
      };
      if (dateFrom)              filters.date_from  = dateFrom;
      if (dateTo)                filters.date_to    = dateTo;
      if (selPair !== 'ALL')     filters.pair       = selPair;
      if (selStrategy !== 'ALL') filters.strategy   = selStrategy;

      const [histRes, statsRes, modeRes] = await Promise.all([
        getSignalHistory(filters),
        getSignalPerformance('ALL'),
        getSignalMode(),
      ]);

      if (histRes.success)  { setSignals(histRes.signals as Signal[]); setTotal(histRes.total); }
      if (statsRes.success && statsRes.stats) setStats(statsRes.stats);
      if (modeRes.success)  setSignalMode(modeRes.mode);
    } finally {
      setLoading(false);
    }
  }, [page, selResult, selSource, dateFrom, dateTo, selPair, selStrategy]);

  // Load distinct pairs for filter dropdown
  useEffect(() => {
    getDistinctPairs().then(res => {
      if (res.success) setPairs(['ALL', ...res.pairs]);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Reset page when filters change ────────────────────────────────────
  const applyFilter = (fn: () => void) => { fn(); setPage(1); };

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#030812]/95 border-b border-glass-border backdrop-blur-md px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-gold-vip" />
              <span className="font-mono font-extrabold text-gold-vip tracking-widest text-sm glow-text-gold">
                SIGNAL HISTORY
              </span>
            </div>
            <span className="text-[9px] font-mono text-slate-600 border border-slate-800 px-2 py-0.5 rounded">
              PERMANENT RECORD
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Signal Mode Badges */}
            <div className="flex flex-wrap items-center gap-1.5">
              {signalMode.split(',').map(m => m.trim()).map(mode => {
                let colorClass = 'border-slate-700 bg-slate-900/40 text-slate-500';
                if (mode === 'LIVE_OTC') colorClass = 'border-neon-green/40 bg-neon-green/10 text-neon-green';
                if (mode === 'LIVE_MARKET') colorClass = 'border-sky-500/40 bg-sky-500/10 text-sky-400';
                if (mode === 'SIMULATION') colorClass = 'border-amber-500/40 bg-amber-500/10 text-amber-400';
                return (
                  <div key={mode} className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-mono font-bold tracking-wider ${colorClass}`}>
                    <div className={`h-1.5 w-1.5 rounded-full ${
                      mode === 'LIVE_OTC' ? 'bg-neon-green animate-pulse'
                      : mode === 'LIVE_MARKET' ? 'bg-sky-400 animate-pulse'
                      : 'bg-amber-400'
                    }`} />
                    {mode.replace('_', ' ')}
                  </div>
                );
              })}
            </div>
            <button
              onClick={load}
              className="p-1.5 rounded border border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {!userAccess.isAdmin && !userAccess.premiumAccess ? (
          <div className="glass-panel rounded-xl border border-purple-500/35 bg-slate-900/40 p-12 text-center space-y-4 max-w-2xl mx-auto my-8 relative overflow-hidden shadow-[0_0_25px_rgba(139,92,246,0.1)]">
            <div className="absolute -top-12 -left-12 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
            <Lock className="h-12 w-12 text-purple-400 animate-bounce mx-auto" />
            <h2 className="text-base font-bold font-mono text-purple-300 uppercase tracking-widest">PREMIUM HISTORY ACCESS REQUIRED</h2>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              The verified historical signals ledger, win-rate metrics, strategy performance lists, and filter audits require an active Premium Signal Pro subscription.
            </p>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1.5 px-6 py-3 rounded bg-purple-500 hover:bg-purple-600 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider transition-colors shadow-[0_0_10px_rgba(139,92,246,0.2)]"
              >
                <span>Upgrade to Premium</span>
                <Zap className="h-3.5 w-3.5 fill-slate-950 text-slate-950" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1 px-6 py-3 rounded border border-glass-border hover:border-neon-green/30 text-slate-300 hover:text-neon-green text-xs font-mono uppercase tracking-wider transition-colors"
              >
                Go back to Journal
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* ── Performance Stats ────────────────────────────────────────── */}
            {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: 'TOTAL SIGNALS',
                value: stats.total.toLocaleString(),
                icon: Layers,
                color: 'text-slate-200',
                glow: '',
              },
              {
                label: 'WINS',
                value: stats.wins.toLocaleString(),
                icon: CheckCircle,
                color: 'text-neon-green',
                glow: 'shadow-[0_0_10px_rgba(0,230,118,0.12)]',
              },
              {
                label: 'LOSSES',
                value: stats.losses.toLocaleString(),
                icon: XCircle,
                color: 'text-rose-400',
                glow: '',
              },
              {
                label: 'ACCURACY',
                value: stats.total > 0 ? `${stats.accuracy}%` : '—',
                icon: Target,
                color: 'text-gold-vip',
                glow: 'shadow-[0_0_12px_rgba(255,215,0,0.12)]',
              },
            ].map((s, i) => (
              <div
                key={i}
                className={`glass-panel rounded-xl border border-glass-border p-4 flex items-center justify-between ${s.glow}`}
              >
                <div>
                  <div className="text-[9px] font-mono text-slate-500 tracking-widest">{s.label}</div>
                  <div className={`text-2xl font-extrabold font-mono mt-1 ${s.color}`}>{s.value}</div>
                </div>
                <s.icon className={`h-7 w-7 ${s.color} opacity-50`} />
              </div>
            ))}
          </div>
        )}

        {/* ── Accuracy Bar ─────────────────────────────────────────────── */}
        {stats && stats.total > 0 && (
          <div className="glass-panel rounded-xl border border-glass-border p-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-slate-500 tracking-widest font-bold">OVERALL WIN RATE</span>
              <span className={`text-sm font-extrabold font-mono ${
                stats.accuracy >= 80 ? 'text-neon-green' : stats.accuracy >= 60 ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {stats.accuracy}%
              </span>
            </div>
            <div className="h-2 bg-slate-900 rounded-full border border-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, stats.accuracy)}%`,
                  background: stats.accuracy >= 80
                    ? 'linear-gradient(90deg, #00E676, #69F0AE)'
                    : stats.accuracy >= 60
                    ? 'linear-gradient(90deg, #FFCA28, #FFD740)'
                    : 'linear-gradient(90deg, #EF5350, #FF7043)',
                  boxShadow: stats.accuracy >= 80 ? '0 0 10px rgba(0,230,118,0.4)' : undefined,
                }}
              />
            </div>
            <div className="flex justify-between text-[8px] font-mono text-slate-700">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
            {stats.pending > 0 && (
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-amber-400">
                <Clock className="h-3 w-3" />
                <span>{stats.pending} signals pending result</span>
              </div>
            )}
          </div>
        )}

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-xl border border-slate-800 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[10px] font-mono font-bold text-slate-500 tracking-widest">SIGNAL FILTERS</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Date Range */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[9px] font-mono text-slate-600 tracking-wider">
                <Calendar className="h-3 w-3" />
                <span>DATE RANGE</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => applyFilter(() => setDateFrom(e.target.value))}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[10px] font-mono text-slate-300 focus:border-neon-green/40 focus:outline-none"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => applyFilter(() => setDateTo(e.target.value))}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[10px] font-mono text-slate-300 focus:border-neon-green/40 focus:outline-none"
                />
              </div>
            </div>

            {/* Pair Filter */}
            <div className="space-y-1.5">
              <div className="text-[9px] font-mono text-slate-600 tracking-wider">PAIR</div>
              <select
                value={selPair}
                onChange={e => applyFilter(() => setSelPair(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[10px] font-mono text-slate-300 focus:border-neon-green/40 focus:outline-none"
              >
                {pairs.length > 0 ? pairs.map(p => (
                  <option key={p} value={p}>{p}</option>
                )) : (
                  <option value="ALL">ALL PAIRS</option>
                )}
              </select>
            </div>

            {/* Strategy Filter */}
            <div className="space-y-1.5">
              <div className="text-[9px] font-mono text-slate-600 tracking-wider">STRATEGY</div>
              <select
                value={selStrategy}
                onChange={e => applyFilter(() => setSelStrategy(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[10px] font-mono text-slate-300 focus:border-neon-green/40 focus:outline-none"
              >
                {STRATEGY_TAGS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Result Filter */}
            <div className="space-y-1.5">
              <div className="text-[9px] font-mono text-slate-600 tracking-wider">RESULT</div>
              <div className="flex gap-1 flex-wrap">
                {(['ALL', 'WIN', 'LOSS', 'PENDING'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => applyFilter(() => setSelResult(r))}
                    className={`px-3 py-1.5 rounded text-[9px] font-mono font-bold tracking-wider border transition-all ${
                      selResult === r
                        ? r === 'WIN'     ? 'bg-neon-green/10 border-neon-green/40 text-neon-green'
                        : r === 'LOSS'    ? 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                        : r === 'PENDING' ? 'bg-amber-500/10 border-amber-400/40 text-amber-400'
                        : 'bg-slate-800 border-slate-700 text-slate-200'
                        : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Source Filter */}
            <div className="space-y-1.5">
              <div className="text-[9px] font-mono text-slate-600 tracking-wider">SOURCE</div>
              <div className="flex gap-1 flex-wrap">
                {([
                  { value: 'ALL',         label: 'ALL' },
                  { value: 'simulation',  label: 'SIMULATION' },
                  { value: 'live_otc',    label: 'LIVE OTC' },
                  { value: 'live_market', label: 'LIVE MARKET' },
                ] as const).map(s => (
                  <button
                    key={s.value}
                    onClick={() => applyFilter(() => setSelSource(s.value))}
                    className={`px-3 py-1.5 rounded text-[9px] font-mono font-bold tracking-wider border transition-all ${
                      selSource === s.value
                        ? s.value === 'live_otc'    ? 'bg-neon-green/10 border-neon-green/40 text-neon-green'
                        : s.value === 'live_market' ? 'bg-sky-500/10 border-sky-500/40 text-sky-400'
                        : s.value === 'simulation'  ? 'bg-amber-500/10 border-amber-400/40 text-amber-400'
                        : 'bg-slate-800 border-slate-700 text-slate-200'
                        : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setDateFrom(''); setDateTo('');
                  setSelPair('ALL'); setSelStrategy('ALL');
                  setSelResult('ALL'); setSelSource('ALL');
                  setPage(1);
                }}
                className="px-4 py-1.5 rounded border border-slate-800 text-[9px] font-mono text-slate-500 hover:border-slate-700 hover:text-slate-400 transition-all"
              >
                RESET FILTERS
              </button>
            </div>
          </div>
        </div>

        {/* ── Table ────────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
          {/* Table header */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-gold-vip" />
              <span className="text-[10px] font-mono font-bold text-gold-vip tracking-widest">SIGNAL RECORDS</span>
              <span className="text-[9px] font-mono text-slate-600">
                {total.toLocaleString()} total
              </span>
            </div>
            <div className="text-[9px] font-mono text-slate-600">
              Page {page} of {totalPages}
            </div>
          </div>

          {/* Loading state */}
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3">
              <RefreshCw className="h-5 w-5 text-neon-green animate-spin" />
              <span className="text-xs font-mono text-slate-500">LOADING SIGNAL RECORDS...</span>
            </div>
          ) : signals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-600">
              <Database className="h-8 w-8" />
              <div className="text-xs font-mono text-center">
                <div className="font-bold text-slate-500 mb-1">NO SIGNALS RECORDED YET</div>
                <div className="text-slate-700">Signals appear here after the first minute of operation.</div>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-[10px] font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-600 text-[9px] tracking-wider">
                      {['SIGNAL ID', 'PAIR', 'DIR', 'STRATEGY', 'ENTRY PRICE', 'ENTRY TIME', 'EXPIRY PRICE', 'RESULT', 'CONF%', 'SOURCE'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {signals.map(sig => (
                      <SignalRow key={sig.id} sig={sig} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden divide-y divide-slate-900">
                {signals.map(sig => (
                  <MobileSignalCard key={sig.id} sig={sig} />
                ))}
              </div>
            </>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded border border-slate-800 text-[9px] font-mono text-slate-400 hover:border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                PREV
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) {
                    p = i + 1;
                  } else if (page <= 3) {
                    p = i + 1;
                  } else if (page >= totalPages - 2) {
                    p = totalPages - 4 + i;
                  } else {
                    p = page - 2 + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded text-[9px] font-mono font-bold transition-all ${
                        page === p
                          ? 'bg-gold-vip/15 border border-gold-vip/40 text-gold-vip'
                          : 'border border-slate-800 text-slate-500 hover:border-slate-700'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded border border-slate-800 text-[9px] font-mono text-slate-400 hover:border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                NEXT
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ── Disclaimer ───────────────────────────────────────────────── */}
        <div className="border border-slate-900 rounded-lg p-4 bg-slate-950/40">
          <p className="text-[9px] font-mono text-slate-600 leading-relaxed">
            <span className="text-slate-500 font-bold">NOTICE: </span>
            Signal results are calculated algorithmically from candle close prices.
            All signal records are stored permanently and are never modified or deleted.
            This data is used for performance tracking and subscription credibility only.
            Past performance does not guarantee future results. For educational purposes only.
          </p>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Desktop Signal Row ────────────────────────────────────────────────────
function SignalRow({ sig }: { sig: Signal }) {
  const isCall = sig.direction === 'CALL';
  const isWin  = sig.result === 'WIN';
  const isLoss = sig.result === 'LOSS';

  return (
    <tr className="hover:bg-slate-900/30 transition-colors">
      {/* ID */}
      <td className="px-3 py-2.5 text-slate-600 font-mono">{shortId(sig.id)}</td>

      {/* Pair */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-200 font-bold">{sig.pair}</span>
          <span className="text-[7px] text-slate-700 border border-slate-800 px-1 rounded">
            {sig.source === 'live_market' ? 'LIVE' : 'OTC'}
          </span>
        </div>
      </td>

      {/* Direction */}
      <td className="px-3 py-2.5">
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-bold ${
          isCall
            ? 'bg-neon-green/10 border-neon-green/30 text-neon-green'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          {isCall ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {sig.direction}
        </div>
      </td>

      {/* Strategy */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 text-gold-vip">
          <Zap className="h-3 w-3" />
          <span>{sig.strategy_name}</span>
        </div>
      </td>

      {/* Entry Price */}
      <td className="px-3 py-2.5 text-slate-300 font-bold">
        {Number(sig.entry_price).toFixed(5)}
      </td>

      {/* Entry Time */}
      <td className="px-3 py-2.5 text-slate-500">{formatTime(sig.entry_time)}</td>

      {/* Expiry Price */}
      <td className="px-3 py-2.5">
        {sig.expiry_price != null ? (
          <span className={`font-bold ${
            sig.result === 'WIN' ? 'text-neon-green' : sig.result === 'LOSS' ? 'text-rose-400' : 'text-slate-400'
          }`}>
            {Number(sig.expiry_price).toFixed(5)}
          </span>
        ) : (
          <span className="text-slate-700">—</span>
        )}
      </td>

      {/* Result */}
      <td className="px-3 py-2.5">
        <ResultBadge result={sig.result} />
      </td>

      {/* Confidence */}
      <td className="px-3 py-2.5">
        <div className={`font-bold ${
          sig.confidence >= 90 ? 'text-gold-vip' : sig.confidence >= 85 ? 'text-neon-green' : 'text-slate-400'
        }`}>
          {sig.confidence}%
        </div>
      </td>

      {/* Source */}
      <td className="px-3 py-2.5">
        <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${
          sig.source === 'live_market'
            ? 'text-sky-400 border-sky-500/30 bg-sky-500/5'
            : sig.source === 'live_otc'
            ? 'text-neon-green border-neon-green/30 bg-neon-green/5'
            : 'text-slate-600 border-slate-800 bg-slate-900/30'
        }`}>
          {sig.source === 'live_market' ? 'LIVE MARKET' : sig.source === 'live_otc' ? 'LIVE' : 'SIM'}
        </span>
      </td>
    </tr>
  );
}

// ─── Mobile Signal Card ────────────────────────────────────────────────────
function MobileSignalCard({ sig }: { sig: Signal }) {
  const isCall = sig.direction === 'CALL';

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-slate-200">{sig.pair}</span>
          <span className="text-[7px] text-slate-600 border border-slate-800 px-1 rounded">
            {sig.source === 'live_market' ? 'LIVE' : sig.source === 'live_otc' ? 'OTC' : 'SIM'}
          </span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-mono font-bold ${
            isCall
              ? 'bg-neon-green/10 border-neon-green/30 text-neon-green'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            {isCall ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {sig.direction}
          </div>
        </div>
        <ResultBadge result={sig.result} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-mono">
        <div className="text-slate-600">STRATEGY <span className="text-gold-vip">{sig.strategy_name}</span></div>
        <div className="text-slate-600">CONF <span className="text-slate-300">{sig.confidence}%</span></div>
        <div className="text-slate-600">ENTRY <span className="text-slate-300">{Number(sig.entry_price).toFixed(5)}</span></div>
        <div className="text-slate-600">EXPIRY <span className="text-slate-300">
          {sig.expiry_price != null ? Number(sig.expiry_price).toFixed(5) : '—'}
        </span></div>
        <div className="text-slate-600 col-span-2">{formatTime(sig.entry_time)}</div>
      </div>
    </div>
  );
}

// ─── Result Badge ──────────────────────────────────────────────────────────
function ResultBadge({ result }: { result: 'WIN' | 'LOSS' | 'PENDING' }) {
  if (result === 'WIN') return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-neon-green/40 bg-neon-green/10 text-neon-green text-[9px] font-mono font-bold">
      <CheckCircle className="h-3 w-3" />
      WIN
    </div>
  );
  if (result === 'LOSS') return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-400 text-[9px] font-mono font-bold">
      <XCircle className="h-3 w-3" />
      LOSS
    </div>
  );
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-400/30 bg-amber-500/10 text-amber-400 text-[9px] font-mono font-bold">
      <Clock className="h-3 w-3 animate-pulse" />
      PENDING
    </div>
  );
}
