'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Target, Activity, Filter,
  ChevronLeft, ChevronRight, RefreshCw, Download,
  Calendar, Clock,
  AlertTriangle, Database, Radio
} from 'lucide-react';
import {
  getSignalHistory,
  getDistinctPairs,
  type SignalHistoryFilters,
} from '@/app/actions/signals';
import { getSignalMode } from '@/app/actions/signal_mode';
import { getUserAccessState, getPublicOptimizationSettings } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import { sourceLabel } from '@/lib/pipeline';
import LockedFeature from '@/components/LockedFeature';

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

interface Signal {
  id:            string;
  pair:          string;
  timeframe:     string;
  direction:     'CALL' | 'PUT';
  entry_price:   number;
  expiry_price:  number | null;
  entry_time:    string;
  expiry_time:   string;
  strategy_name: string;
  confidence:    number;
  risk_level:    string;
  source:        string;
  result:        'PENDING' | 'WIN' | 'LOSS' | 'FAILED' | 'NO TRADE' | 'SCANNING';
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export default function SignalHistoryPage() {
  const [signals,    setSignals]    = useState<Signal[]>([]);
  const [total,      setTotal]      = useState(0);
  const [pairs,      setPairs]      = useState<string[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [accessLoading, setAccessLoading] = useState(true);
  const [signalMode, setSignalMode] = useState<string>('SIMULATION');
  const [userAccess, setUserAccess] = useState<any>({
    vipAccess: false,
    premiumAccess: false,
    status: 'pending'
  });
  const [optSettings, setOptSettings] = useState<Record<string, string>>({});

  // Load user access and settings on mount — resolved before paywall is shown
  useEffect(() => {
    Promise.all([
      getUserAccessState(),
      getPublicOptimizationSettings()
    ]).then(([accessRes, settingsRes]) => {
      if (accessRes.success) {
        setUserAccess(accessRes);
      }
      if (settingsRes.success && settingsRes.settings) {
        setOptSettings(settingsRes.settings);
      }
    }).finally(() => {
      setAccessLoading(false);
    });
  }, []);

  // Filters
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [selPair,    setSelPair]    = useState('ALL');
  const [selStrategy, setSelStrategy] = useState('ALL');
  const [selResult,  setSelResult]  = useState<'ALL' | 'PENDING' | 'WIN' | 'LOSS' | 'FAILED' | 'NO TRADE' | 'SCANNING'>('ALL');
  const [selSource,  setSelSource]  = useState<'ALL' | 'live_otc' | 'live_market'>('ALL');
  const [page,       setPage]       = useState(1);
  const PAGE_SIZE = 50;

  // Load data
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

      const [histRes, modeRes] = await Promise.all([
        getSignalHistory(filters),
        getSignalMode()
      ]);

      if (histRes.success)  { 
        setSignals(histRes.signals as Signal[]); 
        setTotal(histRes.total); 
      }
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

  const applyFilter = (fn: () => void) => { fn(); setPage(1); };

  // CSV Exporter
  const handleExportCSV = () => {
    if (signals.length === 0) return;
    const headers = ['ID', 'Asset', 'Direction', 'Entry Price', 'Close Price', 'Result', 'Source', 'Timestamp'];
    const rows = signals.map(s => [
      shortId(s.id),
      s.pair,
      s.direction,
      s.entry_price,
      s.expiry_price || '—',
      s.result,
      s.source,
      new Date(s.entry_time).toLocaleString()
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `signal_history_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 text-left">

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
            <span className="text-[9px] font-mono text-slate-600 border border-slate-800 px-2 py-0.5 rounded font-bold uppercase">
              PERMANENT RECORD
            </span>
          </div>

          <div className="flex items-center gap-2">
            {signals.length > 0 && (
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-xs uppercase transition-all"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            )}
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
        
        {/* Dynamic Gating Overlay — accessLoading prevents premium flash */}
        {accessLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
            <div className="h-6 w-6 border-2 border-purple-500/40 border-t-purple-400 rounded-full animate-spin" />
            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">VERIFYING ACCESS...</span>
          </div>
        ) : !userAccess.isAdmin && !canAccess('signal-history', { vip_access: userAccess.vipAccess, premium_access: userAccess.premiumAccess, status: userAccess.status }, optSettings.signal_visibility) ? (
          <LockedFeature feature="signal-history" />
        ) : (
          <>
            {/* ── Filter Bar ──────────────────────────────────────────────── */}
            <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4 font-mono text-xs text-slate-400 transition-all duration-200 hover:border-glass-border/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Date range filters */}
                <div className="space-y-1">
                  <label className="text-[8px] text-slate-500 tracking-wider uppercase block">From Date</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => applyFilter(() => setDateFrom(e.target.value))}
                    className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] text-slate-500 tracking-wider uppercase block">To Date</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => applyFilter(() => setDateTo(e.target.value))}
                    className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-slate-200"
                  />
                </div>

                {/* Dropdowns */}
                <div className="space-y-1">
                  <label className="text-[8px] text-slate-500 tracking-wider uppercase block">Asset Pair</label>
                  <select
                    value={selPair}
                    onChange={(e) => applyFilter(() => setSelPair(e.target.value))}
                    className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-slate-200"
                  >
                    {pairs.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] text-slate-500 tracking-wider uppercase block">Strategy Model</label>
                  <select
                    value={selStrategy}
                    onChange={(e) => applyFilter(() => setSelStrategy(e.target.value))}
                    className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-slate-200"
                  >
                    <option value="ALL">ALL STRATEGIES</option>
                    {STRATEGY_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] text-slate-500 tracking-wider uppercase block">Outcome Result</label>
                  <select
                    value={selResult}
                    onChange={(e) => applyFilter(() => setSelResult(e.target.value as any))}
                    className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-slate-200"
                  >
                    <option value="ALL">ALL RESULTS</option>
                    <option value="WIN">WIN</option>
                    <option value="LOSS">LOSS</option>
                    <option value="PENDING">PENDING</option>
                    <option value="FAILED">FAILED</option>
                    <option value="NO TRADE">NO TRADE</option>
                    <option value="SCANNING">SCANNING</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] text-slate-500 tracking-wider uppercase block">Data Pipeline Source</label>
                  <select
                    value={selSource}
                    onChange={(e) => applyFilter(() => setSelSource(e.target.value as any))}
                    className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-slate-200"
                  >
                    <option value="ALL">ALL PIPELINES</option>
                    <option value="live_otc">{sourceLabel('live_otc')}</option>
                    <option value="live_market">{sourceLabel('live_market')}</option>
                  </select>
                </div>

              </div>
            </div>

            {/* ── History Table Ledger ────────────────────────────────────────── */}
            <div className="glass-panel border border-glass-border rounded-xl overflow-hidden">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="bg-[#030812] border-b border-glass-border text-slate-500 uppercase tracking-wider text-[9px]">
                  <tr>
                    <th className="p-4">SIGNAL ID</th>
                    <th className="p-4">TIMESTAMP</th>
                    <th className="p-4">ASSET</th>
                    <th className="p-4">DIRECTION</th>
                    <th className="p-4">ENTRY / CLOSE</th>
                    <th className="p-4">STRATEGY</th>
                    <th className="p-4">PIPELINE</th>
                    <th className="p-4 text-right">OUTCOME</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border/30 text-slate-300">
                  {signals.map((sig, idx) => {
                    const isWin = sig.result === 'WIN';
                    const isLoss = sig.result === 'LOSS';
                    const isInvalid = sig.result === 'FAILED' || sig.result === 'NO TRADE' || sig.result === 'SCANNING';
                    const isCall = !isInvalid && sig.direction === 'CALL';

                    return (
                      <tr key={sig.id} className="hover:bg-slate-900/10 transition-all duration-150" style={{ animationDelay: `${idx * 0.02}s` }}>
                        <td className="p-4 text-slate-500 font-bold">{shortId(sig.id)}</td>
                        <td className="p-4 text-slate-400">
                          {new Date(sig.entry_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="p-4 font-bold text-slate-200">{sig.pair}</td>
                        <td className="p-4">
                          {isInvalid ? (
                            <span className="text-slate-600">—</span>
                          ) : (
                            <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded font-bold uppercase ${
                              isCall ? 'bg-neon-green/10 text-neon-green' : 'bg-rose-500/10 text-rose-400'
                            }`}>
                              {isCall ? 'CALL ▲' : 'PUT ▼'}
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          {isInvalid ? (
                            <span className="text-slate-500">— → —</span>
                          ) : (
                            <>{sig.entry_price} → <span className={isWin ? 'text-neon-green font-bold' : isLoss ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                              {sig.expiry_price || '—'}
                            </span></>
                          )}
                        </td>
                        <td className="p-4 text-slate-400 truncate max-w-[150px]" title={sig.strategy_name}>
                          {isInvalid ? <span className="text-slate-600">—</span> : sig.strategy_name}
                        </td>
                        <td className="p-4 uppercase text-[9px] text-slate-500">{sourceLabel(sig.source)}</td>
                        <td className="p-4 text-right font-bold">
                          <span className={`px-2 py-0.5 rounded border text-[10px] ${
                            isWin ? 'text-neon-green border-neon-green/30 bg-neon-green/5' :
                            isLoss ? 'text-rose-400 border-rose-500/30 bg-rose-500/5' :
                            'text-slate-500 border-slate-700 bg-slate-900/30'
                          }`}>
                            {sig.result}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {signals.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 uppercase">
                        No signal records found in database.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ──────────────────────────────────────────────── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between font-mono text-xs pt-4">
                <span className="text-slate-500">
                  Showing Page {page} of {totalPages} ({total} Total Records)
                </span>
                
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="p-2 rounded border border-glass-border bg-slate-900/40 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="p-2 rounded border border-glass-border bg-slate-900/40 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
