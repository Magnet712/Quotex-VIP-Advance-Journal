'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  getAllUsers, updateUserStatus, toggleVipAccess, 
  resetUserPassword, getAdminStats, togglePremiumAccess,
  getAdminReferralsLedger, updateUserReferrer
} from '@/app/actions/admin';
import { 
  getAdminOptimizationSettings, 
  updateAdminOptimizationSettings 
} from '@/app/actions/admin_optimization';
import {
  getAllFeatureFlags,
  setFeatureFlag
} from '@/app/actions/feature_flags';
import {
  getBillingPlans, getWalletSettings, updateBillingPlan,
  updateWalletAddress, getSaaSStatistics, getAdminPaymentsLedger,
  retryAdminPaymentVerification
} from '@/app/actions/billing';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { 
  ShieldAlert, Check, X, Award, Key, Trash, RefreshCw, 
  Users, UserCheck, UserPlus, Star, BarChart2, Loader,
  Radio, Database, Cpu, Zap, CreditCard, Wallet, FileText,
  DollarSign, TrendingUp, HelpCircle, Clock, ChevronUp, ChevronDown, AlertCircle
} from 'lucide-react';
import { getSignalMode, setSignalMode } from '@/app/actions/signal_mode';

type AdminTab = 'users' | 'pipelines' | 'billing' | 'referrals';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  
  // Tab controller
  const [adminTab, setAdminTab] = useState<AdminTab>('users');

  // TRADERS TABS STATE
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalUsers: 0,
    pendingUsers: 0,
    approvedUsers: 0,
    vipUsers: 0,
    totalTrades: 0,
  });
  const [activeUserSubTab, setActiveUserSubTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [resettingUser, setResettingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // REFERRALS TAB STATE
  const [referralsLedger, setReferralsLedger] = useState<any[]>([]);
  const [editingReferrerUser, setEditingReferrerUser] = useState<any>(null);
  const [newReferrerTraderId, setNewReferrerTraderId] = useState('');

  // PIPELINES TABS STATE
  const [signalMode, setSignalModeState] = useState<string>('SIMULATION');
  const [modeLoading, setModeLoading] = useState(false);
  const [modeMessage, setModeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [signalVisibility, setSignalVisibilityState] = useState<string>('premium');
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingMessage, setPricingMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [flagsLoading, setFlagsLoading] = useState(false);

  // BILLING SAAS STATE
  const [plans, setPlans] = useState<any[]>([]);
  const [wallets, setWallets] = useState<any[]>([]);
  const [saasStats, setSaasStats] = useState<any>({
    totalRevenue: 0,
    monthlyRevenue: 0,
    premiumCount: 0,
    vipCount: 0,
    freeCount: 0,
    pendingCount: 0,
    successCount: 0,
    conversionRate: 0
  });
  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsFilterStatus, setPaymentsFilterStatus] = useState('ALL');
  const [paymentsSearchQuery, setPaymentsSearchQuery] = useState('');
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [billingActionLoading, setBillingActionLoading] = useState<string | null>(null);

  // Phase 5 Audit Retry states
  const [expandedAdminInvoice, setExpandedAdminInvoice] = useState<string | null>(null);
  const [retryLoadingId, setRetryLoadingId] = useState<string | null>(null);
  const [retryStatusMessage, setRetryStatusMessage] = useState<string | null>(null);

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

      // Load optimization/visibility settings
      const settingsRes = await getAdminOptimizationSettings();
      if (settingsRes.success && settingsRes.settings) {
        setSignalVisibilityState(settingsRes.settings.signal_visibility || 'premium');
      }

      // Load feature flags
      const flagsRes = await getAllFeatureFlags();
      if (flagsRes.success) {
        setFeatureFlags(flagsRes.flags);
      }

      // Load SaaS dynamic Billing plans, Wallets settings, and Revenue stats
      const [plansRes, walletsRes, saasRes, ledgerRes] = await Promise.all([
        getBillingPlans(),
        getWalletSettings(),
        getSaaSStatistics(),
        getAdminPaymentsLedger({
          status: paymentsFilterStatus,
          searchQuery: paymentsSearchQuery,
          page: paymentsPage
        })
      ]);

      if (plansRes.success && plansRes.plans) {
        setPlans(plansRes.plans);
      }
      if (walletsRes.success && walletsRes.wallets) {
        setWallets(walletsRes.wallets);
      }
      if (saasRes.success && saasRes.stats) {
        setSaasStats(saasRes.stats);
      }
      if (ledgerRes.success) {
        setPaymentsList(ledgerRes.payments || []);
        setPaymentsTotal(ledgerRes.total || 0);
      }

      // Load Referrals Ledger
      const refLedgerRes = await getAdminReferralsLedger();
      if (refLedgerRes.success && refLedgerRes.ledger) {
        setReferralsLedger(refLedgerRes.ledger);
      }

    } catch (err) {
      setAuthError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [paymentsFilterStatus, paymentsSearchQuery, paymentsPage]);

  // Actions handlers
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

  const handleUpdateReferrer = async (userId: string, referrerTraderId: string) => {
    setActionLoading(userId);
    setMessage(null);
    try {
      const res = await updateUserReferrer(userId, referrerTraderId || null);
      if (res.success) {
        setMessage({ type: 'success', text: 'User referrer updated successfully.' });
        setEditingReferrerUser(null);
        setNewReferrerTraderId('');
        await loadData();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update referrer.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveVisibilityPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setPricingLoading(true);
    setPricingMessage(null);
    try {
      const res = await updateAdminOptimizationSettings({
        signal_visibility: signalVisibility
      });
      if (res.success) {
        setPricingMessage({ type: 'success', text: 'Visibility Policy configurations updated successfully.' });
      } else {
        setPricingMessage({ type: 'error', text: res.error || 'Failed to update policies.' });
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

  // SaaS edits handlers
  const handleUpdatePrice = async (planId: string, price: number, discount: number, enabled: boolean) => {
    setBillingActionLoading(planId);
    setMessage(null);
    try {
      const res = await updateBillingPlan(planId, price, enabled, discount);
      if (res.success) {
        setMessage({ type: 'success', text: `Plan price settings for "${planId}" successfully saved.` });
        await loadData();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to save plan.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBillingActionLoading(null);
    }
  };

  const handleUpdateWallet = async (network: string, address: string, enabled: boolean) => {
    setBillingActionLoading(network);
    setMessage(null);
    try {
      const res = await updateWalletAddress(network, address, enabled);
      if (res.success) {
        setMessage({ type: 'success', text: `Wallet address configured for "${network}" successfully.` });
        await loadData();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to save wallet.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBillingActionLoading(null);
    }
  };

  const handleAdminRetry = async (invoiceId: string) => {
    setRetryLoadingId(invoiceId);
    setRetryStatusMessage(null);
    try {
      const res = await retryAdminPaymentVerification(invoiceId);
      if (res.success) {
        setRetryStatusMessage(res.message || 'Verification checks passed successfully!');
        await loadData();
      } else {
        setRetryStatusMessage(`Verification failed: ${res.error || 'Awaiting block confirmations.'}`);
      }
    } catch (err: any) {
      setRetryStatusMessage(`Error: ${err.message}`);
    } finally {
      setRetryLoadingId(null);
    }
  };

  const filteredUsers = users.filter((u) => u.status === activeUserSubTab);

  if (loading && users.length === 0) {
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
            You do not possess the digital signatures required to read these admin ledgers.
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

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8 text-left font-mono">
        
        {/* Title / Action bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
          <div>
            <span className="text-[10px] font-mono text-rose-500 font-bold uppercase tracking-wider block">compliance control console</span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
              Quotex VIP Administration
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => router.push('/admin/signal-analytics')}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-glass-border hover:border-rose-500/30 bg-slate-900/40 text-slate-400 hover:text-rose-400 text-xs transition-colors"
            >
              <BarChart2 className="h-3.5 w-3.5 text-rose-500" /> OPTIMIZATION
            </button>
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-glass-border hover:border-neon-green/30 bg-slate-900/40 text-slate-400 hover:text-neon-green text-xs transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> REFRESH LEDGER
            </button>
          </div>
        </div>

        {/* Global tab selectors */}
        <div className="flex gap-2 border-b border-glass-border pb-2 text-xs">
          {[
            { id: 'users', label: 'TRADERS DATABASE', icon: Users },
            { id: 'pipelines', label: 'DATA PIPELINES', icon: Cpu },
            { id: 'billing', label: 'SaaS BILLING & REVENUE', icon: CreditCard },
            { id: 'referrals', label: 'REFERRALS LEDGER', icon: Award }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setAdminTab(t.id as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg font-bold border-t border-x transition-all ${
                adminTab === t.id
                  ? 'bg-slate-900 border-glass-border text-rose-500'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* System Message Notifications */}
        {message && (
          <div className={`p-4 rounded border text-xs leading-relaxed ${
            message.type === 'success' ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* TAB 1: TRADERS DATABASE */}
        {adminTab === 'users' && (
          <div className="space-y-6">
            {/* Metrics Rows */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: 'TOTAL TRADERS', value: stats.totalUsers, icon: Users, color: 'text-slate-300' },
                { label: 'PENDING VERIFICATION', value: stats.pendingUsers, icon: UserPlus, color: 'text-gold-vip' },
                { label: 'APPROVED TRADERS', value: stats.approvedUsers, icon: UserCheck, color: 'text-neon-green glow-text-green' },
                { label: 'ACTIVE VIP LIFETIME', value: stats.vipUsers, icon: Star, color: 'text-gold-vip' },
                { label: 'TOTAL TRADES LOGGED', value: stats.totalTrades, icon: BarChart2, color: 'text-sky-400' },
              ].map((item, i) => (
                <div key={i} className="glass-panel p-4 rounded-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider uppercase">
                    <span>{item.label}</span>
                    <item.icon className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className={`text-xl font-bold mt-3 ${item.color}`}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Sub-tab selection */}
            <div className="border-b border-glass-border flex space-x-6 text-xs">
              {(['pending', 'approved', 'rejected'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveUserSubTab(tab)}
                  className={`pb-3 capitalize transition-all border-b-2 font-bold tracking-wider ${
                    activeUserSubTab === tab
                      ? 'border-rose-500 text-rose-500'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab} User Requests ({users.filter((u) => u.status === tab).length})
                </button>
              ))}
            </div>

            {/* Users ledger table */}
            <div className="glass-panel rounded-xl overflow-hidden border border-glass-border">
              <table className="w-full text-left text-xs border-collapse">
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
                              className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-400/30 transition-colors inline-flex items-center gap-1 text-[10px] font-bold"
                              title="Disable/Suspend Account"
                            >
                              <Trash className="h-3 w-3" />
                              <span>Disable</span>
                            </button>
                          )}
                          {user.status === 'rejected' && (
                            <button
                              disabled={actionLoading === user.id}
                              onClick={() => handleStatusChange(user.id, 'pending')}
                              className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-400/30 transition-colors inline-flex items-center gap-1 text-[10px] font-bold"
                              title="Reset status"
                            >
                              <span>Reset Request</span>
                            </button>
                          )}
                          <button
                            onClick={() => setResettingUser(user)}
                            className="p-1.5 rounded bg-slate-900 border border-glass-border text-slate-400 hover:text-slate-200 inline-flex items-center"
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

            {/* Reset Pass Modal */}
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
                      className="w-full bg-[#030812] border border-glass-border px-3.5 py-2 rounded text-sm text-slate-200 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="flex-1 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase"
                      >
                        RESET PASS
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResettingUser(null);
                          setNewPassword('');
                        }}
                        className="px-4 py-2 rounded bg-slate-900 border border-glass-border hover:bg-slate-800 text-slate-400 text-xs font-bold"
                      >
                        CANCEL
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 2: DATA PIPELINES */}
        {adminTab === 'pipelines' && (
          <div className="space-y-6">
            
            {/* Engine Modes */}
            <div className="glass-panel rounded-xl border border-glass-border p-6 space-y-4">
              <div className="flex items-center gap-3 border-b border-glass-border/40 pb-4">
                <Cpu className="h-4 w-4 text-neon-green" />
                <div>
                  <div className="text-xs font-bold text-neon-green tracking-widest uppercase">SIGNAL ENGINE MODE</div>
                  <div className="text-[9px] text-slate-500">Controls the data pipeline for all signals</div>
                </div>
              </div>

              {modeMessage && (
                <div className={`px-3 py-2 rounded border text-[10px] ${
                  modeMessage.type === 'success' ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
                }`}>
                  {modeMessage.text}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-slate-500" />
                  <span className="text-[10px] text-slate-500 tracking-wider">ACTIVE PIPELINES:</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {signalMode.split(',').map(m => (
                      <span key={m} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        m === 'LIVE_OTC' ? 'text-neon-green border-neon-green/30 bg-neon-green/10' :
                        m === 'LIVE_MARKET' ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' :
                        'text-amber-400 border-amber-400/30 bg-amber-500/10'
                      }`}>
                        {m === 'LIVE_OTC' ? 'OTC' : m === 'LIVE_MARKET' ? 'LIVE' : 'SIMULATION'}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleSignalModeToggle('SIMULATION')}
                    disabled={modeLoading}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded border text-[10px] font-bold tracking-wider transition-all ${
                      signalMode.split(',').includes('SIMULATION')
                        ? 'bg-amber-500/15 border-amber-400/50 text-amber-400'
                        : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:border-amber-400/40 hover:text-amber-400'
                    }`}
                  >
                    <Database className="h-3.5 w-3.5" />
                    SIMULATION
                  </button>
                  <button
                    onClick={() => handleSignalModeToggle('LIVE_OTC')}
                    disabled={modeLoading}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded border text-[10px] font-bold tracking-wider transition-all ${
                      signalMode.split(',').includes('LIVE_OTC')
                        ? 'bg-neon-green/15 border-neon-green/50 text-neon-green'
                        : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:border-neon-green/40 hover:text-neon-green'
                    }`}
                  >
                    <Radio className="h-3.5 w-3.5" />
                    LIVE OTC
                  </button>
                  <button
                    onClick={() => handleSignalModeToggle('LIVE_MARKET')}
                    disabled={modeLoading}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded border text-[10px] font-bold tracking-wider transition-all ${
                      signalMode.split(',').includes('LIVE_MARKET')
                        ? 'bg-rose-500/15 border-rose-500/50 text-rose-400'
                        : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:border-rose-400/40 hover:text-rose-400'
                    }`}
                  >
                    <Cpu className="h-3.5 w-3.5 text-rose-400" />
                    LIVE FOREX
                  </button>
                </div>
              </div>
            </div>

            {/* Visibility policies */}
            <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider block">Gating Visibility policy</span>
                <h2 className="text-sm font-bold text-slate-200">Signals Permission Access Overrides</h2>
              </div>

              <form onSubmit={handleSaveVisibilityPolicy} className="space-y-4 max-w-xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 font-mono text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="radio"
                      name="signal_visibility"
                      value="public"
                      checked={signalVisibility === 'public'}
                      onChange={() => setSignalVisibilityState('public')}
                      className="bg-slate-950 border-glass-border text-purple-500 focus:ring-0 cursor-pointer"
                    />
                    <span>Public (All Registered)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="radio"
                      name="signal_visibility"
                      value="vip"
                      checked={signalVisibility === 'vip'}
                      onChange={() => setSignalVisibilityState('vip')}
                      className="bg-slate-950 border-glass-border text-purple-500 focus:ring-0 cursor-pointer"
                    />
                    <span>VIP Only</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="radio"
                      name="signal_visibility"
                      value="premium"
                      checked={signalVisibility === 'premium'}
                      onChange={() => setSignalVisibilityState('premium')}
                      className="bg-slate-950 border-glass-border text-purple-500 focus:ring-0 cursor-pointer"
                    />
                    <span>Premium Only</span>
                  </label>
                </div>

                {pricingMessage && (
                  <div className={`p-3 rounded border text-[11px] ${
                    pricingMessage.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400' : 'border-rose-500/30 bg-rose-950/20 text-rose-400'
                  }`}>
                    {pricingMessage.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={pricingLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded text-[10px] font-bold uppercase text-slate-950 transition-colors cursor-pointer"
                >
                  {pricingLoading ? 'SAVING CONFIGS...' : 'SAVE CONFIGURATIONS'}
                </button>
              </form>
            </div>

            {/* Feature Flags */}
            <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] text-neon-green font-bold uppercase tracking-wider block">Feature flags</span>
                <h2 className="text-sm font-bold text-slate-200">System Modules Feature Flags</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.keys(featureFlags).map(flagKey => {
                  const isEnabled = featureFlags[flagKey];
                  return (
                    <div key={flagKey} className="glass-panel rounded-xl border border-glass-border p-4 flex flex-col justify-between space-y-4">
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{flagKey.replace('_', ' ')}</div>
                        <div className="text-[8px] text-slate-500">Global toggle logic.</div>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                          isEnabled ? 'bg-neon-green/10 border-neon-green/30 text-neon-green' : 'bg-slate-900 border-glass-border text-slate-500'
                        }`}>
                          {isEnabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                        <button
                          type="button"
                          disabled={flagsLoading}
                          onClick={() => handleFeatureFlagToggle(flagKey, isEnabled)}
                          className={`px-3 py-1 rounded text-[9px] font-bold uppercase transition-all ${
                            isEnabled ? 'bg-rose-950/40 border border-rose-500/20 text-rose-400 hover:bg-rose-950/85' : 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-950/85'
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

          </div>
        )}

        {/* TAB 3: SaaS BILLING & REVENUE */}
        {adminTab === 'billing' && (
          <div className="space-y-8">
            
            {/* SaaS Metrics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'TOTAL REVENUE', value: `$${saasStats.totalRevenue} USDT`, icon: DollarSign, color: 'text-neon-green glow-text-green' },
                { label: 'LAST 30 DAYS REVENUE', value: `$${saasStats.monthlyRevenue} USDT`, icon: DollarSign, color: 'text-slate-200' },
                { label: 'PREMIUM ACTIVE USERS', value: String(saasStats.premiumCount), icon: Award, color: 'text-purple-400' },
                { label: 'VIP ACTIVE MEMBERS', value: String(saasStats.vipCount), icon: Star, color: 'text-gold-vip' },
                { label: 'FREE LOADED TRADERS', value: String(saasStats.freeCount), icon: Users, color: 'text-slate-500' },
                { label: 'CONVERSION ACCURACY RATE', value: `${saasStats.conversionRate}%`, icon: TrendingUp, color: 'text-neon-green' },
                { label: 'PENDING TRANSACTIONS', value: String(saasStats.pendingCount), icon: Clock, color: 'text-amber-400 animate-pulse' },
                { label: 'CONFIRMED AUDITED INVOICES', value: String(saasStats.successCount), icon: Check, color: 'text-neon-green' }
              ].map((item, i) => (
                <div key={i} className="glass-panel p-4 rounded-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 text-[8px] tracking-wider uppercase">
                    <span>{item.label}</span>
                    <item.icon className="h-3.5 w-3.5" />
                  </div>
                  <div className={`text-lg font-extrabold mt-3.5 ${item.color}`}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Pricing Manager Panel (Part 3) */}
            <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4">
              <div className="flex items-center gap-1.5 border-b border-glass-border/40 pb-3">
                <CreditCard className="h-4.5 w-4.5 text-purple-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">SaaS Packages Price Settings</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map((p) => (
                  <PricingEditCard 
                    key={p.id} 
                    plan={p} 
                    loading={billingActionLoading === p.id} 
                    onSave={handleUpdatePrice} 
                  />
                ))}
              </div>
            </div>

            {/* Wallets Address Manager (Part 4) */}
            <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4">
              <div className="flex items-center gap-1.5 border-b border-glass-border/40 pb-3">
                <Wallet className="h-4.5 w-4.5 text-neon-green" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Crypto Deposit Wallets Config</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {wallets.map((w) => (
                  <WalletEditCard 
                    key={w.network} 
                    wallet={w} 
                    loading={billingActionLoading === w.network} 
                    onSave={handleUpdateWallet} 
                  />
                ))}
              </div>
            </div>

            {/* Payments Ledger Audit Log (Part 8) */}
            <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4">
              <div className="flex items-center justify-between border-b border-glass-border/40 pb-3">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-4.5 w-4.5 text-gold-vip" />
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Admin Payment Ledger Audits</span>
                </div>
                <span className="text-[9px] text-slate-500 uppercase">Records: {paymentsTotal}</span>
              </div>

              {/* Filters bar */}
              <div className="flex flex-col sm:flex-row gap-3 text-xs">
                <input
                  type="text"
                  placeholder="Filter by Username, Hash, Address, Trader ID..."
                  value={paymentsSearchQuery}
                  onChange={(e) => { setPaymentsSearchQuery(e.target.value); setPaymentsPage(1); }}
                  className="flex-grow bg-[#02050b] border border-glass-border px-3.5 py-2 rounded text-slate-300 focus:outline-none"
                />

                <select
                  value={paymentsFilterStatus}
                  onChange={(e) => { setPaymentsFilterStatus(e.target.value); setPaymentsPage(1); }}
                  className="bg-[#02050b] border border-glass-border px-3.5 py-2 rounded text-slate-300"
                >
                  <option value="ALL">ALL STATUSES</option>
                  <option value="PENDING">PENDING</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="EXPIRED">EXPIRED</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </div>

              {/* Ledger list */}
              <div className="border border-glass-border/40 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-950 border-b border-glass-border text-slate-500 uppercase tracking-wider text-[9px]">
                    <tr>
                      <th className="p-3">TRADER</th>
                      <th className="p-3">DATE</th>
                      <th className="p-3">PACKAGE</th>
                      <th className="p-3">DEPOSIT</th>
                      <th className="p-3">NETWORK</th>
                      <th className="p-3">TXN HASH</th>
                      <th className="p-3 text-center">CONFS</th>
                      <th className="p-3 text-right">STATUS</th>
                      <th className="p-3 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/30 text-slate-300">
                    {paymentsList.map((p) => {
                      const isExpanded = expandedAdminInvoice === p.id;
                      const canRetry = p.status !== 'CONFIRMED' && p.txn_hash;

                      return (
                        <React.Fragment key={p.id}>
                          <tr 
                            onClick={() => setExpandedAdminInvoice(isExpanded ? null : p.id)}
                            className="hover:bg-slate-900/10 transition-colors cursor-pointer"
                          >
                            <td className="p-3 font-mono text-xs">
                              <div className="font-bold text-slate-200 flex items-center gap-1">
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                {p.users?.username || 'Unknown'}
                              </div>
                              <div className="text-[8px] text-slate-500 mt-0.5">{p.users?.trader_id}</div>
                            </td>
                            <td className="p-3 text-slate-500">
                              {new Date(p.created_at).toLocaleDateString()} {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-3 uppercase font-bold text-slate-300">{p.plan_id.replace('_', ' ')}</td>
                            <td className="p-3 text-slate-200 font-bold">${p.amount}</td>
                            <td className="p-3 text-slate-400">{p.network.replace('_', '-')}</td>
                            <td className="p-3 max-w-[120px] truncate select-all font-bold" title={p.txn_hash || ''}>
                              {p.txn_hash || '—'}
                            </td>
                            <td className="p-3 text-center font-bold text-slate-300">
                              {p.confirmation_count || 0}
                            </td>
                            <td className="p-3 text-right">
                              <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${
                                p.status === 'CONFIRMED' ? 'text-neon-green border-neon-green/30 bg-neon-green/5' :
                                p.status === 'PENDING' || p.status === 'PROCESSING' || p.status === 'DETECTED' || p.status === 'CONFIRMING' ? 'text-amber-400 border-amber-500/30 bg-amber-500/5' :
                                'text-rose-400 border-rose-500/30 bg-rose-500/5'
                              }`}>
                                {p.status}
                              </span>
                            </td>
                            <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                              {canRetry ? (
                                <button
                                  disabled={retryLoadingId === p.id}
                                  onClick={() => handleAdminRetry(p.id)}
                                  className="px-2 py-1 rounded bg-purple-950/40 border border-purple-500/30 text-purple-300 hover:bg-purple-950/80 transition-colors text-[9px] font-bold uppercase flex items-center gap-1 ml-auto"
                                >
                                  {retryLoadingId === p.id ? (
                                    <Loader className="h-2.5 w-2.5 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-2.5 w-2.5" />
                                  )}
                                  <span>Retry</span>
                                </button>
                              ) : (
                                <span className="text-slate-600 text-[9px] italic">—</span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded accordion content */}
                          {isExpanded && (
                            <tr className="bg-slate-900/10 border-t border-glass-border/20">
                              <td colSpan={9} className="p-4 space-y-3.5 text-left">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px] font-mono text-slate-400">
                                  <div>
                                    <span className="text-slate-600 text-[8px] uppercase block">Deposit Address</span>
                                    <span className="text-slate-300 font-bold block select-all mt-0.5">{p.wallet_address}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-600 text-[8px] uppercase block">Invoice ID</span>
                                    <span className="text-slate-300 font-bold block mt-0.5">{p.id}</span>
                                  </div>
                                </div>

                                {retryStatusMessage && retryLoadingId !== p.id && expandedAdminInvoice === p.id && (
                                  <div className="p-2.5 rounded border border-glass-border/30 bg-slate-950/80 text-[10px] font-mono text-slate-300 flex items-center gap-1.5">
                                    <AlertCircle className="h-3.5 w-3.5 text-neon-green" />
                                    <span>{retryStatusMessage}</span>
                                  </div>
                                )}

                                <div className="border-t border-glass-border/20 pt-3">
                                  <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">Audit Transition Logs</div>
                                  <div className="space-y-1.5 pl-2 max-h-40 overflow-y-auto scrollbar-thin">
                                    {p.transition_logs && p.transition_logs.map((log: string, idx: number) => (
                                      <div key={idx} className="text-[10px] text-slate-400 font-mono flex items-start gap-1">
                                        <span className="text-slate-600 shrink-0">&raquo;</span>
                                        <span>{log}</span>
                                      </div>
                                    ))}
                                    {(!p.transition_logs || p.transition_logs.length === 0) && (
                                      <div className="text-[10px] text-slate-600 italic pl-1">No lifecycle state transition logs captured.</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {paymentsList.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-500 uppercase">
                          No audit transaction records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        )}

        {/* TAB 4: REFERRALS LEDGER */}
        {adminTab === 'referrals' && (
          <div className="space-y-6">
            {/* Referrals Summary Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 animate-fadeIn">
              <div className="glass-panel p-4 rounded-xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider uppercase">
                  <span>Total Referrers</span>
                  <Users className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div className="text-xl font-bold mt-3 text-slate-200">
                  {referralsLedger.length}
                </div>
              </div>
              <div className="glass-panel p-4 rounded-xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider uppercase">
                  <span>Total Referred Friends</span>
                  <UserPlus className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div className="text-xl font-bold mt-3 text-gold-vip font-extrabold">
                  {referralsLedger.reduce((sum, r) => sum + r.total, 0)}
                </div>
              </div>
              <div className="glass-panel p-4 rounded-xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider uppercase">
                  <span>Approved Friends</span>
                  <UserCheck className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div className="text-xl font-bold mt-3 text-neon-green glow-text-green">
                  {referralsLedger.reduce((sum, r) => sum + r.approved, 0)}
                </div>
              </div>
              <div className="glass-panel p-4 rounded-xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider uppercase">
                  <span>Pending Friends</span>
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div className="text-xl font-bold mt-3 text-amber-400">
                  {referralsLedger.reduce((sum, r) => sum + r.pending, 0)}
                </div>
              </div>
            </div>

            {/* Referrals ledger table */}
            <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4">
              <div className="flex items-center justify-between border-b border-glass-border/40 pb-3">
                <div className="flex items-center gap-1.5">
                  <Award className="h-4.5 w-4.5 text-gold-vip" />
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Referrers & Invitations Tracker</span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-glass-border">
                <table className="w-full text-xs font-mono text-slate-300">
                  <thead>
                    <tr className="border-b border-slate-900 bg-slate-950/80 text-slate-500 text-left">
                      <th className="p-3 font-bold">Referrer Trader ID</th>
                      <th className="p-3 font-bold">Referrer Username</th>
                      <th className="p-3 font-bold text-center">Conversions (Approved/Total)</th>
                      <th className="p-3 font-bold text-center">Conversion Rate</th>
                      <th className="p-3 font-bold text-center">Next Milestone Progress</th>
                      <th className="p-3 font-bold text-center">Premium Rewards Earned</th>
                      <th className="p-3 font-bold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/40">
                    {referralsLedger.map((r, idx) => {
                      const rewardMonths = Math.floor(r.approved / 5);
                      const conversionRate = r.total > 0 ? Math.round((r.approved / r.total) * 100) : 0;
                      const progressCount = r.approved % 5;
                      const progressPercent = (progressCount / 5) * 100;
                      return (
                        <React.Fragment key={idx}>
                          <tr className="hover:bg-slate-900/20 transition-colors">
                            <td className="p-3 font-bold text-slate-200">{r.trader_id}</td>
                            <td className="p-3 text-slate-400">{r.username}</td>
                            <td className="p-3 text-center text-slate-300">
                              <span className="text-emerald-400 font-bold">{r.approved}</span> / <span className="text-slate-500">{r.total}</span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                conversionRate >= 80 ? 'bg-emerald-500/10 text-emerald-400' : conversionRate >= 50 ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'
                              }`}>
                                {conversionRate}%
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 bg-slate-950 border border-slate-900 rounded-full h-1.5 overflow-hidden shrink-0">
                                  <div className="bg-gold-vip h-full rounded-full" style={{ width: `${progressPercent}%` }} />
                                </div>
                                <span className="text-[10px] text-slate-500">{progressCount}/5</span>
                              </div>
                            </td>
                            <td className="p-3 text-center text-gold-vip font-extrabold">{rewardMonths} Month{rewardMonths !== 1 && 's'}</td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => {
                                  setExpandedAdminInvoice(expandedAdminInvoice === r.trader_id ? null : r.trader_id);
                                }}
                                className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-glass-border text-slate-300 transition-colors"
                              >
                                {expandedAdminInvoice === r.trader_id ? 'Hide Details' : 'View Referrals'}
                              </button>
                            </td>
                          </tr>
                          {/* Expanded list of referred friends & milestones */}
                          {expandedAdminInvoice === r.trader_id && (
                            <tr>
                              <td colSpan={7} className="bg-slate-950/60 p-5 border-t border-slate-900">
                                {/* Lifetime Stats Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5 text-left animate-fadeIn">
                                  <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900/60 flex flex-col justify-between">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">invited friends</span>
                                    <span className="text-sm font-extrabold text-slate-200 mt-1">{r.total}</span>
                                  </div>
                                  <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900/60 flex flex-col justify-between">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">approved count</span>
                                    <span className="text-sm font-extrabold text-emerald-400 mt-1">{r.approved}</span>
                                  </div>
                                  <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900/60 flex flex-col justify-between">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">pending count</span>
                                    <span className="text-sm font-extrabold text-amber-400 mt-1">{r.pending}</span>
                                  </div>
                                  <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900/60 flex flex-col justify-between">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">rejected count</span>
                                    <span className="text-sm font-extrabold text-rose-500 mt-1">{r.total - r.approved - r.pending}</span>
                                  </div>
                                  <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900/60 flex flex-col justify-between">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">rewards earned</span>
                                    <span className="text-sm font-extrabold text-gold-vip mt-1">{Math.floor(r.approved / 5)} Month{Math.floor(r.approved / 5) !== 1 && 's'}</span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
                                  {/* Left Pane: Referred Users */}
                                  <div className="lg:col-span-6 space-y-3">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">referred friends database</div>
                                    <div className="grid grid-cols-1 gap-2">
                                      {r.referredUsers.map((friend: any, fIdx: number) => (
                                        <div key={fIdx} className="glass-panel p-3 rounded-lg border border-slate-900/60 flex items-center justify-between">
                                          <div className="space-y-1">
                                            <div className="font-bold text-slate-300">{friend.trader_id} ({friend.username || 'N/A'})</div>
                                            <div className="text-[10px] text-slate-500">Registered: {new Date(friend.created_at).toLocaleDateString()}</div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${
                                              friend.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : friend.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                            }`}>
                                              {friend.status}
                                            </span>
                                            <button
                                              onClick={() => {
                                                setEditingReferrerUser(friend);
                                                setNewReferrerTraderId(r.trader_id);
                                              }}
                                              className="px-2 py-1 rounded bg-slate-900 border border-glass-border hover:border-rose-500/30 text-[10px] text-slate-400 hover:text-rose-400 transition-all active:scale-95"
                                            >
                                              Modify Referrer
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Right Pane: Rewards & Milestones */}
                                  <div className="lg:col-span-6 space-y-4 font-sans">
                                    <div className="space-y-2">
                                      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold">Reward Progress</div>
                                      <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-900 space-y-3">
                                        <div className="flex justify-between items-center text-[11px]">
                                          <span className="text-slate-400 font-mono">Next Free Month:</span>
                                          <span className="text-gold-vip font-extrabold font-mono">{r.approved % 5} / 5 Approved</span>
                                        </div>
                                        {/* Visual progress bar */}
                                        <div className="w-full bg-slate-950 border border-slate-900 rounded-full h-2.5 overflow-hidden">
                                          <div className="bg-gold-vip h-full rounded-full" style={{ width: `${((r.approved % 5) / 5) * 100}%` }} />
                                        </div>
                                        <p className="text-[10px] text-slate-500 leading-normal">
                                          Unlocks 1 month of Premium Signal Pro automatically once the progress reaches 5/5.
                                        </p>
                                      </div>
                                    </div>

                                    {/* Rewards Issued Ledger */}
                                    <div className="space-y-2">
                                      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold">Rewards Issued History</div>
                                      <div className="bg-slate-900/40 rounded-lg border border-slate-900 overflow-hidden">
                                        <table className="w-full text-[10px] font-mono text-slate-400">
                                          <thead>
                                            <tr className="border-b border-slate-900 bg-slate-950/80 text-slate-500 text-left">
                                              <th className="p-2.5 font-bold">Reward</th>
                                              <th className="p-2.5 font-bold">Applied To</th>
                                              <th className="p-2.5 font-bold">Validity Range</th>
                                              <th className="p-2.5 font-bold text-center">Status</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-900/40">
                                            {(() => {
                                              const approvedSorted = r.referredUsers
                                                .filter((u: any) => u.status === 'approved')
                                                .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                                              
                                              const rewards = [];
                                              for (let i = 4; i < approvedSorted.length; i += 5) {
                                                const startDate = new Date(approvedSorted[i].created_at);
                                                const expiryDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                                                const isActive = Date.now() < expiryDate.getTime();
                                                rewards.push({
                                                  month: Math.floor((i + 1) / 5),
                                                  startStr: startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                                                  expiryStr: expiryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                                                  status: isActive ? 'Active' : 'Expired'
                                                });
                                              }

                                              if (rewards.length === 0) {
                                                return (
                                                  <tr>
                                                    <td colSpan={4} className="p-4 text-center text-slate-600 italic">
                                                      No milestones reached yet.
                                                    </td>
                                                  </tr>
                                                );
                                              }

                                              return rewards.map((rw, rwIdx) => (
                                                <tr key={rwIdx} className="hover:bg-slate-900/10">
                                                  <td className="p-2.5 font-bold text-gold-vip">+1 Premium Month (#{rw.month})</td>
                                                  <td className="p-2.5 text-slate-300">Premium Plan</td>
                                                  <td className="p-2.5 text-slate-400">{rw.startStr} &ndash; {rw.expiryStr}</td>
                                                  <td className="p-2.5 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${
                                                      rw.status === 'Active'
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                        : 'bg-slate-950 text-slate-600 border border-slate-900'
                                                    }`}>
                                                      {rw.status}
                                                    </span>
                                                  </td>
                                                </tr>
                                              ));
                                            })()}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {referralsLedger.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500 uppercase">
                          No active referrals found in the ledger.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Modal Dialog: Modify Referrer */}
        {editingReferrerUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md glass-panel p-6 rounded-xl border border-glass-border space-y-4">
              <div className="flex items-center gap-1.5 border-b border-glass-border/40 pb-3 text-gold-vip">
                <Award className="h-5 w-5" />
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200">Re-assign Referrer ID</h3>
              </div>
              <div className="text-[11px] font-sans text-slate-400 leading-relaxed">
                You are manually editing the referrer relation for trader <strong className="text-slate-300">{editingReferrerUser.trader_id}</strong>. Set the Sponsor Trader ID below, or leave it blank to clear.
              </div>
              
              <div className="space-y-1.5">
                <label className="block text-[9px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                  Sponsor Trader ID
                </label>
                <input
                  type="text"
                  value={newReferrerTraderId}
                  onChange={(e) => setNewReferrerTraderId(e.target.value)}
                  placeholder="e.g. MAGNET001 (Leave blank to remove)"
                  className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => handleUpdateReferrer(editingReferrerUser.id, newReferrerTraderId)}
                  disabled={actionLoading === editingReferrerUser.id}
                  className="flex-1 py-2 rounded bg-gold-vip text-slate-950 font-bold text-xs font-mono uppercase tracking-wider hover:bg-yellow-400 transition-colors flex items-center justify-center gap-1"
                >
                  {actionLoading === editingReferrerUser.id ? <Loader className="h-3 w-3 animate-spin text-slate-950" /> : 'Confirm Save'}
                </button>
                <button
                  onClick={() => {
                    setEditingReferrerUser(null);
                    setNewReferrerTraderId('');
                  }}
                  className="flex-1 py-2 rounded bg-slate-900 border border-glass-border text-slate-400 text-xs font-mono font-bold hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      <Footer />
    </div>
  );
}

// ─── Sub Pricing Card Component ──────────────────────────────────────────────
interface PricingEditProps {
  plan: any;
  loading: boolean;
  onSave: (id: string, price: number, discount: number, enabled: boolean) => void;
}

function PricingEditCard({ plan, loading, onSave }: PricingEditProps) {
  const [price, setPrice] = useState(plan.price);
  const [discount, setDiscount] = useState(plan.discount);
  const [enabled, setEnabled] = useState(plan.enabled);

  return (
    <div className="glass-panel p-4.5 rounded-xl border border-glass-border/60 flex flex-col justify-between space-y-4">
      <div className="space-y-3 font-mono text-xs">
        <div>
          <span className="text-[8px] text-slate-500 block uppercase">{plan.id.replace('_', ' ')}</span>
          <h4 className="font-bold text-slate-200 mt-0.5">{plan.name}</h4>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[8px] text-slate-500 block">PRICE ($)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              disabled={plan.id === 'free' || plan.id === 'vip'}
              className="w-full bg-[#02050b] border border-glass-border px-2 py-1 rounded text-slate-200 text-xs focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[8px] text-slate-500 block">DISCOUNT (%)</label>
            <input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              disabled={plan.id === 'free' || plan.id === 'vip'}
              className="w-full bg-[#02050b] border border-glass-border px-2 py-1 rounded text-slate-200 text-xs focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-glass-border/30 pt-3">
          <span className="text-slate-500">PLAN ENABLED</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={plan.id === 'free'}
            className="rounded border-glass-border bg-slate-950 text-rose-500 focus:ring-0 cursor-pointer h-4 w-4"
          />
        </div>
      </div>

      <button
        onClick={() => onSave(plan.id, price, discount, enabled)}
        disabled={loading || plan.id === 'free'}
        className="w-full py-1.5 rounded bg-slate-900 border border-glass-border text-slate-300 font-bold uppercase text-[9px] hover:text-slate-200 transition-colors disabled:opacity-30 cursor-pointer"
      >
        {loading ? 'SAVING...' : 'SAVE CONFIGS'}
      </button>
    </div>
  );
}

// ─── Sub Wallet Card Component ───────────────────────────────────────────────
interface WalletEditProps {
  wallet: any;
  loading: boolean;
  onSave: (network: string, address: string, enabled: boolean) => void;
}

function WalletEditCard({ wallet, loading, onSave }: WalletEditProps) {
  const [address, setAddress] = useState(wallet.address);
  const [enabled, setEnabled] = useState(wallet.enabled);

  return (
    <div className="glass-panel p-4.5 rounded-xl border border-glass-border/60 flex flex-col justify-between space-y-4">
      <div className="space-y-3 font-mono text-xs text-left">
        <div>
          <span className="text-[8px] text-slate-500 block uppercase">{wallet.network.replace('_', ' ')}</span>
          <h4 className="font-bold text-slate-200 mt-0.5">{wallet.display_name} Address</h4>
        </div>

        <div className="space-y-1">
          <label className="text-[8px] text-slate-500 block">DEPOSIT WALLET ADDRESS</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full bg-[#02050b] border border-glass-border px-3 py-1.5 rounded text-slate-200 text-xs focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between border-t border-glass-border/30 pt-3">
          <span className="text-slate-500">NETWORK ENABLED</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-glass-border bg-slate-950 text-rose-500 focus:ring-0 cursor-pointer h-4 w-4"
          />
        </div>
      </div>

      <button
        onClick={() => onSave(wallet.network, address, enabled)}
        disabled={loading}
        className="w-full py-1.5 rounded bg-slate-900 border border-glass-border text-slate-300 font-bold uppercase text-[9px] hover:text-slate-200 transition-colors disabled:opacity-30 cursor-pointer"
      >
        {loading ? 'SAVING...' : 'SAVE WALLET'}
      </button>
    </div>
  );
}
