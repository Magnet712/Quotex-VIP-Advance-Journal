'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getPerformanceStats } from '@/app/actions/performance';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import { sourceLabel, type DataPipeline } from '@/lib/pipeline';
import LockedFeature from '@/components/LockedFeature';
import { 
  LineChart, Line, BarChart, Bar, CartesianGrid, 
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Layers, CheckCircle, XCircle, Clock, 
  Activity, ArrowDown, ArrowUp, AlertCircle, RefreshCw, BarChart3
} from 'lucide-react';

export default function PerformancePage() {
  const [loading, setLoading] = useState(true);
  const [userAccess, setUserAccess] = useState<any>({
    vipAccess: false,
    premiumAccess: false,
    status: 'pending'
  });

  // Settings & Toggles
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'custom'>('7d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pipeline, setPipeline] = useState<DataPipeline>('ALL');
  
  const [performance, setPerformance] = useState<any>(null);
  const [hasData, setHasData] = useState(false);

  // Sync date ranges based on selection
  useEffect(() => {
    if (range === 'custom') return;
    
    const end = new Date();
    const start = new Date();
    if (range === '7d') {
      start.setDate(end.getDate() - 7);
    } else if (range === '30d') {
      start.setDate(end.getDate() - 30);
    } else if (range === '90d') {
      start.setDate(end.getDate() - 90);
    }
    
    setDateFrom(start.toISOString().split('T')[0]);
    setDateTo(end.toISOString().split('T')[0]);
  }, [range]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accessRes, statsRes] = await Promise.all([
        getUserAccessState(),
        getPerformanceStats({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          source: pipeline
        })
      ]);

      if (accessRes.success) {
        setUserAccess({
          vipAccess: accessRes.vipAccess,
          premiumAccess: accessRes.premiumAccess,
          status: accessRes.status
        });
      }

      if (statsRes.success) {
        setHasData(statsRes.hasData ?? false);
        setPerformance(statsRes.stats);
      }
    } catch (err) {
      console.error('Failed to load performance analytics stats:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, pipeline]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Activity className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">AGGREGATING METRIC DATABASES...</span>
      </div>
    );
  }

  const profile = {
    vip_access: userAccess.vipAccess,
    premium_access: userAccess.premiumAccess,
    status: userAccess.status
  };

  if (!canAccess('performance-reports', profile)) {
    return <LockedFeature feature="performance-reports" />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto animate-fadeIn text-left">
      
      {/* Title / Action bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
        <div>
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">analytical reports</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Performance Dashboard</h1>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-2 rounded border border-glass-border hover:bg-slate-900/40 text-xs font-mono font-bold text-slate-400 hover:text-slate-200 transition-all uppercase"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Date & Filter Settings bar */}
      <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-4 transition-all duration-200 hover:border-glass-border/50">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-mono text-xs">
          
          {/* Ranges Toggles */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest w-16">Timeframe</span>
            {[
              { id: '7d', label: 'LAST 7 DAYS' },
              { id: '30d', label: 'LAST 30 DAYS' },
              { id: '90d', label: 'LAST 90 DAYS' },
              { id: 'custom', label: 'CUSTOM RANGE' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setRange(t.id as any)}
                className={`px-3 py-1.5 rounded text-[10px] font-bold border transition-all ${
                  range === t.id
                    ? 'bg-neon-green/10 border-neon-green/30 text-neon-green'
                    : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Pipeline selector */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest w-12">Pipeline</span>
            {[
              { id: 'ALL' as DataPipeline, label: 'ALL' },
              { id: 'live_otc' as DataPipeline, label: sourceLabel('live_otc') },
              { id: 'live_market' as DataPipeline, label: sourceLabel('live_market') },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPipeline(p.id)}
                className={`px-3 py-1.5 rounded text-[10px] font-bold border transition-all ${
                  pipeline === p.id
                    ? 'bg-neon-green/10 border-neon-green/30 text-neon-green'
                    : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

        </div>

        {/* Custom date range inputs */}
        {range === 'custom' && (
          <div className="grid grid-cols-2 gap-4 max-w-md pt-2 border-t border-glass-border/30 font-mono text-xs">
            <div className="space-y-1">
              <label className="text-[9px] text-slate-500 uppercase block">Start Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-slate-200"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-slate-500 uppercase block">End Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-slate-200"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main performance stats layout */}
      {hasData && performance ? (
        <div className="space-y-8">
          
          {/* Metrics grids */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[
              { label: 'ACCURACY', value: `${performance.accuracy}%`, icon: CheckCircle, color: 'text-neon-green' },
              { label: 'TOTAL SIGNALS', value: String(performance.total), icon: Layers, color: 'text-slate-200' },
              { label: 'WINS', value: String(performance.wins), icon: CheckCircle, color: 'text-neon-green' },
              { label: 'LOSSES', value: String(performance.losses), icon: XCircle, color: 'text-rose-400' },
              { label: 'PENDING', value: String(performance.pending), icon: Clock, color: 'text-slate-400' },
              { label: 'AVG DAILY', value: String(performance.avgDailySignals), icon: Activity, color: 'text-slate-300' }
            ].map((stat, i) => (
              <div key={i} className="glass-panel p-4 rounded-xl flex flex-col justify-between transition-all duration-300 hover:scale-[1.03] hover:border-glass-border/50 animate-fadeInUp" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="flex items-center justify-between text-slate-500 text-[8px] tracking-wider font-mono uppercase">
                  <span>{stat.label}</span>
                  <stat.icon className="h-3.5 w-3.5" />
                </div>
                <div className={`text-lg font-bold font-mono mt-3.5 ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Highlights box: Best, Worst, Most Traded assets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs animate-fadeInUp">
            <div className="glass-panel p-4.5 rounded-xl border border-glass-border/60 bg-slate-900/10 flex items-center justify-between transition-all duration-300 hover:scale-[1.02] hover:border-glass-border/50">
              <div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider">Most Active Asset</div>
                <div className="text-sm font-bold text-slate-200 mt-1">{performance.mostTradedAsset}</div>
              </div>
              <BarChart3 className="h-6 w-6 text-slate-500" />
            </div>
            <div className="glass-panel p-4.5 rounded-xl border border-emerald-500/20 bg-emerald-950/5 flex items-center justify-between transition-all duration-300 hover:scale-[1.02] hover:border-emerald-500/30">
              <div>
                <div className="text-[8px] text-emerald-500 uppercase tracking-wider">Best Accuracy Ticker</div>
                <div className="text-sm font-bold text-neon-green mt-1">{performance.bestPerformingAsset}</div>
              </div>
              <ArrowUp className="h-6 w-6 text-emerald-500" />
            </div>
            <div className="glass-panel p-4.5 rounded-xl border border-rose-500/20 bg-rose-950/5 flex items-center justify-between transition-all duration-300 hover:scale-[1.02] hover:border-rose-500/30">
              <div>
                <div className="text-[8px] text-rose-500/70 uppercase tracking-wider">Lowest Accuracy Ticker</div>
                <div className="text-sm font-bold text-rose-400 mt-1">{performance.worstPerformingAsset}</div>
              </div>
              <ArrowDown className="h-6 w-6 text-rose-500/70" />
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Win Rate Line Chart */}
            <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Daily Accuracy Rate Progression (%)</span>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performance.dailyPerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="date" stroke="#475569" fontSize={9} fontStyle="mono" />
                    <YAxis stroke="#475569" fontSize={9} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                    <Line type="monotone" dataKey="Accuracy" stroke="#00E676" strokeWidth={2} dot={{ stroke: '#00E676', strokeWidth: 1 }} name="Accuracy %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Wins vs Losses Net performance Chart */}
            <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Daily Volume (Wins vs Losses)</span>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performance.dailyPerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="date" stroke="#475569" fontSize={9} fontStyle="mono" />
                    <YAxis stroke="#475569" fontSize={9} />
                    <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Wins" fill="#10B981" />
                    <Bar dataKey="Losses" fill="#EF4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Asset accuracy analysis */}
            <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4 lg:col-span-2 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.2s' }}>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Asset Accuracy comparison (%)</span>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performance.assetPerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="asset" stroke="#475569" fontSize={8} fontStyle="mono" />
                    <YAxis stroke="#475569" fontSize={9} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                    <Bar dataKey="Accuracy" fill="#3B82F6" name="Accuracy %">
                      {performance.assetPerformanceData.map((entry: any, index: number) => (
                        <Line key={`bar-${index}`} stroke={entry.Accuracy >= 80 ? '#10B981' : '#3B82F6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

        </div>
      ) : (
        <div className="glass-panel rounded-xl border border-glass-border p-16 text-center space-y-4 max-w-xl mx-auto my-12 animate-fadeInUp">
          <AlertCircle className="h-10 w-10 text-slate-500 mx-auto animate-pulse-soft" />
          <h2 className="text-base font-bold font-mono text-slate-200">NO HISTORICAL DATA AVAILABLE</h2>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            There are no signal records within the selected parameters. Adjust date ranges or pipeline filter.
          </p>
        </div>
      )}

    </div>
  );
}
