'use client';

import React, { useState, useEffect } from 'react';
import { getSignalPerformance } from '@/app/actions/signals';
import { getUserAccessState, getPublicOptimizationSettings } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Database, Activity, ShieldCheck } from 'lucide-react';

export default function PerformanceReportsPage() {
  const [loading, setLoading] = useState(true);
  const [userAccess, setUserAccess] = useState<any>({
    vipAccess: false,
    premiumAccess: false,
    status: 'pending'
  });
  const [optSettings, setOptSettings] = useState<Record<string, string>>({});

  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [accessRes, perfRes, settingsRes] = await Promise.all([
          getUserAccessState(),
          getSignalPerformance('ALL'),
          getPublicOptimizationSettings()
        ]);

        if (accessRes.success) {
          setUserAccess({
            vipAccess: accessRes.vipAccess,
            premiumAccess: accessRes.premiumAccess,
            status: accessRes.status
          });
        }

        if (settingsRes.success && settingsRes.settings) {
          setOptSettings(settingsRes.settings);
        }

        if (perfRes.success && perfRes.stats) {
          setStats(perfRes.stats);
        }

      } catch (err) {
        console.error('Failed to load performance reports stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

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

  if (!canAccess('performance-reports', profile, optSettings.signal_visibility)) {
    return <LockedFeature feature="performance-reports" />;
  }

  // Prep chart data
  const chartData = [
    {
      name: 'Manual Audits',
      WinRate: stats?.accuracy > 0 ? stats.accuracy : 0,
      Total: stats?.total || 0,
      Wins: stats?.wins || 0
    }
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-4xl mx-auto animate-fadeIn text-left">
      
      {/* Title */}
      <div className="border-b border-glass-border pb-4">
        <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">analytical audits</span>
        <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Performance Reports</h1>
      </div>

      {/* Overall Stats Card */}
      <div className="glass-panel p-5 rounded-xl border border-glass-border bg-slate-900/10 space-y-4 transition-all duration-300 hover:scale-[1.01] hover:border-glass-border/50 animate-fadeInUp">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono text-neon-green uppercase tracking-widest">Manual Signal Audits</span>
          <Database className="h-4 w-4 text-neon-green" />
        </div>
        <div className="grid grid-cols-2 gap-4 font-mono text-xs text-slate-400">
          <div>
            <div className="text-slate-500 text-[8px] uppercase">Win Rate</div>
            <div className="text-lg font-bold text-neon-green mt-1">
              {stats?.accuracy > 0 ? `${stats.accuracy}%` : '—'}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-[8px] uppercase">Signals Audited</div>
            <div className="text-lg font-bold text-slate-200 mt-1">{stats?.total || 0}</div>
          </div>
          <div>
            <div className="text-slate-500 text-[8px] uppercase">Wins / Losses</div>
            <div className="text-xs text-slate-300 mt-1.5">{stats?.wins || 0}W - {stats?.losses || 0}L</div>
          </div>
          <div>
            <div className="text-slate-500 text-[8px] uppercase">Pending</div>
            <div className="text-xs text-slate-300 mt-1.5">{stats?.pending || 0}</div>
          </div>
        </div>
      </div>

      {/* Visual Chart */}
      <div className="glass-panel p-6 rounded-xl border border-glass-border bg-slate-900/10 space-y-4 text-left transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block">Accuracy Rate</span>
        
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="name" stroke="#475569" fontSize={10} fontStyle="mono" />
              <YAxis stroke="#475569" fontSize={10} domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
              <Bar dataKey="WinRate" fill="#10B981" name="Accuracy Rate (%)" maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Info notice */}
      <div className="p-4 bg-purple-950/15 border border-purple-500/20 text-purple-400 rounded-xl flex items-center gap-2.5 font-mono text-[10px] uppercase justify-center glow-shadow-purple">
        <ShieldCheck className="h-4.5 w-4.5 text-purple-500" />
        <span>Performance metrics compiled from Live OTC signals and manual signal audits.</span>
      </div>

    </div>
  );
}
