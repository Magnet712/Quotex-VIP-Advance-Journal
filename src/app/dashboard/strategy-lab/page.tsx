'use client';

import React, { useState, useEffect } from 'react';
import { 
  FlaskConical, Sparkles, Zap, Filter, Calendar, Clock, 
  TrendingUp, CheckCircle, XCircle, AlertTriangle, 
  RefreshCw, BarChart2, Award, Shield, Target, ArrowUpRight, ArrowDownRight,
  Hourglass, Layers, HelpCircle, BarChart3, PieChart as PieChartIcon, Download
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid,
  PieChart, Pie
} from 'recharts';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';
import CardShineEffect from '@/components/CardShineEffect';
import { analyzeStrategyLab, type StrategyLabFilter, type StrategyLabAnalysisResult } from '@/app/actions/strategy_lab';
import { OTC_PAIRS } from '@/app/dashboard/signals/generateSignal';

function CustomPieTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="bg-[#02050b]/95 border border-purple-500/30 p-2.5 rounded-lg shadow-xl font-mono text-xs space-y-0.5">
        <div className="flex items-center gap-2 font-bold" style={{ color: data.payload.color }}>
          <span>● {data.name}:</span>
          <span>{data.value}</span>
        </div>
      </div>
    );
  }
  return null;
}

function CustomHourlyTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#02050b]/95 border border-purple-500/30 p-3 rounded-lg shadow-xl font-mono text-xs space-y-1">
        <div className="text-[11px] font-bold text-slate-200 border-b border-glass-border/40 pb-1 flex items-center justify-between gap-3">
          <span>{label}</span>
          <span className="text-purple-300">{data.winRate}% Win Rate</span>
        </div>
        <div className="text-[10px] text-slate-400 space-y-0.5 pt-0.5">
          <div className="text-emerald-400">Wins: {data.wins}</div>
          <div className="text-rose-400">Losses: {data.losses}</div>
          <div className="text-slate-500">Total Scans: {data.count}</div>
        </div>
      </div>
    );
  }
  return null;
}

function CustomSetupTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#02050b]/95 border border-purple-500/30 p-3 rounded-lg shadow-xl font-mono text-xs space-y-1">
        <div className="text-[11px] font-bold text-slate-200 border-b border-glass-border/40 pb-1">
          {data.setup}
        </div>
        <div className="text-[10px] text-slate-400 space-y-0.5 pt-0.5">
          <div className="text-purple-300 font-bold">Accuracy: {data.winRate}%</div>
          <div className="text-emerald-400">Wins: {data.wins}</div>
          <div className="text-rose-400">Losses: {data.losses}</div>
          <div className="text-slate-500">Total Executions: {data.total}</div>
        </div>
      </div>
    );
  }
  return null;
}

export default function StrategyLabPage() {
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [, setUserProfile] = useState<any>(null);

  // Filters
  const [pair, setPair] = useState<string>('ALL');
  const [direction, setDirection] = useState<'ALL' | 'CALL' | 'PUT'>('ALL');
  const [expiry] = useState<string>('1 MIN');
  const [period, setPeriod] = useState<'last_7_days' | 'last_30_days' | 'last_90_days' | 'all' | 'custom'>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [session, setSession] = useState<string>('ALL');

  // Results
  const [result, setResult] = useState<StrategyLabAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const accessRes = await getUserAccessState();
        if (cancelled) return;
        if (accessRes.success) {
          const profile = {
            vip_access: accessRes.vipAccess,
            premium_access: accessRes.premiumAccess,
            status: accessRes.status,
          };
          setUserProfile(profile);
          const allowed = canAccess('strategy-lab', profile);
          setHasAccess(allowed);

          if (allowed) {
            // Initial auto-analysis with defaults (All-Time history)
            const res = await analyzeStrategyLab({
              pair: 'ALL',
              direction: 'ALL',
              expiry: '1 MIN',
              period: 'all',
              session: 'ALL',
            });
            if (!cancelled && res.success && res.data) {
              setResult(res.data);
            }
          }
        }
      } catch (err) {
        console.error('Failed to initialize Strategy Lab:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setErrorMsg(null);
    try {
      const filterPayload: StrategyLabFilter = {
        pair,
        direction,
        expiry,
        period,
        customDateFrom: period === 'custom' ? customDateFrom : undefined,
        customDateTo: period === 'custom' ? customDateTo : undefined,
        session: session !== 'ALL' ? session : undefined,
      };
      const res = await analyzeStrategyLab(filterPayload);
      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setErrorMsg(res.error || 'Failed to complete strategy analysis.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-slate-500 font-mono text-xs">
          <RefreshCw className="h-6 w-6 animate-spin text-purple-400" />
          <span>INITIALIZING AI STRATEGY LAB...</span>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return <LockedFeature feature="strategy-lab" />;
  }

  const isAllPairs = pair === 'ALL';

  const outcomePieData = result ? [
    { name: 'Wins', value: result.wins, color: '#10b981' },
    { name: 'Losses', value: result.losses, color: '#f43f5e' },
    ...(result.pending > 0 ? [{ name: 'Pending', value: result.pending, color: '#f59e0b' }] : []),
    ...(result.refunds > 0 ? [{ name: 'Refunds', value: result.refunds, color: '#38bdf8' }] : []),
  ].filter(d => d.value > 0) : [];

  const handleExportCSV = () => {
    if (!result) return;
    const headers = ['Category / Metric', 'Value', 'Detail'];
    const rows: (string | number)[][] = [
      ['Target Pair', `"${result.pairAnalyzed}"`, 'Selected Asset'],
      ['Direction Filter', direction, 'Strategy Direction'],
      ['Expiry Window', expiry, 'Fixed OTC Frame'],
      ['Total Signals', result.signals, 'All Logged Scans'],
      ['Settled Signals', result.settledSignals, 'Resolved Outcomes'],
      ['Wins', result.wins, 'Resolved WIN'],
      ['Losses', result.losses, 'Resolved LOSS'],
      ['Pending', result.pending, 'Awaiting Expiry'],
      ['Historical Win Rate', `${result.winRate}%`, 'Completed Win Rate'],
      ['Best Session', `"${result.bestSession}"`, 'Peak Accuracy Window'],
      ['Best Pair', `"${result.bestPair}"`, 'Top Performance Asset'],
      ['Strongest Setup', `"${result.strongestSetup}"`, 'Top Strategy Model'],
      ['Worst Condition', `"${result.worstCondition}"`, 'Risk Trigger'],
      ['CALL Win Rate', `${result.directionalEdge.callWinRate}%`, `${result.directionalEdge.callWins}W / ${result.directionalEdge.callLosses}L`],
      ['PUT Win Rate', `${result.directionalEdge.putWinRate}%`, `${result.directionalEdge.putWins}W / ${result.directionalEdge.putLosses}L`],
      ['AI Verdict', `"${result.aiVerdict.replace(/"/g, '""')}"`, 'Dynamic AI Intelligence'],
    ];

    if (result.setupBreakdown && result.setupBreakdown.length > 0) {
      rows.push(['--- STRATEGY MODEL BREAKDOWN ---', '---', '---']);
      result.setupBreakdown.forEach(sb => {
        rows.push([`"${sb.setup.replace(/"/g, '""')}"`, `${sb.winRate}%`, `${sb.total} total (${sb.wins}W / ${sb.losses}L)`]);
      });
    }

    if (result.hourlyDistribution && result.hourlyDistribution.length > 0) {
      rows.push(['--- HOURLY SESSION BREAKDOWN ---', '---', '---']);
      result.hourlyDistribution.forEach(h => {
        rows.push([h.hour, `${h.winRate}%`, `${h.count} scans (${h.wins}W / ${h.losses}L)`]);
      });
    }

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ai_strategy_lab_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 pb-16 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-glass-border pb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/25">
              <FlaskConical className="h-3 w-3" /> AI Strategy Lab
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
              ● LIVE OTC ONLY
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-100 flex items-center gap-2">
            AI Strategy Lab
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-sans mt-1">
            Analyze your personal Live OTC trade execution logs with precision strategy filtering.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {result && result.signals > 0 && (
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded bg-slate-900 hover:bg-slate-800 border border-glass-border text-slate-200 font-mono font-bold text-xs uppercase tracking-wider transition-all hover:border-purple-500/50 shadow-md"
            >
              <Download className="h-3.5 w-3.5 text-purple-400" /> Export CSV
            </button>
          )}
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-purple-900/30 disabled:opacity-50"
          >
            <Zap className={`h-4 w-4 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? 'ANALYZING...' : 'ANALYZE'}
          </button>
        </div>
      </div>

      {/* Control / Filter Panel */}
      <div className="glass-panel p-6 rounded-2xl border border-glass-border bg-slate-950/60 relative overflow-hidden space-y-6">
        <CardShineEffect />
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
            <Filter className="h-4 w-4 text-purple-400" />
            <span>Strategy Parameters</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 font-mono text-xs">
            {/* 1. Pair Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Select Pair
              </label>
              <select
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                className="w-full bg-[#030812] border border-glass-border rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="ALL">ALL OTC Pairs</option>
                {OTC_PAIRS.map((p) => (
                  <option key={p.short} value={`${p.symbol} (OTC)`}>
                    {p.symbol} (OTC)
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Direction */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Direction
              </label>
              <div className="grid grid-cols-3 gap-1 bg-[#030812] p-1 rounded-lg border border-glass-border text-center">
                {(['ALL', 'CALL', 'PUT'] as const).map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setDirection(dir)}
                    className={`py-1.5 rounded text-[10px] font-bold uppercase transition-all ${
                      direction === dir
                        ? dir === 'CALL'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : dir === 'PUT'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Expiry */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Expiry Window
              </label>
              <div className="w-full bg-[#030812] border border-glass-border/70 rounded-lg px-3 py-2 text-slate-300 text-xs flex items-center justify-between font-bold">
                <span>1 MIN</span>
                <span className="text-[9px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">FIXED OTC</span>
              </div>
            </div>

            {/* 4. Period */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Select Period
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as any)}
                className="w-full bg-[#030812] border border-glass-border rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="all">All-Time History</option>
                <option value="last_30_days">Last 30 Days</option>
                <option value="last_7_days">Last 7 Days</option>
                <option value="last_90_days">Last 90 Days</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {/* 5. Session Time */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Session Window
              </label>
              <select
                value={session}
                onChange={(e) => setSession(e.target.value)}
                className="w-full bg-[#030812] border border-glass-border rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="ALL">All Hours (24H)</option>
                <option value="09:00">09:00 AM Session</option>
                <option value="11:00">11:00 AM Session</option>
                <option value="13:00">01:00 PM Session</option>
                <option value="15:00">03:00 PM Session</option>
                <option value="16:26">04:26 PM Session</option>
                <option value="17:25">05:25 PM Session</option>
                <option value="18:00">06:00 PM Session</option>
                <option value="20:00">08:00 PM Session</option>
                <option value="22:00">10:00 PM Session</option>
              </select>
            </div>
          </div>

          {/* Custom Date Inputs if Custom Period selected */}
          {period === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-glass-border/30 font-mono text-xs">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase">From Date</label>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="w-full bg-[#030812] border border-glass-border rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase">To Date</label>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="w-full bg-[#030812] border border-glass-border rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-lg text-rose-400 text-xs font-mono">
              {errorMsg}
            </div>
          )}
        </div>
      </div>

      {/* Analysis Result Card */}
      {result && (
        <div className="space-y-6">
          {/* Main Terminal Dossier */}
          <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-purple-500/30 bg-[#080518]/80 relative overflow-hidden font-mono shadow-2xl shadow-purple-950/40 space-y-6">
            <CardShineEffect />
            
            {/* Header Badge */}
            <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-glass-border/60">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
                  AI STRATEGY LAB ANALYSIS
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-100 flex items-center gap-2">
                  <span>{result.pairAnalyzed}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 font-normal">
                    {direction} · {expiry}
                  </span>
                </h2>
              </div>

              <div className="text-right">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest block">ANALYSIS TIMESTAMP</span>
                <span className="text-xs text-slate-400 font-semibold">{new Date().toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Feature 1: Core Metrics Grid with Pending Scans Counter */}
            <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 py-2 border-b border-glass-border/40">
              {/* Total Signals */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-glass-border/40 space-y-1">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider block">Total Signals</span>
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-200">{result.signals}</span>
                <span className="text-[9px] text-slate-500 block">
                  {result.settledSignals} settled {result.pending > 0 ? `· ${result.pending} pending` : ''}
                </span>
              </div>

              {/* Wins */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-emerald-500/20 space-y-1">
                <span className="text-[9px] text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Wins
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400">{result.wins}</span>
                <span className="text-[9px] text-slate-500 block">Resolved WIN</span>
              </div>

              {/* Losses */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-rose-500/20 space-y-1">
                <span className="text-[9px] text-rose-400 uppercase tracking-wider block flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> Losses
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold text-rose-400">{result.losses}</span>
                <span className="text-[9px] text-slate-500 block">Resolved LOSS</span>
              </div>

              {/* Pending Tile (Feature 1) */}
              <div className={`bg-slate-950/60 p-4 rounded-xl border space-y-1 ${
                result.pending > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-glass-border/40'
              }`}>
                <span className="text-[9px] text-amber-400 uppercase tracking-wider block flex items-center gap-1">
                  <Hourglass className="h-3 w-3 animate-pulse" /> Pending
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold text-amber-300">{result.pending}</span>
                <span className="text-[9px] text-slate-500 block">Awaiting Expiry</span>
              </div>

              {/* Historical Win Rate */}
              <div className="bg-purple-950/20 p-4 rounded-xl border border-purple-500/30 space-y-1 relative overflow-hidden">
                <span className="text-[9px] text-purple-300 uppercase tracking-wider block font-bold">
                  Historical Win Rate
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold text-purple-200">
                  {result.settledSignals > 0 ? `${result.winRate}%` : '0%'}
                </span>
                <span className="text-[9px] text-purple-400/70 block">
                  {result.settledSignals} Scans Evaluated
                </span>
              </div>
            </div>

            {/* Feature 2: Directional Edge & Feature 3: AI Verdict Banner */}
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Feature 2: Directional Edge (CALL vs PUT) */}
              <div className="p-4 rounded-xl bg-slate-950/50 border border-glass-border space-y-2.5">
                <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1 text-slate-300 font-bold">
                    <Target className="h-3.5 w-3.5 text-purple-400" /> Directional Edge
                  </span>
                  <span>CALL vs PUT</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-[#030812] border border-emerald-500/20">
                    <div className="text-[8px] text-slate-400 uppercase flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3 text-emerald-400" /> CALL Win Rate
                    </div>
                    <div className="text-sm font-extrabold text-emerald-400 mt-1">
                      {result.directionalEdge.callWinRate}%
                    </div>
                    <div className="text-[8px] text-slate-500">
                      {result.directionalEdge.callWins}W / {result.directionalEdge.callLosses}L
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#030812] border border-rose-500/20">
                    <div className="text-[8px] text-slate-400 uppercase flex items-center gap-1">
                      <ArrowDownRight className="h-3 w-3 text-rose-400" /> PUT Win Rate
                    </div>
                    <div className="text-sm font-extrabold text-rose-400 mt-1">
                      {result.directionalEdge.putWinRate}%
                    </div>
                    <div className="text-[8px] text-slate-500">
                      {result.directionalEdge.putWins}W / {result.directionalEdge.putLosses}L
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature 3: AI Strategy Verdict Banner */}
              <div className="lg:col-span-2 p-4 rounded-xl bg-gradient-to-r from-purple-950/30 to-slate-950 border border-purple-500/25 flex flex-col justify-between space-y-2">
                <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-purple-300 uppercase tracking-widest">
                  <Sparkles className="h-3.5 w-3.5 text-yellow-400" />
                  <span>AI Strategy Verdict</span>
                </div>
                <p className="text-xs text-slate-200 font-sans leading-relaxed font-medium">
                  {result.aiVerdict}
                </p>
                <div className="flex items-center gap-2 text-[9px] font-mono text-slate-500">
                  <span>OPTIMIZED FOR 1-MIN OTC EXPIRY</span>
                  <span>•</span>
                  <span>REAL-TIME DB RECONCILIATION</span>
                </div>
              </div>
            </div>

            {/* Strategic Intelligence Breakout Tiles */}
            <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Best Session */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-glass-border space-y-1.5">
                <div className="flex items-center gap-1.5 text-[9px] text-slate-500 uppercase tracking-wider">
                  <Clock className="h-3.5 w-3.5 text-sky-400" />
                  <span>Best Session</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-200">
                  {result.bestSession}
                </div>
                <div className="text-[10px] text-slate-500 font-sans">
                  Peak execution accuracy window
                </div>
              </div>

              {/* Best Pair */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-glass-border space-y-1.5">
                <div className="flex items-center gap-1.5 text-[9px] text-slate-500 uppercase tracking-wider">
                  <Award className="h-3.5 w-3.5 text-amber-400" />
                  <span>Best Pair</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-200 truncate">
                  {result.bestPair}
                </div>
                <div className="text-[10px] text-slate-500 font-sans">
                  {isAllPairs ? 'Top performing OTC market' : 'Selected target asset'}
                </div>
              </div>

              {/* Strongest Setup */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-emerald-500/20 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[9px] text-emerald-400 uppercase tracking-wider">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>Strongest Setup</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-emerald-300 truncate">
                  {result.strongestSetup}
                </div>
                <div className="text-[10px] text-slate-500 font-sans">
                  Highest win rate strategy model
                </div>
              </div>

              {/* Worst Condition */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-rose-500/20 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[9px] text-rose-400 uppercase tracking-wider">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Worst Condition</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-rose-300 truncate">
                  {result.worstCondition}
                </div>
                <div className="text-[10px] text-slate-500 font-sans">
                  Recommended risk filter trigger
                </div>
              </div>
            </div>

            {/* 3 VISUAL CHARTS ROW (Donut Chart + Hourly Bar Chart + Setup Bar Chart) */}
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
              {/* Chart 1: Outcome Distribution Donut Chart */}
              <div className="p-5 rounded-xl bg-slate-950/60 border border-glass-border flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 font-bold text-slate-300">
                    <PieChartIcon className="h-3.5 w-3.5 text-emerald-400" /> Outcome Distribution
                  </span>
                  <span className="text-slate-500">{result.signals} Total</span>
                </div>

                {outcomePieData.length > 0 ? (
                  <div className="space-y-2">
                    <div className="relative h-[180px] w-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip content={<CustomPieTooltip />} />
                          <Pie
                            data={outcomePieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={72}
                            paddingAngle={4}
                            stroke="rgba(0,0,0,0.5)"
                            strokeWidth={2}
                          >
                            {outcomePieData.map((entry, idx) => (
                              <Cell key={`cell-pie-${idx}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>

                      {/* Center Stat Badge */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-lg font-extrabold font-mono text-slate-100">
                          {result.settledSignals > 0 ? `${result.winRate}%` : '0%'}
                        </span>
                        <span className="text-[8px] font-mono text-purple-300 uppercase tracking-widest">
                          WIN RATE
                        </span>
                      </div>
                    </div>

                    {/* Donut Legend */}
                    <div className="flex flex-wrap items-center justify-center gap-2.5 text-[9px] font-mono pt-1">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Wins ({result.wins})
                      </span>
                      <span className="flex items-center gap-1 text-rose-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Losses ({result.losses})
                      </span>
                      {result.pending > 0 && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Pending ({result.pending})
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-[180px] flex items-center justify-center text-[10px] text-slate-500">
                    No outcome data available.
                  </div>
                )}
              </div>

              {/* Chart 2: Hourly Session Win Rate Distribution */}
              <div className="p-5 rounded-xl bg-slate-950/60 border border-glass-border flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 font-bold text-slate-300">
                    <Clock className="h-3.5 w-3.5 text-sky-400" /> Hourly Accuracy (% Win Rate)
                  </span>
                  <span className="text-slate-500">Power Hours</span>
                </div>

                {result.hourlyDistribution && result.hourlyDistribution.length > 0 ? (
                  <div className="h-[180px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={result.hourlyDistribution} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                        <XAxis dataKey="hour" stroke="#475569" fontSize={8} tickLine={false} />
                        <YAxis stroke="#475569" fontSize={8} domain={[0, 100]} tickLine={false} tickFormatter={(v) => `${v}%`} />
                        <Tooltip content={<CustomHourlyTooltip />} />
                        <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                          {result.hourlyDistribution.map((entry, idx) => (
                            <Cell 
                              key={`cell-hour-${idx}`} 
                              fill={entry.winRate >= 80 ? '#10b981' : entry.winRate >= 50 ? '#eab308' : '#f43f5e'} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[180px] flex items-center justify-center text-[10px] text-slate-500">
                    No session execution data logged yet.
                  </div>
                )}
              </div>

              {/* Chart 3: Strategy Model Comparative Win Rate */}
              <div className="p-5 rounded-xl bg-slate-950/60 border border-glass-border flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 font-bold text-slate-300">
                    <BarChart3 className="h-3.5 w-3.5 text-purple-400" /> Strategy Model Accuracy
                  </span>
                  <span className="text-slate-500">{result.setupBreakdown?.length || 0} Models</span>
                </div>

                {result.setupBreakdown && result.setupBreakdown.length > 0 ? (
                  <div className="h-[180px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={result.setupBreakdown} layout="vertical" margin={{ top: 10, right: 15, left: 35, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" horizontal={false} />
                        <XAxis type="number" stroke="#475569" fontSize={8} domain={[0, 100]} tickLine={false} tickFormatter={(v) => `${v}%`} />
                        <YAxis type="category" dataKey="setup" stroke="#94a3b8" fontSize={8} tickLine={false} width={75} />
                        <Tooltip content={<CustomSetupTooltip />} />
                        <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
                          {result.setupBreakdown.map((entry, idx) => (
                            <Cell 
                              key={`cell-setup-${idx}`} 
                              fill={entry.winRate >= 80 ? '#a855f7' : entry.winRate >= 50 ? '#06b6d4' : '#f43f5e'} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[180px] flex items-center justify-center text-[10px] text-slate-500">
                    No setup models executed yet.
                  </div>
                )}
              </div>
            </div>

            {/* Strategy Model Breakdown Details */}
            {result.setupBreakdown && result.setupBreakdown.length > 0 && (
              <div className="relative z-10 pt-2 space-y-3">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 font-bold text-slate-300">
                    <Layers className="h-3.5 w-3.5 text-purple-400" /> Strategy Model Details
                  </span>
                  <span>Detailed breakdown</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 font-mono text-xs">
                  {result.setupBreakdown.map((sb, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-slate-950/60 border border-glass-border/40 flex justify-between items-center">
                      <div className="space-y-0.5">
                        <div className="text-[11px] font-bold text-slate-200 truncate max-w-[180px]">
                          {sb.setup}
                        </div>
                        <div className="text-[9px] text-slate-500">
                          {sb.wins} Wins · {sb.losses} Losses ({sb.total} Total)
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-[10px] font-extrabold border ${
                        sb.winRate >= 80 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                          : sb.winRate >= 50
                          ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {sb.winRate}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Zero signals guidance if history is empty */}
            {result.signals === 0 && (
              <div className="mt-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-300 text-xs space-y-1 font-sans">
                <p className="font-bold font-mono text-[11px] uppercase tracking-wider flex items-center gap-1.5 text-amber-400">
                  💡 No Live OTC Scans Logged For This Filter
                </p>
                <p className="text-slate-400">
                  Perform manual scans on the <strong className="text-slate-200">Signal Dashboard (Live OTC)</strong> to build your personalized AI Strategy Lab historical records.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
