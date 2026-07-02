'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  getAllUsers, updateUserStatus, toggleVipAccess, 
  resetUserPassword, getAdminStats, togglePremiumAccess 
} from '@/app/actions/admin';
import { 
  getAdminOptimizationSettings, 
  updateAdminOptimizationSettings 
} from '@/app/actions/admin_optimization';
import {
  getAllFeatureFlags,
  setFeatureFlag
} from '@/app/actions/feature_flags';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { 
  ShieldAlert, Check, X, Award, Key, Trash, RefreshCw, 
  Users, UserCheck, UserPlus, Star, BarChart2, Loader,
  Radio, Database, Cpu, Zap
} from 'lucide-react';
import { getSignalMode, setSignalMode } from '@/app/actions/signal_mode';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalUsers: 0,
    pendingUsers: 0,
    approvedUsers: 0,
    vipUsers: 0,
    totalTrades: 0,
  });

  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [resettingUser, setResettingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Signal Mode state (admin control for data pipeline) ────────────────
  const [signalMode, setSignalModeState] = useState<string>('SIMULATION');
  const [modeLoading, setModeLoading] = useState(false);
  const [modeMessage, setModeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Pricing SaaS Config state ──────────────────────────────────────────
  const [prices, setPrices] = useState<any>({
    price_premium_monthly: '',
    price_premium_6months: '',
    price_premium_lifetime: ''
  });
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingMessage, setPricingMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Feature Flags state ────────────────────────────────────────────────
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [flagsLoading, setFlagsLoading] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  const loadData = async () => {
    setLoading(true);
    setAuthError(false);

    try {
      // 1. Verify user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/admin/login');
        return;
      }

      // 2. Fetch admin stats
      const statsRes = await getAdminStats();
      if (!statsRes.success) {
        setAuthError(true);
        setLoading(false);
        return;
      }

      // 3. Fetch users
      const usersRes = await getAllUsers();
      if (!usersRes.success) {
        setAuthError(true);
        setLoading(false);
        return;
      }

      setStats(statsRes.stats);
      setUsers(usersRes.users || []);

      // Load current signal mode
      const modeRes = await getSignalMode();
      if (modeRes.success) setSignalModeState(modeRes.mode);

      // Load optimization/pricing settings
      const settingsRes = await getAdminOptimizationSettings();
      if (settingsRes.success && settingsRes.settings) {
        setPrices({
          price_premium_monthly: settingsRes.settings.price_premium_monthly || '$19',
          price_premium_6months: settingsRes.settings.price_premium_6months || '$99',
          price_premium_lifetime: settingsRes.settings.price_premium_lifetime || '$199'
        });
      }

      // Load feature flags
      const flagsRes = await getAllFeatureFlags();
      if (flagsRes.success) {
        setFeatureFlags(flagsRes.flags);
      }
    } catch (err) {
      setAuthError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (userId: string, status: 'pending' | 'approved' | 'rejected') => {
    setActionLoading(userId);
    setMessage(null);
    try {
      const res = await updateUserStatus(userId, status);
      if (res.success) {
        setMessage({ type: 'success', text: `User status successfully updated to ${status}.` });
        await loadData();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update status.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleVipToggle = async (userId: string, currentVip: boolean) => {
    setActionLoading(userId);
    setMessage(null);
    try {
      const res = await toggleVipAccess(userId, !currentVip);
      if (res.success) {
        setMessage({ type: 'success', text: `VIP Access successfully ${!currentVip ? 'granted' : 'revoked'}.` });
        await loadData();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to toggle VIP status.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePremiumToggle = async (userId: string, currentPremium: boolean) => {
    setActionLoading(userId);
    setMessage(null);
    try {
      const res = await togglePremiumAccess(userId, !currentPremium);
      if (res.success) {
        setMessage({ type: 'success', text: `Premium Access successfully ${!currentPremium ? 'granted' : 'revoked'}.` });
        await loadData();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to toggle Premium status.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSavePrices = async (e: React.FormEvent) => {
    e.preventDefault();
    setPricingLoading(true);
    setPricingMessage(null);
    try {
      const res = await updateAdminOptimizationSettings({
        price_premium_monthly: prices.price_premium_monthly,
        price_premium_6months: prices.price_premium_6months,
        price_premium_lifetime: prices.price_premium_lifetime
      });
      if (res.success) {
        setPricingMessage({ type: 'success', text: 'Pricing configurations updated successfully.' });
      } else {
        setPricingMessage({ type: 'error', text: res.error || 'Failed to update prices.' });
      }
    } catch (err: any) {
      setPricingMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setPricingLoading(false);
    }
  };

  const handleFeatureFlagToggle = async (key: string, currentValue: boolean) => {
    setFlagsLoading(true);
    setMessage(null);
    try {
      const res = await setFeatureFlag(key, !currentValue);
      if (res.success) {
        setMessage({ type: 'success', text: `Feature flag "${key}" successfully toggled.` });
        await loadData();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to toggle feature flag.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setFlagsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || !newPassword) return;

    setActionLoading(resettingUser.id);
    setMessage(null);

    try {
      const res = await resetUserPassword(resettingUser.id, newPassword);
      if (res.success) {
        setMessage({ type: 'success', text: `Password successfully updated for Trader ID ${resettingUser.trader_id}.` });
        setResettingUser(null);
        setNewPassword('');
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update password.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Signal Mode Switch Handler ─────────────────────────────────────
  const handleSignalModeToggle = async (modeToToggle: 'SIMULATION' | 'LIVE_OTC' | 'LIVE_MARKET') => {
    setModeLoading(true);
    setModeMessage(null);
    try {
      let currentModes = signalMode.split(',').map(m => m.trim()).filter(Boolean);
      if (currentModes.includes(modeToToggle)) {
        if (currentModes.length === 1) {
          setModeMessage({ type: 'error', text: 'At least one signal engine mode must remain active.' });
          setModeLoading(false);
          return;
        }
        currentModes = currentModes.filter(m => m !== modeToToggle);
      } else {
        currentModes.push(modeToToggle);
      }
      const newModeStr = currentModes.join(',');
      const res = await setSignalMode(newModeStr);
      if (res.success) {
        setSignalModeState(newModeStr);
        setModeMessage({ type: 'success', text: `Active signal pipelines updated to: ${currentModes.join(' & ')}.` });
      } else {
        setModeMessage({ type: 'error', text: res.error || 'Failed to update signal modes.' });
      }
    } catch (err: any) {
      setModeMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setModeLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => u.status === activeTab);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center space-y-4">
          <Loader className="h-8 w-8 animate-spin text-rose-500" />
          <span className="text-xs font-mono text-slate-500">DECRYPTING ADMINISTRATION PORTAL...</span>
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
          <h2 className="text-xl font-bold font-mono text-slate-200">ACCESS LOGS REFUSED</h2>
          <p className="text-sm text-slate-400 max-w-md">
            You do not possess the digital signatures required to read these admin ledgers. Return to login page.
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

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
          <div>
            <span className="text-[10px] font-mono text-rose-500 font-bold uppercase tracking-wider block">compliance control console</span>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-100">
              Quotex VIP Administration
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/admin/signal-analytics')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-glass-border hover:border-rose-500/30 bg-slate-900/40 text-slate-400 hover:text-rose-400 text-xs font-mono transition-colors"
            >
              <BarChart2 className="h-3.5 w-3.5 text-rose-500" /> OPTIMIZATION CENTER
            </button>
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-glass-border hover:border-neon-green/30 bg-slate-900/40 text-slate-400 hover:text-neon-green text-xs font-mono transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> REFRESH LEDGER
            </button>
          </div>
        </div>

        {/* System Message Notifications */}
        {message && (
          <div className={`p-4 rounded border text-xs leading-relaxed font-mono ${
            message.type === 'success' ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Metrics Rows */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'TOTAL TRADERS', value: stats.totalUsers, icon: Users, color: 'text-slate-300' },
            { label: 'PENDING VERIFICATION', value: stats.pendingUsers, icon: UserPlus, color: 'text-gold-vip glow-text-gold' },
            { label: 'APPROVED TRADERS', value: stats.approvedUsers, icon: UserCheck, color: 'text-neon-green glow-text-green' },
            { label: 'ACTIVE VIP LIFETIME', value: stats.vipUsers, icon: Star, color: 'text-gold-vip glow-text-gold' },
            { label: 'TOTAL TRADES LOGGED', value: stats.totalTrades, icon: BarChart2, color: 'text-sky-400' },
          ].map((item, i) => (
            <div key={i} className="glass-panel p-4 rounded-lg flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider font-mono">
                <span>{item.label}</span>
                <item.icon className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <div className={`text-xl font-bold font-mono mt-3 ${item.color}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Signal Mode Control Panel ───────────────────────────────── */}
        <div className="glass-panel rounded-xl border border-glass-border p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-glass-border/40 pb-4">
            <Cpu className="h-4 w-4 text-neon-green" />
            <div>
              <div className="text-xs font-mono font-bold text-neon-green tracking-widest">SIGNAL ENGINE MODE</div>
              <div className="text-[9px] font-mono text-slate-500">Controls the data pipeline for all VIP signals</div>
            </div>
          </div>

          {modeMessage && (
            <div className={`px-3 py-2 rounded border text-[10px] font-mono ${
              modeMessage.type === 'success'
                ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
            }`}>
              {modeMessage.text}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            {/* Current active pipelines */}
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-500" />
              <span className="text-[10px] font-mono text-slate-500 tracking-wider">ACTIVE PIPELINES:</span>
              <div className="flex gap-1.5 flex-wrap">
                {signalMode.split(',').map(m => (
                  <span key={m} className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                    m === 'LIVE_OTC' ? 'text-neon-green border-neon-green/30 bg-neon-green/10' :
                    m === 'LIVE_MARKET' ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' :
                    'text-amber-400 border-amber-400/30 bg-amber-500/10'
                  }`}>
                    {m === 'LIVE_OTC' ? 'OTC' : m === 'LIVE_MARKET' ? 'LIVE' : 'SIMULATION'}
                  </span>
                ))}
              </div>
            </div>

            {/* Mode toggle buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleSignalModeToggle('SIMULATION')}
                disabled={modeLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded border text-[10px] font-mono font-bold tracking-wider transition-all ${
                  signalMode.split(',').includes('SIMULATION')
                    ? 'bg-amber-500/15 border-amber-400/50 text-amber-400'
                    : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:border-amber-400/40 hover:text-amber-400 disabled:opacity-40'
                }`}
              >
                <Database className="h-3.5 w-3.5" />
                SIMULATION
              </button>
              <button
                onClick={() => handleSignalModeToggle('LIVE_OTC')}
                disabled={modeLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded border text-[10px] font-mono font-bold tracking-wider transition-all ${
                  signalMode.split(',').includes('LIVE_OTC')
                    ? 'bg-neon-green/15 border-neon-green/50 text-neon-green'
                    : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:border-neon-green/40 hover:text-neon-green disabled:opacity-40'
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                LIVE OTC
              </button>
              <button
                onClick={() => handleSignalModeToggle('LIVE_MARKET')}
                disabled={modeLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded border text-[10px] font-mono font-bold tracking-wider transition-all ${
                  signalMode.split(',').includes('LIVE_MARKET')
                    ? 'bg-rose-500/15 border-rose-500/50 text-rose-400'
                    : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:border-rose-400/40 hover:text-rose-400 disabled:opacity-40'
                }`}
              >
                <Cpu className="h-3.5 w-3.5 text-rose-400" />
                LIVE MARKET
              </button>
            </div>
          </div>

          {/* Explanation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="px-3 py-2.5 rounded border border-amber-400/20 bg-amber-500/5 space-y-1">
              <div className="text-[9px] font-mono font-bold text-amber-400 tracking-wider">SIMULATION MODE</div>
              <div className="text-[8px] font-mono text-slate-500">
                Uses seeded deterministic candles. Safe for testing. No live market data. Win/Loss calculated from simulated price movement.
              </div>
            </div>
            <div className="px-3 py-2.5 rounded border border-neon-green/20 bg-neon-green/5 space-y-1">
              <div className="text-[9px] font-mono font-bold text-neon-green tracking-wider">LIVE OTC MODE</div>
              <div className="text-[8px] font-mono text-slate-500">
                Uses live OTC candle data when provider is connected. Auto-falls back to simulation if data source is offline. Status shown in signals header.
              </div>
            </div>
            <div className="px-3 py-2.5 rounded border border-rose-500/20 bg-rose-500/5 space-y-1">
              <div className="text-[9px] font-mono font-bold text-rose-400 tracking-wider">LIVE MARKET MODE</div>
              <div className="text-[8px] font-mono text-slate-500">
                Uses the high-fidelity real-time Forex simulator. Evaluates standard currency pairs based on live orderflow calculations 24/7.
              </div>
            </div>
          </div>
        </div>

        {/* Pricing & SaaS Configuration Card */}
        <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-6">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider block">SaaS Pricing Configuration</span>
            <h2 className="text-base font-bold font-mono text-slate-200">Premium Subscription Pricing</h2>
          </div>

          <form onSubmit={handleSavePrices} className="space-y-4 max-w-xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Monthly Price</label>
                <input
                  type="text"
                  required
                  value={prices.price_premium_monthly}
                  onChange={(e) => setPrices({ ...prices, price_premium_monthly: e.target.value })}
                  placeholder="$19"
                  className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 font-mono text-xs focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">6 Months Price</label>
                <input
                  type="text"
                  required
                  value={prices.price_premium_6months}
                  onChange={(e) => setPrices({ ...prices, price_premium_6months: e.target.value })}
                  placeholder="$99"
                  className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 font-mono text-xs focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Lifetime Price</label>
                <input
                  type="text"
                  required
                  value={prices.price_premium_lifetime}
                  onChange={(e) => setPrices({ ...prices, price_premium_lifetime: e.target.value })}
                  placeholder="$199"
                  className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 font-mono text-xs focus:outline-none focus:border-purple-500/50"
                />
              </div>
            </div>

            {pricingMessage && (
              <div className={`p-3 rounded border text-[11px] font-mono ${
                pricingMessage.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400' : 'border-rose-500/30 bg-rose-950/20 text-rose-400'
              }`}>
                {pricingMessage.text}
              </div>
            )}

            <button
              type="submit"
              disabled={pricingLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded text-[10px] font-mono font-bold uppercase text-slate-950 transition-colors cursor-pointer"
            >
              {pricingLoading ? 'SAVING CONFIGS...' : 'SAVE PRICING CONFIGURATIONS'}
            </button>
          </form>
        </div>

        {/* Feature Flag Management Card */}
        <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-6">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">Feature flags</span>
            <h2 className="text-base font-bold font-mono text-slate-200">System Modules Feature Flags</h2>
            <p className="text-[10px] font-mono text-slate-500">Enable or disable front-end modules and services globally for all users.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.keys(featureFlags).map(flagKey => {
              const isEnabled = featureFlags[flagKey];
              return (
                <div key={flagKey} className="glass-panel rounded-xl border border-glass-border p-4 flex flex-col justify-between space-y-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest">{flagKey.replace('_', ' ')}</div>
                    <div className="text-[8px] font-mono text-slate-500">
                      {flagKey === 'premium_signals' && 'Controls signal generation and signal tabs visibility.'}
                      {flagKey === 'ai_review' && 'Controls AI analytics summaries and review triggers.'}
                      {flagKey === 'checklists' && 'Controls trading checklists module access.'}
                      {flagKey === 'pricing_page' && 'Controls visibility of SaaS pricing layouts.'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${
                      isEnabled 
                        ? 'bg-neon-green/10 border-neon-green/30 text-neon-green' 
                        : 'bg-slate-900 border-glass-border text-slate-500'
                    }`}>
                      {isEnabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                    <button
                      type="button"
                      disabled={flagsLoading}
                      onClick={() => handleFeatureFlagToggle(flagKey, isEnabled)}
                      className={`px-3 py-1 rounded text-[9px] font-mono font-bold uppercase transition-all ${
                        isEnabled
                          ? 'bg-rose-950/40 border border-rose-500/20 text-rose-400 hover:bg-rose-950/80'
                          : 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-950/80'
                      }`}
                    >
                      {isEnabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reset Password Modal */}
        {resettingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-md glass-panel p-6 rounded-xl border border-glass-border space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-mono font-bold text-slate-200">RESET PASSPHRASE</h3>
                <p className="text-[10px] text-slate-500 font-mono">
                  TRADER ID: {resettingUser.trader_id} &bull; USERNAME: {resettingUser.username}
                </p>
              </div>

              <form onSubmit={handlePasswordReset} className="space-y-4">
                <input
                  type="text"
                  required
                  placeholder="Enter custom new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#030812] border border-glass-border px-3.5 py-2 rounded font-mono text-sm text-slate-200 focus:outline-none focus:border-neon-green/30"
                />

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono uppercase tracking-wider"
                  >
                    RESET PASS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResettingUser(null);
                      setNewPassword('');
                    }}
                    className="px-4 py-2 rounded bg-slate-900 border border-glass-border hover:bg-slate-800 text-slate-400 text-xs font-mono font-bold"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tab Selection */}
        <div className="border-b border-glass-border flex space-x-6 text-xs font-mono">
          {(['pending', 'approved', 'rejected'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 capitalize transition-all border-b-2 font-bold tracking-wider ${
                activeTab === tab
                  ? 'border-rose-500 text-rose-500 glow-text-gold'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab} User Requests ({users.filter((u) => u.status === tab).length})
            </button>
          ))}
        </div>

        {/* User Database Table */}
        <div className="glass-panel rounded-lg overflow-hidden border border-glass-border">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-glass-border text-slate-500 text-[10px] tracking-wider uppercase font-bold">
                  <th className="p-4">Trader ID</th>
                  <th className="p-4">Username</th>
                  <th className="p-4">Created Date</th>
                  <th className="p-4 text-center">VIP Badge</th>
                  <th className="p-4 text-center">Premium Badge</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border/40">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-600">
                      NO REGISTRATIONS FOUND IN THIS SUB-TAB.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="p-4 font-bold text-slate-200">{user.trader_id}</td>
                      <td className="p-4 text-slate-300">{user.username}</td>
                      <td className="p-4 text-slate-500">
                        {new Date(user.created_at).toLocaleDateString()} {new Date(user.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          disabled={actionLoading === user.id}
                          onClick={() => handleVipToggle(user.id, user.vip_access)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${
                            user.vip_access
                              ? 'bg-gold-vip/15 border-gold-vip/35 text-gold-vip glow-text-gold'
                              : 'bg-slate-900 border-glass-border text-slate-500 hover:text-gold-vip hover:border-gold-vip/30'
                          }`}
                        >
                          <Award className="h-3.5 w-3.5" />
                          <span>{user.vip_access ? 'VIP' : 'GRANT'}</span>
                        </button>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          disabled={actionLoading === user.id}
                          onClick={() => handlePremiumToggle(user.id, user.premium_access)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${
                            user.premium_access
                              ? 'bg-purple-950/30 border border-purple-500/50 text-purple-300 shadow-[0_0_10px_rgba(139,92,246,0.1)]'
                              : 'bg-slate-900 border-glass-border text-slate-500 hover:text-purple-400 hover:border-purple-500/30'
                          }`}
                        >
                          <Zap className="h-3.5 w-3.5 text-purple-400" />
                          <span>{user.premium_access ? 'PREMIUM' : 'GRANT'}</span>
                        </button>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {user.status === 'pending' && (
                          <>
                            <button
                              disabled={actionLoading === user.id}
                              onClick={() => handleStatusChange(user.id, 'approved')}
                              className="p-1.5 rounded bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-950/80 transition-colors inline-flex items-center"
                              title="Approve Account"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              disabled={actionLoading === user.id}
                              onClick={() => handleStatusChange(user.id, 'rejected')}
                              className="p-1.5 rounded bg-rose-950/40 border border-rose-500/20 text-rose-400 hover:bg-rose-950/80 transition-colors inline-flex items-center"
                              title="Reject Account"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {user.status === 'approved' && (
                          <button
                            disabled={actionLoading === user.id}
                            onClick={() => handleStatusChange(user.id, 'pending')}
                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-400/30 transition-colors inline-flex items-center gap-1"
                            title="Disable/Suspend Account"
                          >
                            <Trash className="h-3 w-3" />
                            <span>Disable</span>
                          </button>
                        )}
                        {user.status === 'rejected' && (
                          <button
                            disabled={actionLoading === user.id}
                            onClick={() => handleStatusChange(user.id, 'approved')}
                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-400/30 transition-colors inline-flex items-center gap-1"
                            title="Approve / Restore Account"
                          >
                            <Check className="h-3 w-3" />
                            <span>Approve</span>
                          </button>
                        )}
                        <button
                          disabled={actionLoading === user.id}
                          onClick={() => setResettingUser(user)}
                          className="p-1.5 rounded bg-slate-900 border border-glass-border text-slate-400 hover:text-rose-500 transition-colors inline-flex items-center"
                          title="Reset Password"
                        >
                          <Key className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
