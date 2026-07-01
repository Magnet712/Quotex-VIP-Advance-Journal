'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  getAdminSignalAnalytics,
  getAdminOptimizationSettings,
  updateAdminOptimizationSettings,
  AnalyticsFilters
} from '@/app/actions/admin_optimization';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  TrendingUp, Activity, ShieldAlert, Award, Zap, Sliders, CheckSquare, ListFilter,
  RefreshCw, Radio, Check, X, Loader, Search, Calendar, Filter, ChevronDown, Clock, BarChart2
} from 'lucide-react';

const OTC_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY', 'EUR/GBP',
  'NZD/USD', 'USD/CHF', 'EUR/AUD', 'GBP/AUD', 'AUD/JPY', 'CAD/JPY', 'CHF/JPY', 'EUR/CAD',
  'GBP/CAD', 'USD/SGD', 'USD/INR', 'USD/BRL', 'USD/MXN', 'EUR/CHF', 'GBP/CHF', 'AUD/CAD',
  'AUD/NZD', 'NZD/JPY', 'GBP/NZD', 'EURNZD', 'CAD/CHF', 'USD/ZAR', 'USD/TRY', 'USD/ARS',
  'USD/PKR', 'USD/BDT'
];

const LIVE_MARKET_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'EUR/GBP', 'EUR/JPY',
  'CAD/JPY', 'GBP/JPY', 'AUD/CAD', 'AUD/CHF', 'GBP/AUD', 'EUR/CHF'
];

export default function AdminSignalAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'analytics' | 'controls' | 'review' | 'checklist'>('analytics');

  // Analytics Filters & Data
  const [filters, setFilters] = useState<AnalyticsFilters>({
    pair: 'ALL',
    timeframe: 'ALL',
    strategyVersion: 'ALL',
    result: 'ALL',
    source: 'ALL',
    confidenceMin: 80,
    confidenceMax: 100,
    dateFrom: '',
    dateTo: ''
  });

  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Settings state (Admin Controls)
  const [settings, setSettings] = useState<Record<string, string>>({
    min_confidence: '80',
    allowed_signal_hours: '08:00-12:00,18:00-22:00',
    losing_streak_limit: '3',
    losing_streak_pause_minutes: '15',
    premium_filter_mode: 'PRODUCTION',
    min_quality_score: '80',
    disabled_pairs: '',
    premium_signal_status: 'ACTIVE',
    paused_until: ''
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auth + initial data load
  const loadData = async (currentFilters = filters) => {
    setLoading(true);
    setAuthError(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/admin/login');
        return;
      }

      // Load Settings
      const settingsRes = await getAdminOptimizationSettings();
      if (!settingsRes.success) {
        setAuthError(true);
        setLoading(false);
        return;
      }
      if (settingsRes.settings) {
        setSettings(settingsRes.settings);
      }

      // Load Analytics
      const analyticsRes = await getAdminSignalAnalytics(currentFilters);
      if (analyticsRes.success) {
        setAnalytics(analyticsRes);
      }
    } catch {
      setAuthError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApplyFilters = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnalyticsLoading(true);
    try {
      const analyticsRes = await getAdminSignalAnalytics(filters);
      if (analyticsRes.success) {
        setAnalytics(analyticsRes);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleSaveSettings = async (newSettings = settings) => {
    setSettingsLoading(true);
    setSaveMessage(null);
    try {
      const res = await updateAdminOptimizationSettings(newSettings);
      if (res.success) {
        setSaveMessage({ type: 'success', text: 'System optimization rules updated successfully.' });
        setSettings(newSettings);
        // Refresh analytics as settings (disabled pairs) affects status
        const analyticsRes = await getAdminSignalAnalytics(filters);
        if (analyticsRes.success) {
          setAnalytics(analyticsRes);
        }
      } else {
        setSaveMessage({ type: 'error', text: res.error || 'Failed to update system rules.' });
      }
    } catch (err: any) {
      setSaveMessage({ type: 'error', text: err.message });
    } finally {
      setSettingsLoading(false);
    }
  };

  // Setting handlers
  const handleTogglePair = (pairSymbol: string) => {
    const disabledStr = settings.disabled_pairs ?? '';
    let list = disabledStr.split(',').map(p => p.trim()).filter(Boolean);
    if (list.includes(pairSymbol)) {
      list = list.filter(p => p !== pairSymbol);
    } else {
      list.push(pairSymbol);
    }
    const updatedSettings = { ...settings, disabled_pairs: list.join(',') };
    setSettings(updatedSettings);
    handleSaveSettings(updatedSettings);
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center space-y-4">
          <Loader className="h-8 w-8 animate-spin text-rose-500" />
          <span className="text-xs font-mono text-slate-500">DECRYPTING SECURITY ANALYSIS LAYERS...</span>
        </main>
        <Footer />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center space-y-4 p-4 text-center">
          <ShieldAlert className="h-12 w-12 text-rose-500 animate-pulse" />
          <h2 className="text-xl font-bold font-mono text-slate-200">ACCESS DENIED</h2>
          <p className="text-sm text-slate-400 max-w-md">
            You do not possess the administrative keys required to view the signals optimization ledger.
          </p>
          <button
            onClick={() => router.push('/admin/login')}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded text-xs font-mono text-white transition-colors"
          >
            Go to Admin Sign In
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  // Derived Checklist Values
  const checklistSignals = (analytics?.summary?.totalSignals ?? 0) >= 500;
  const checklistMode = settings.premium_signal_status === 'ACTIVE'; // active or not paused
  const checklistAccuracy = (analytics?.summary?.accuracy ?? 0) >= 75;
  const checklistStreak = (analytics?.summary?.maxLossStreak ?? 0) <= 4;
  const checklistPairs = OTC_PAIRS.length - (settings.disabled_pairs ? settings.disabled_pairs.split(',').filter(Boolean).length : 0) > 0;
  const checklistConfidence = parseInt(settings.min_confidence ?? '80', 10) >= 80;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        
        {/* Title / Action Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
          <div>
            <span className="text-[10px] font-mono text-rose-500 font-bold uppercase tracking-wider block">premium filter center</span>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-100">
              Signal Quality Optimization
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-glass-border hover:border-neon-green/30 bg-slate-900/40 text-slate-400 hover:text-neon-green text-xs font-mono transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> REFRESH LEDGER
            </button>
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-700 bg-slate-900 hover:border-slate-500 text-slate-300 text-xs font-mono transition-colors"
            >
              Traders Portal
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="border-b border-glass-border flex space-x-6 text-xs font-mono">
          {[
            { id: 'analytics', label: 'ANALYTICS CENTER', icon: Activity },
            { id: 'controls', label: 'OPTIMIZATION RULES', icon: Sliders },
            { id: 'review', label: 'ADMIN REVIEW PANEL', icon: ListFilter },
            { id: 'checklist', label: 'PREMIUM LAUNCH CHECKLIST', icon: CheckSquare }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 flex items-center gap-2 transition-all border-b-2 font-bold tracking-wider uppercase ${
                activeTab === tab.id
                  ? 'border-rose-500 text-rose-500 glow-text-gold'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ─── TAB CONTENT 1: ANALYTICS CENTER ─── */}
        {activeTab === 'analytics' && (
          <div className="space-y-8 animate-fadeIn">
            {/* Aggregate Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'TOTAL SIGNALS', value: analytics?.summary?.totalSignals ?? 0, icon: Radio, color: 'text-slate-300' },
                { label: 'WIN ACCURACY', value: `${analytics?.summary?.accuracy ?? 0}%`, icon: TrendingUp, color: (analytics?.summary?.accuracy ?? 0) >= 80 ? 'text-neon-green glow-text-green' : 'text-rose-400' },
                { label: 'AVG CONFIDENCE', value: `${analytics?.summary?.avgConfidence ?? 0}%`, icon: Award, color: 'text-gold-vip glow-text-gold' },
                { label: 'STREAKS (WIN/LOSS)', value: `${analytics?.summary?.avgWinStreak ?? 0} / ${analytics?.summary?.maxLossStreak ?? 0}`, icon: Zap, color: 'text-sky-400' }
              ].map((item, i) => (
                <div key={i} className="glass-panel p-4 rounded-lg flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider font-mono">
                    <span>{item.label}</span>
                    <item.icon className="h-3.5 w-3.5" />
                  </div>
                  <div className={`text-xl font-bold font-mono mt-3 ${item.color}`}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Analytics Filters Form */}
              <div className="lg:col-span-1 glass-panel rounded-xl border border-glass-border p-6 space-y-4 h-fit">
                <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
                  <Filter className="h-4 w-4 text-rose-500" />
                  <span className="text-xs font-mono font-bold text-rose-500 tracking-wider">FILTERS</span>
                </div>
                <form onSubmit={handleApplyFilters} className="space-y-4 font-mono text-xs text-slate-300">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 uppercase font-bold">Trading Pair</label>
                    <select
                      value={filters.pair}
                      onChange={e => setFilters({ ...filters, pair: e.target.value })}
                      className="w-full bg-[#030812] border border-glass-border rounded px-3 py-2 text-slate-200 outline-none"
                    >
                      <option value="ALL">All Pairs</option>
                      {filters.source === 'live_market' ? (
                        LIVE_MARKET_PAIRS.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))
                      ) : (
                        OTC_PAIRS.map(p => (
                          <option key={p} value={`${p} OTC`}>{p} OTC</option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 uppercase font-bold">Source</label>
                    <select
                      value={filters.source}
                      onChange={e => setFilters({ ...filters, source: e.target.value })}
                      className="w-full bg-[#030812] border border-glass-border rounded px-3 py-2 text-slate-200 outline-none"
                    >
                      <option value="ALL">All Sources</option>
                      <option value="live_otc">Live OTC</option>
                      <option value="live_market">Live Market</option>
                      <option value="simulation">Simulation</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 uppercase font-bold">Strategy Version</label>
                    <select
                      value={filters.strategyVersion}
                      onChange={e => setFilters({ ...filters, strategyVersion: e.target.value })}
                      className="w-full bg-[#030812] border border-glass-border rounded px-3 py-2 text-slate-200 outline-none"
                    >
                      <option value="ALL">All Versions</option>
                      <option value="v1.0">v1.0 (Standard)</option>
                      <option value="v1.1">v1.1 (Advanced)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 uppercase font-bold">Min Conf %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={filters.confidenceMin}
                        onChange={e => setFilters({ ...filters, confidenceMin: parseInt(e.target.value, 10) || 0 })}
                        className="w-full bg-[#030812] border border-glass-border rounded px-3 py-2 text-slate-200 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 uppercase font-bold">Max Conf %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={filters.confidenceMax}
                        onChange={e => setFilters({ ...filters, confidenceMax: parseInt(e.target.value, 10) || 0 })}
                        className="w-full bg-[#030812] border border-glass-border rounded px-3 py-2 text-slate-200 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 uppercase font-bold">From Date</label>
                      <input
                        type="date"
                        value={filters.dateFrom}
                        onChange={e => setFilters({ ...filters, dateFrom: e.target.value })}
                        className="w-full bg-[#030812] border border-glass-border rounded px-2.5 py-2 text-slate-200 outline-none text-[10px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 uppercase font-bold">To Date</label>
                      <input
                        type="date"
                        value={filters.dateTo}
                        onChange={e => setFilters({ ...filters, dateTo: e.target.value })}
                        className="w-full bg-[#030812] border border-glass-border rounded px-2.5 py-2 text-slate-200 outline-none text-[10px]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={analyticsLoading}
                    className="w-full py-2.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {analyticsLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span>FILTER METRICS</span>
                  </button>
                </form>
              </div>

              {/* Pair performance and Strategy Versions */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Strategy Performance */}
                <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4">
                  <div className="text-xs font-mono font-bold text-slate-300 tracking-wider">STRATEGY PERFORMANCE BREAKDOWN</div>
                  <div className="grid grid-cols-2 gap-4">
                    {analytics?.strategyPerformance?.map((strat: any) => (
                      <div key={strat.version} className="bg-[#020617]/50 border border-glass-border/40 p-4 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-slate-300">Version {strat.version}</span>
                          <span className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded border ${
                            strat.accuracy >= 80 ? 'text-neon-green border-neon-green/30 bg-neon-green/5' : 'text-amber-400 border-amber-500/30 bg-amber-500/5'
                          }`}>{strat.accuracy}% Accuracy</span>
                        </div>
                        <div className="grid grid-cols-3 text-center text-[10px] font-mono text-slate-500 pt-1">
                          <div>
                            <div>TOTAL</div>
                            <div className="text-slate-300 font-bold mt-0.5">{strat.total}</div>
                          </div>
                          <div>
                            <div>WINS</div>
                            <div className="text-neon-green font-bold mt-0.5">{strat.wins}</div>
                          </div>
                          <div>
                            <div>LOSSES</div>
                            <div className="text-rose-400 font-bold mt-0.5">{strat.losses}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!analytics?.strategyPerformance || analytics.strategyPerformance.length === 0) && (
                      <div className="col-span-2 text-center text-slate-500 font-mono text-xs py-4">No strategy performance records.</div>
                    )}
                  </div>
                </div>

                {/* Hourly Performance */}
                <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-3">
                  <div className="text-xs font-mono font-bold text-slate-300 tracking-wider">TIME WINDOW PERFORMANCE (IST)</div>
                  <div className="max-h-[220px] overflow-y-auto pr-2 divide-y divide-glass-border/30">
                    {analytics?.hourlyPerformance?.filter((h: any) => h.total > 0).map((h: any) => (
                      <div key={h.hour} className="py-2.5 flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-300">{h.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500 text-[10px]">{h.wins}W - {h.losses}L</span>
                          <span className={`font-bold ${h.accuracy >= 80 ? 'text-neon-green' : h.accuracy >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {h.accuracy}% Acc
                          </span>
                        </div>
                      </div>
                    ))}
                    {(!analytics?.hourlyPerformance || analytics.hourlyPerformance.filter((h: any) => h.total > 0).length === 0) && (
                      <div className="text-center text-slate-500 font-mono text-xs py-8">No hourly distribution records.</div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Pair Rankings */}
            <div className="glass-panel p-6 rounded-xl border border-glass-border space-y-4">
              <div className="text-xs font-mono font-bold text-slate-300 tracking-wider">PAIR ACCURACY RANKINGS & CONFIGURATION</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {analytics?.pairRankings?.map((item: any) => (
                  <div
                    key={item.pair}
                    className={`p-3 rounded border flex items-center justify-between font-mono text-xs transition-colors ${
                      item.status === 'DISABLED'
                        ? 'border-rose-500/25 bg-rose-950/5 opacity-55'
                        : 'border-glass-border/60 bg-[#020617]/50 hover:bg-slate-900/30'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-200">{item.pair.endsWith('OTC') ? item.pair : item.pair}</div>
                      <div className="text-[9px] text-slate-500 mt-1">
                        Signals: {item.total} &bull; Acc: <span className={`font-bold ${item.accuracy >= 80 ? 'text-neon-green' : item.accuracy >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>{item.accuracy}%</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTogglePair(item.pair)}
                      className={`px-3 py-1 rounded text-[9px] font-bold tracking-wider border ${
                        item.status === 'ACTIVE'
                          ? 'border-neon-green/40 text-neon-green hover:border-rose-500/40 hover:text-rose-400 bg-neon-green/5'
                          : 'border-rose-500/30 text-rose-400 hover:border-neon-green/40 hover:text-neon-green bg-rose-500/5'
                      }`}
                    >
                      {item.status === 'ACTIVE' ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                ))}
                {(!analytics?.pairRankings || analytics.pairRankings.length === 0) && (
                  <div className="col-span-3 text-center text-slate-500 font-mono text-xs py-8">No trading pair performance records.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB CONTENT 2: OPTIMIZATION RULES ─── */}
        {activeTab === 'controls' && (
          <div className="space-y-8 animate-fadeIn max-w-4xl mx-auto">
            <div className="glass-panel rounded-xl border border-glass-border p-6 space-y-6">
              <div className="flex items-center gap-3 border-b border-glass-border/40 pb-4">
                <Sliders className="h-5 w-5 text-rose-500 animate-pulse" />
                <div>
                  <h3 className="text-sm font-mono font-bold text-slate-200">System Optimization Policies</h3>
                  <p className="text-[10px] font-mono text-slate-500">Configure parameters that filters and controls signals launch</p>
                </div>
              </div>

              {saveMessage && (
                <div className={`p-4 rounded border text-xs leading-relaxed font-mono ${
                  saveMessage.type === 'success' ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
                }`}>
                  {saveMessage.text}
                </div>
              )}

              <div className="space-y-6 font-mono text-xs">
                
                {/* Filter Mode & Status */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">PREMIUM SIGNAL FILTER MODE</label>
                    <div className="flex gap-2">
                      {['TEST', 'PRODUCTION'].map(mode => (
                        <button
                          key={mode}
                          onClick={() => {
                            const updated = { ...settings, premium_filter_mode: mode };
                            setSettings(updated);
                            handleSaveSettings(updated);
                          }}
                          className={`flex-1 py-2.5 rounded border font-bold text-[10px] tracking-wider transition-all uppercase ${
                            settings.premium_filter_mode === mode
                              ? mode === 'TEST'
                                ? 'bg-rose-500/15 border-rose-500/50 text-rose-400 cursor-default'
                                : 'bg-neon-green/15 border-neon-green/50 text-neon-green cursor-default'
                              : 'bg-[#030812] border-glass-border text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {mode === 'TEST' ? 'TEST MODE' : 'PRODUCTION'}
                        </button>
                      ))}
                    </div>
                    <span className="text-[8px] text-slate-500 block leading-relaxed">
                      TEST MODE hides live premium signals from normal traders, making them visible only to admin credentials.
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">PREMIUM SIGNAL STATUS</label>
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-bold px-3 py-1 rounded border ${
                        settings.premium_signal_status === 'ACTIVE'
                          ? 'text-neon-green border-neon-green/40 bg-neon-green/10'
                          : 'text-rose-400 border-rose-500/40 bg-rose-500/10 animate-pulse'
                      }`}>
                        {settings.premium_signal_status}
                      </span>
                      {settings.premium_signal_status === 'PAUSED' && settings.paused_until && (
                        <span className="text-[9px] text-slate-500">
                          Paused until: {new Date(settings.paused_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                      {settings.premium_signal_status === 'PAUSED' && (
                        <button
                          onClick={() => {
                            const updated = { ...settings, premium_signal_status: 'ACTIVE', paused_until: '' };
                            setSettings(updated);
                            handleSaveSettings(updated);
                          }}
                          className="px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:border-neon-green/30 text-slate-300 hover:text-neon-green text-[9px] font-bold tracking-wider"
                        >
                          FORCE RESUME
                        </button>
                      )}
                    </div>
                    <span className="text-[8px] text-slate-500 block leading-relaxed">
                      Pause updates automatically trigger if losing streak protections are hit, and automatically clears after its timer expires.
                    </span>
                  </div>
                </div>

                {/* Min Confidence & Min Quality Score Sliders */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-glass-border/30">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">MINIMUM CONFIDENCE FILTER</label>
                      <span className="text-xs text-rose-500 font-bold font-mono">{settings.min_confidence}%</span>
                    </div>
                    <input
                      type="range"
                      min="75"
                      max="95"
                      value={settings.min_confidence}
                      onChange={e => setSettings({ ...settings, min_confidence: e.target.value })}
                      onMouseUp={() => handleSaveSettings()}
                      onTouchEnd={() => handleSaveSettings()}
                      className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer border border-slate-800 accent-rose-500"
                    />
                    <span className="text-[8px] text-slate-500 block leading-relaxed">
                      Filters out any signals from the strategy generator that yield confidence below this rating threshold.
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">MINIMUM QUALITY SCORE FILTER</label>
                      <span className="text-xs text-neon-green font-bold font-mono">{settings.min_quality_score}/100</span>
                    </div>
                    <input
                      type="range"
                      min="70"
                      max="95"
                      value={settings.min_quality_score}
                      onChange={e => setSettings({ ...settings, min_quality_score: e.target.value })}
                      onMouseUp={() => handleSaveSettings()}
                      onTouchEnd={() => handleSaveSettings()}
                      className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer border border-slate-800 accent-neon-green"
                    />
                    <span className="text-[8px] text-slate-500 block leading-relaxed">
                      Quality Score = (Pair Performance + Overall Accuracy + Recent Performance + Confidence) / 4. Only signals with QS &ge; this value are released.
                    </span>
                  </div>
                </div>

                {/* Hours allowed */}
                <div className="space-y-2 pt-4 border-t border-glass-border/30">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">ALLOWED SIGNAL HOUR WINDOWS (IST)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 08:00-12:00,18:00-22:00"
                      value={settings.allowed_signal_hours}
                      onChange={e => setSettings({ ...settings, allowed_signal_hours: e.target.value })}
                      className="flex-1 bg-[#030812] border border-glass-border rounded px-3 py-2 text-slate-200 outline-none"
                    />
                    <button
                      onClick={() => handleSaveSettings()}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold uppercase text-[10px]"
                    >
                      SAVE TIME
                    </button>
                  </div>
                  <span className="text-[8px] text-slate-500 block leading-relaxed">
                    Comma-separated 24-hour ranges in IST time. Signals outside these time blocks are automatically blocked from premium launch.
                  </span>
                </div>

                {/* Losing Streak Protection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-glass-border/30">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">CONSECUTIVE LOSSES THRESHOLD</label>
                    <input
                      type="number"
                      min="2"
                      max="10"
                      value={settings.losing_streak_limit}
                      onChange={e => setSettings({ ...settings, losing_streak_limit: e.target.value })}
                      onBlur={() => handleSaveSettings()}
                      className="w-full bg-[#030812] border border-glass-border rounded px-3 py-2 text-slate-200 outline-none"
                    />
                    <span className="text-[8px] text-slate-500 block leading-relaxed">
                      Triggers safety pause if N consecutive signals of the same mode end in a LOSS.
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">PAUSE DURATION (MINUTES)</label>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={settings.losing_streak_pause_minutes}
                      onChange={e => setSettings({ ...settings, losing_streak_pause_minutes: e.target.value })}
                      onBlur={() => handleSaveSettings()}
                      className="w-full bg-[#030812] border border-glass-border rounded px-3 py-2 text-slate-200 outline-none"
                    />
                    <span className="text-[8px] text-slate-500 block leading-relaxed">
                      Length of the premium signal block freeze once protection is triggered.
                    </span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ─── TAB CONTENT 3: ADMIN REVIEW PANEL ─── */}
        {activeTab === 'review' && (
          <div className="space-y-8 animate-fadeIn">
            {/* Summary + Recommendations */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Bad Performing / Best performing Strategy */}
              <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4">
                <div className="text-xs font-mono font-bold text-rose-500 tracking-wider">PERFORMANCE ADVISORY</div>
                <div className="space-y-3 font-mono text-xs">
                  <div className="space-y-1">
                    <div className="text-[8px] text-slate-500 uppercase">Worst Performing Pairs (&lt;70% Acc)</div>
                    <div className="text-slate-300 font-bold">
                      {analytics?.recommendedSettings?.disabledPairsRecommend?.length > 0
                        ? analytics.recommendedSettings.disabledPairsRecommend.join(', ')
                        : 'None detected (Stable pairs)'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[8px] text-slate-500 uppercase">Best Performing Strategy version</div>
                    <div className="text-neon-green font-bold uppercase">
                      Version {analytics?.recommendedSettings?.bestStrategy ?? 'v1.1'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommended Settings Card */}
              <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4 md:col-span-2">
                <div className="text-xs font-mono font-bold text-gold-vip tracking-wider">RECOMMENDED SYSTEM OPTIMIZATIONS</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-[10px] text-slate-400">
                  <div className="space-y-1">
                    <div className="text-[8px] text-slate-500 uppercase">Confidence threshold</div>
                    <div className="text-slate-200 font-bold text-xs">85%</div>
                    <div className="text-[8px]">Filters noisy signals</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[8px] text-slate-500 uppercase">Best Trading times (IST)</div>
                    <div className="text-slate-200 font-bold text-xs truncate">
                      {analytics?.recommendedSettings?.allowedHours ?? '08:00-12:00'}
                    </div>
                    <div className="text-[8px]">Highest historical accuracy</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[8px] text-slate-500 uppercase">Quality rating limit</div>
                    <div className="text-slate-200 font-bold text-xs">83/100</div>
                    <div className="text-[8px]">Ensures optimal win percentages</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Last 100 signals table */}
            <div className="glass-panel rounded-xl border border-glass-border overflow-hidden">
              <div className="px-5 py-4 border-b border-glass-border/40 flex justify-between items-center">
                <div className="text-xs font-mono font-bold text-slate-300 tracking-wider">LAST 100 SIGNALS RECORD LOG</div>
                <div className="text-[9px] font-mono text-slate-500">Chronological execution history</div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-glass-border text-slate-500 text-[10px] tracking-wider uppercase font-bold">
                      <th className="p-4">Timestamp (IST)</th>
                      <th className="p-4">Pair</th>
                      <th className="p-4">Direction</th>
                      <th className="p-4 text-center">Confidence</th>
                      <th className="p-4 text-center">Quality Score</th>
                      <th className="p-4 text-center">Strategy Ver</th>
                      <th className="p-4 text-center">Status</th>
                      <th className="p-4 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/40">
                    {analytics?.recentSignals?.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-600">
                          NO SIGNALS RECORDED YET.
                        </td>
                      </tr>
                    ) : (
                      analytics?.recentSignals?.map((sig: any) => {
                        const istDate = new Date(new Date(sig.entry_time).getTime() + 5.5 * 60 * 60 * 1000);
                        const timestampStr = `${istDate.getUTCHours().toString().padStart(2, '0')}:${istDate.getUTCMinutes().toString().padStart(2, '0')} IST`;
                        
                        return (
                          <tr key={sig.id} className="hover:bg-slate-900/30 transition-colors">
                            <td className="p-4 text-slate-400">{timestampStr}</td>
                            <td className="p-4 font-bold text-slate-200">{sig.pair}</td>
                            <td className={`p-4 font-bold ${sig.direction === 'CALL' ? 'text-neon-green' : 'text-rose-400'}`}>
                              {sig.direction}
                            </td>
                            <td className="p-4 text-center text-slate-300 font-bold">{sig.confidence}%</td>
                            <td className="p-4 text-center text-slate-300 font-bold">{sig.quality_score ?? '—'}</td>
                            <td className="p-4 text-center text-slate-500">{sig.strategy_version ?? 'v1.0'}</td>
                            <td className="p-4 text-center">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold border ${
                                sig.is_premium
                                  ? 'text-neon-green border-neon-green/30 bg-neon-green/5'
                                  : 'text-rose-400 border-rose-500/30 bg-rose-500/5'
                              }`}>
                                {sig.is_premium ? 'PREMIUM' : 'FILTERED'}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold font-mono border ${
                                sig.result === 'WIN'
                                  ? 'text-neon-green border-neon-green/30 bg-neon-green/5'
                                  : sig.result === 'LOSS'
                                  ? 'text-rose-400 border-rose-500/30 bg-rose-500/5'
                                  : 'text-slate-500 border-slate-700 bg-slate-900/30'
                              }`}>
                                {sig.result}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB CONTENT 4: PREMIUM LAUNCH CHECKLIST ─── */}
        {activeTab === 'checklist' && (
          <div className="space-y-8 animate-fadeIn max-w-2xl mx-auto">
            <div className="glass-panel rounded-xl border border-glass-border p-6 space-y-6">
              <div className="flex items-center gap-3 border-b border-glass-border/40 pb-4">
                <CheckSquare className="h-5 w-5 text-gold-vip" />
                <div>
                  <h3 className="text-sm font-mono font-bold text-slate-200">Premium Launch Verification Checklist</h3>
                  <p className="text-[10px] font-mono text-slate-500">Ensure the signal pipeline is fully optimized before releasing subscription access</p>
                </div>
              </div>

              {/* Checklist items */}
              <div className="space-y-4 font-mono text-xs">
                {[
                  {
                    title: '500+ Tracked Signals Saved',
                    desc: `Verify enough historical database entries exist to ensure strategy stability. Current: ${analytics?.summary?.totalSignals ?? 0} signals.`,
                    checked: checklistSignals
                  },
                  {
                    title: 'Live OTC Signal Mode Active',
                    desc: 'The signal engine must have premium validation active without being in safety pause mode.',
                    checked: checklistMode
                  },
                  {
                    title: 'Stable Win Accuracy (>= 75%)',
                    desc: `Aggregate win percentage must be above target profit levels. Current: ${analytics?.summary?.accuracy ?? 0}%.`,
                    checked: checklistAccuracy
                  },
                  {
                    title: 'Losing Streak acceptable (<= 4 consecutive)',
                    desc: `Max consecutive losing runs should remain in acceptable boundaries. Current: ${analytics?.summary?.maxLossStreak ?? 0} losses.`,
                    checked: checklistStreak
                  },
                  {
                    title: 'Pairs Optimized (At least 1 active)',
                    desc: 'Low accuracy pairs must be disabled to ensure subscription grade wins.',
                    checked: checklistPairs
                  },
                  {
                    title: 'Confidence Filter Configured',
                    desc: `Minimum signal generator confidence must be configured to at least 80%. Current: ${settings.min_confidence}%.`,
                    checked: checklistConfidence
                  }
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded border flex items-start gap-4 transition-colors ${
                      item.checked ? 'border-emerald-500/20 bg-emerald-950/5' : 'border-glass-border/40 bg-slate-900/20'
                    }`}
                  >
                    <div className="pt-0.5">
                      {item.checked ? (
                        <div className="h-5 w-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 animate-pulse">
                          <X className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className={`font-bold text-xs ${item.checked ? 'text-slate-200' : 'text-slate-400'}`}>
                        {item.title}
                      </div>
                      <div className="text-[10px] text-slate-500 leading-relaxed">
                        {item.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Final Launch Verdict */}
              <div className="border-t border-glass-border/40 pt-4 flex flex-col items-center justify-center p-4 text-center space-y-3">
                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">LAUNCH READINESS STATUS</div>
                {checklistSignals && checklistMode && checklistAccuracy && checklistStreak && checklistPairs && checklistConfidence ? (
                  <>
                    <div className="text-emerald-400 font-extrabold text-sm tracking-widest font-mono glow-text-green animate-pulse">
                      ✓ PIPELINE FULLY OPTIMIZED & READY FOR PREMIUM LAUNCH
                    </div>
                    <p className="text-[10px] text-slate-400 max-w-md">
                      All security criteria, accuracy bounds, and filters have been verified. You are clear to switch Premium Filter mode to PRODUCTION.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-amber-400 font-extrabold text-sm tracking-widest font-mono animate-pulse">
                      ⚠ READY CHECK FAILED — OPTIMIZATIONS REQUIRED
                    </div>
                    <p className="text-[10px] text-slate-500 max-w-md">
                      Please check the list above. Disable low win rate pairs, ensure confidence settings are configured, and wait for more signal collections before production release.
                    </p>
                  </>
                )}
              </div>

            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
