'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getTwelveDataMonitorData, TwelveDataMonitorData } from '@/app/actions/admin_api_monitor';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  ShieldAlert, Activity, RefreshCw, Loader, Clock,
  Zap, CheckCircle, XCircle, AlertTriangle,
  BarChart3, Key, Table, Bell,
  AlertCircle, Database
} from 'lucide-react';

export default function AdminApiMonitorPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [data, setData] = useState<TwelveDataMonitorData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      const result = await getTwelveDataMonitorData(forceRefresh);
      setData(result);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch {
      setAuthError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setAuthError(false);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/admin/login');
          return;
        }
        const { data: adminRecord } = await supabase
          .from('admins')
          .select('id')
          .eq('id', session.user.id)
          .single();
        if (!adminRecord) {
          setAuthError(true);
          setLoading(false);
          return;
        }
        await loadData(true);
      } catch {
        setAuthError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, supabase, loadData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (loading || authError) return;
    const interval = setInterval(() => loadData(false), 60000);
    return () => clearInterval(interval);
  }, [loading, authError, loadData]);

  // ── Live Clock for Relative Timestamps ──────────────────────────────────────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    loadData(true);
  };

  // ── Loading State ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
        <Navbar isAdminPage />
        <main className="flex-1 flex items-center justify-center">
          <Loader className="h-8 w-8 animate-spin text-rose-500" />
        </main>
        <Footer />
      </div>
    );
  }

  // ── Auth Error State ─────────────────────────────────────────────────────────
  if (authError) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
        <Navbar isAdminPage />
        <main className="flex-1 flex flex-col items-center justify-center space-y-4 p-4 text-center">
          <ShieldAlert className="h-12 w-12 text-rose-500 animate-pulse" />
          <h2 className="text-xl font-bold font-mono text-slate-200">ACCESS DENIED</h2>
          <p className="text-slate-400 text-sm font-mono max-w-md">
            You do not have permission to access the API Monitor.
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

  // ── Status Badge ─────────────────────────────────────────────────────────────
  const statusBadge = (() => {
    switch (data?.status) {
      case 'ONLINE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ONLINE
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            DEGRADED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            OFFLINE
          </span>
        );
    }
  })();

  // ── Number Formatting ────────────────────────────────────────────────────────
  const fmt = (n: number): string => n.toLocaleString();

  const timeAgo = (iso: string | null): string => {
    if (!iso) return '—';
    const diff = now - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins > 60) return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
    if (mins > 0) return `${mins}m ${secs}s ago`;
    return `${secs}s ago`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
      <Navbar isAdminPage />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
          <div>
            <span className="text-[10px] font-mono text-rose-500 font-bold uppercase tracking-wider block">
              ADMIN
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-100">
              TWELVEDATA API MONITOR
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-[10px] font-mono text-slate-500">
                Last updated: {lastRefresh}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-600/50 rounded text-xs font-mono font-bold text-white transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'REFRESHING' : 'REFRESH'}
            </button>
          </div>
        </div>

        {/* ── Section 1: Provider Status ──────────────────────────────────── */}
        <section className="glass-panel rounded-xl border border-glass-border p-6 space-y-6 animate-fadeIn">
          <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
            <Activity className="h-4 w-4 text-rose-500" />
            <span className="text-xs font-mono font-bold text-rose-500 tracking-wider">PROVIDER STATUS</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-500 tracking-wider uppercase">Provider</span>
              <div className="flex items-center gap-2 mt-1">
                <Database className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-bold font-mono text-slate-200">{data?.providerName || 'TwelveData'}</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-500 tracking-wider uppercase">Status</span>
              <div className="mt-1.5">{statusBadge}</div>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-500 tracking-wider uppercase">Last Successful Request</span>
              <div className="flex items-center gap-1.5 mt-1">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-mono text-slate-300">
                  {data?.lastSuccessfulRequest ? timeAgo(data.lastSuccessfulRequest) : '—'}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-500 tracking-wider uppercase">Last Failed Request</span>
              <div className="flex items-center gap-1.5 mt-1">
                <XCircle className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-xs font-mono text-slate-300">
                  {data?.lastFailedRequest ? timeAgo(data.lastFailedRequest) : '—'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-glass-border/40">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[10px] font-mono text-slate-500">
              Last Response Time:&nbsp;
              <span className="text-slate-300 font-bold">
                {data?.lastResponseTime != null ? `${data.lastResponseTime}ms` : '—'}
              </span>
            </span>
          </div>
        </section>

        {/* ── Section 2: Credit Usage ─────────────────────────────────────── */}
        <section className="glass-panel rounded-xl border border-glass-border p-6 space-y-6 animate-fadeIn">
          <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
            <BarChart3 className="h-4 w-4 text-rose-500" />
            <span className="text-xs font-mono font-bold text-rose-500 tracking-wider">CREDIT USAGE</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-panel p-4 rounded-lg flex flex-col justify-between">
              <div className="text-[9px] font-mono text-slate-500 tracking-wider uppercase">Credits Used Today</div>
              <div className="text-2xl sm:text-3xl font-bold font-mono mt-2 text-amber-400 glow-text-green">
                {data ? fmt(data.creditsUsedToday) : '—'}
              </div>
            </div>
            <div className="glass-panel p-4 rounded-lg flex flex-col justify-between">
              <div className="text-[9px] font-mono text-slate-500 tracking-wider uppercase">Daily Limit</div>
              <div className="text-2xl sm:text-3xl font-bold font-mono mt-2 text-slate-200">
                {data ? fmt(data.dailyLimit) : '—'}
              </div>
            </div>
            <div className="glass-panel p-4 rounded-lg flex flex-col justify-between">
              <div className="text-[9px] font-mono text-slate-500 tracking-wider uppercase">Credits Remaining</div>
              <div className="text-2xl sm:text-3xl font-bold font-mono mt-2 text-emerald-400">
                {data ? fmt(data.creditsRemaining) : '—'}
              </div>
            </div>
            <div className="glass-panel p-4 rounded-lg flex flex-col justify-between">
              <div className="text-[9px] font-mono text-slate-500 tracking-wider uppercase">Usage %</div>
              <div className="text-2xl sm:text-3xl font-bold font-mono mt-2"
                style={{
                  color: data && data.usagePercent >= 95 ? '#f43f5e' :
                         data && data.usagePercent >= 85 ? '#f97316' :
                         data && data.usagePercent >= 70 ? '#eab308' :
                         '#34d399'
                }}
              >
                {data ? `${data.usagePercent}%` : '—'}
              </div>
            </div>
          </div>
          {/* Progress Bar */}
          {data && (
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-glass-border/40">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(data.usagePercent, 100)}%`,
                  background: data.usagePercent >= 95
                    ? 'linear-gradient(90deg, #f43f5e, #e11d48)'
                    : data.usagePercent >= 85
                    ? 'linear-gradient(90deg, #f97316, #ea580c)'
                    : data.usagePercent >= 70
                    ? 'linear-gradient(90deg, #eab308, #ca8a04)'
                    : 'linear-gradient(90deg, #34d399, #10b981)'
                }}
              />
            </div>
          )}
        </section>

        {/* ── Section 3: Request Statistics ───────────────────────────────── */}
        <section className="glass-panel rounded-xl border border-glass-border p-6 space-y-6 animate-fadeIn">
          <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
            <Activity className="h-4 w-4 text-rose-500" />
            <span className="text-xs font-mono font-bold text-rose-500 tracking-wider">REQUEST STATISTICS</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="glass-panel p-3 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] font-mono text-slate-500">TOTAL TODAY</span>
              <span className="text-lg font-bold font-mono mt-1 text-slate-200">{data ? fmt(data.totalRequestsToday) : '—'}</span>
            </div>
            <div className="glass-panel p-3 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] font-mono text-slate-500">SUCCESSFUL</span>
              <span className="text-lg font-bold font-mono mt-1 text-emerald-400">{data ? fmt(data.successfulRequests) : '—'}</span>
            </div>
            <div className="glass-panel p-3 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] font-mono text-slate-500">FAILED</span>
              <span className="text-lg font-bold font-mono mt-1 text-rose-400">{data ? fmt(data.failedRequests) : '—'}</span>
            </div>
            <div className="glass-panel p-3 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] font-mono text-slate-500">SUCCESS RATE</span>
              <span className="text-lg font-bold font-mono mt-1"
                style={{
                  color: data && data.successRate >= 95 ? '#34d399' :
                         data && data.successRate >= 80 ? '#eab308' :
                         '#f43f5e'
                }}
              >
                {data ? `${data.successRate}%` : '—'}
              </span>
            </div>
            <div className="glass-panel p-3 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] font-mono text-slate-500">429 ERRORS</span>
              <span className="text-lg font-bold font-mono mt-1 text-orange-400">{data ? fmt(data.errors429) : '—'}</span>
            </div>
            <div className="glass-panel p-3 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] font-mono text-slate-500">TIMEOUT ERRORS</span>
              <span className="text-lg font-bold font-mono mt-1 text-rose-400">{data ? fmt(data.timeoutErrors) : '—'}</span>
            </div>
          </div>
        </section>

        {/* ── Section 4: Performance ──────────────────────────────────────── */}
        <section className="glass-panel rounded-xl border border-glass-border p-6 space-y-6 animate-fadeIn">
          <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
            <Zap className="h-4 w-4 text-rose-500" />
            <span className="text-xs font-mono font-bold text-rose-500 tracking-wider">PERFORMANCE</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="glass-panel p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] font-mono text-slate-500 tracking-wider">AVERAGE</span>
              <span className="text-xs text-slate-500 mt-1">Response Time</span>
              <span className="text-lg font-bold font-mono mt-1 text-slate-200">
                {data ? `${data.averageResponseTime}ms` : '—'}
              </span>
            </div>
            <div className="glass-panel p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] font-mono text-slate-500 tracking-wider">FASTEST</span>
              <span className="text-xs text-slate-500 mt-1">Response</span>
              <span className="text-lg font-bold font-mono mt-1 text-emerald-400">
                {data?.fastestResponse != null ? `${data.fastestResponse}ms` : '—'}
              </span>
            </div>
            <div className="glass-panel p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] font-mono text-slate-500 tracking-wider">SLOWEST</span>
              <span className="text-xs text-slate-500 mt-1">Response</span>
              <span className="text-lg font-bold font-mono mt-1 text-rose-400">
                {data?.slowestResponse != null ? `${data.slowestResponse}ms` : '—'}
              </span>
            </div>
            <div className="glass-panel p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] font-mono text-slate-500 tracking-wider">AVERAGE</span>
              <span className="text-xs text-slate-500 mt-1">Latency</span>
              <span className="text-lg font-bold font-mono mt-1 text-slate-200">
                {data ? `${data.averageResponseTime}ms` : '—'}
              </span>
            </div>
            <div className="glass-panel p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] font-mono text-slate-500 tracking-wider">MEDIAN</span>
              <span className="text-xs text-slate-500 mt-1">Latency</span>
              <span className="text-lg font-bold font-mono mt-1 text-slate-200">
                {data ? `${data.medianLatency}ms` : '—'}
              </span>
            </div>
          </div>
        </section>

        {/* ── Section 5: API Key ──────────────────────────────────────────── */}
        <section className="glass-panel rounded-xl border border-glass-border p-6 space-y-4 animate-fadeIn">
          <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
            <Key className="h-4 w-4 text-rose-500" />
            <span className="text-xs font-mono font-bold text-rose-500 tracking-wider">API KEY</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <Key className="h-4 w-4 text-rose-400" />
            </div>
            <code className="text-xs font-mono bg-slate-900 px-3 py-2 rounded border border-glass-border text-slate-300 select-all">
              {data?.maskedApiKey || 'N/A'}
            </code>
            <span className="text-[9px] font-mono text-slate-600">Masked — full key never exposed</span>
          </div>
        </section>

        {/* ── Section 6: Recent Requests ──────────────────────────────────── */}
        <section className="glass-panel rounded-xl border border-glass-border overflow-hidden animate-fadeIn">
          <div className="px-5 py-4 border-b border-glass-border/40 flex items-center gap-2">
            <Table className="h-4 w-4 text-rose-500" />
            <span className="text-xs font-mono font-bold text-rose-500 tracking-wider">RECENT REQUESTS</span>
            <span className="text-[9px] font-mono text-slate-600 ml-auto">
              {data ? `Last ${data.recentRequests.length} of max 50` : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-glass-border text-slate-500 text-[10px] tracking-wider uppercase font-bold">
                  <th className="p-4">Time</th>
                  <th className="p-4">Endpoint</th>
                  <th className="p-4 text-right">Credits</th>
                  <th className="p-4 text-right">Latency</th>
                  <th className="p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border/40">
                {data && data.recentRequests.length > 0 ? (
                  data.recentRequests.map((req, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/30 transition-colors">
                      <td className="p-4 text-slate-400 whitespace-nowrap">
                        {new Date(req.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="p-4 text-slate-300">
                        <code className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-glass-border/40">
                          {req.endpoint}
                        </code>
                      </td>
                      <td className="p-4 text-right text-slate-300">{req.credits}</td>
                      <td className="p-4 text-right text-slate-300">{req.latency}ms</td>
                      <td className="p-4 text-center">
                        {req.status === 'SUCCESS' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle className="h-3 w-3" />
                            <span className="text-[9px] font-bold">SUCCESS</span>
                          </span>
                        ) : req.status === 'FAILED' ? (
                          <span className="inline-flex items-center gap-1 text-rose-400">
                            <XCircle className="h-3 w-3" />
                            <span className="text-[9px] font-bold">FAILED</span>
                          </span>
                        ) : req.status === 'TIMEOUT' ? (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <Clock className="h-3 w-3" />
                            <span className="text-[9px] font-bold">TIMEOUT</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-orange-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span className="text-[9px] font-bold">RATE LIMITED</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center">
                      <div className="text-slate-600 text-[10px] font-mono">
                        <AlertCircle className="h-5 w-5 mx-auto mb-2 opacity-40" />
                        NO REQUEST DATA AVAILABLE
                      </div>
                      <div className="text-slate-700 text-[9px] font-mono mt-1">
                        Requests will appear after the first health check.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Section 7: Alerts ────────────────────────────────────────────── */}
        <section className="glass-panel rounded-xl border border-glass-border p-6 space-y-6 animate-fadeIn">
          <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
            <Bell className="h-4 w-4 text-rose-500" />
            <span className="text-xs font-mono font-bold text-rose-500 tracking-wider">ALERTS</span>
            <span className="text-[9px] font-mono text-slate-600 ml-auto">Visual indicators only — no throttling</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Green - Healthy */}
            <div className={`p-4 rounded-lg border transition-all ${
              !data || data.usagePercent < 70
                ? 'border-emerald-500/30 bg-emerald-950/10'
                : 'border-slate-800 bg-slate-900/30 opacity-40'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-2.5 w-2.5 rounded-full ${!data || data.usagePercent < 70 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-700'}`} />
                <span className={`text-xs font-bold font-mono ${!data || data.usagePercent < 70 ? 'text-emerald-400' : 'text-slate-600'}`}>
                  HEALTHY
                </span>
              </div>
              <p className={`text-[10px] font-mono leading-relaxed ${!data || data.usagePercent < 70 ? 'text-emerald-400/70' : 'text-slate-700'}`}>
                API operating normally with sufficient credits.
              </p>
            </div>

            {/* Yellow - 70% */}
            <div className={`p-4 rounded-lg border transition-all ${
              data && data.usagePercent >= 70 && data.usagePercent < 85
                ? 'border-yellow-500/30 bg-yellow-950/10'
                : 'border-slate-800 bg-slate-900/30 opacity-40'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-2.5 w-2.5 rounded-full ${data && data.usagePercent >= 70 && data.usagePercent < 85 ? 'bg-yellow-400 animate-pulse' : 'bg-slate-700'}`} />
                <span className={`text-xs font-bold font-mono ${data && data.usagePercent >= 70 && data.usagePercent < 85 ? 'text-yellow-400' : 'text-slate-600'}`}>
                  70% USAGE
                </span>
              </div>
              <p className={`text-[10px] font-mono leading-relaxed ${data && data.usagePercent >= 70 && data.usagePercent < 85 ? 'text-yellow-400/70' : 'text-slate-700'}`}>
                Credit usage has exceeded 70% of the daily limit.
              </p>
            </div>

            {/* Orange - 85% */}
            <div className={`p-4 rounded-lg border transition-all ${
              data && data.usagePercent >= 85 && data.usagePercent < 95
                ? 'border-orange-500/30 bg-orange-950/10'
                : 'border-slate-800 bg-slate-900/30 opacity-40'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-2.5 w-2.5 rounded-full ${data && data.usagePercent >= 85 && data.usagePercent < 95 ? 'bg-orange-400 animate-pulse' : 'bg-slate-700'}`} />
                <span className={`text-xs font-bold font-mono ${data && data.usagePercent >= 85 && data.usagePercent < 95 ? 'text-orange-400' : 'text-slate-600'}`}>
                  85% USAGE
                </span>
              </div>
              <p className={`text-[10px] font-mono leading-relaxed ${data && data.usagePercent >= 85 && data.usagePercent < 95 ? 'text-orange-400/70' : 'text-slate-700'}`}>
                Credit usage has exceeded 85% of the daily limit.
              </p>
            </div>

            {/* Red - 95% */}
            <div className={`p-4 rounded-lg border transition-all ${
              data && data.usagePercent >= 95
                ? 'border-rose-500/30 bg-rose-950/10'
                : 'border-slate-800 bg-slate-900/30 opacity-40'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-2.5 w-2.5 rounded-full ${data && data.usagePercent >= 95 ? 'bg-rose-400 animate-pulse' : 'bg-slate-700'}`} />
                <span className={`text-xs font-bold font-mono ${data && data.usagePercent >= 95 ? 'text-rose-400' : 'text-slate-600'}`}>
                  95% USAGE
                </span>
              </div>
              <p className={`text-[10px] font-mono leading-relaxed ${data && data.usagePercent >= 95 ? 'text-rose-400/70' : 'text-slate-700'}`}>
                Credit usage has exceeded 95% of the daily limit &mdash; near exhaustion.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
