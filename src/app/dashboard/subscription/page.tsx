'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Award, RefreshCw, Zap, CheckCircle2,
  Copy, Check, AlertCircle, Loader, X
} from 'lucide-react';
import { 
  getUserSubscriptionState, getBillingPlans, getWalletSettings,
  createPaymentRequest, submitPaymentTxnHash
} from '@/app/actions/billing';

export default function SubscriptionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [subState, setSubState] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [wallets, setWallets] = useState<any[]>([]);

  // Selection states for modal
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedNetwork, setSelectedNetwork] = useState('');
  const [activePayment, setActivePayment] = useState<any>(null);
  const [txnHash, setTxnHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successActivated, setSuccessActivated] = useState(false);

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, plansRes, walletRes] = await Promise.all([
        getUserSubscriptionState(),
        getBillingPlans(),
        getWalletSettings()
      ]);

      if (subRes.success) {
        setSubState(subRes);
      }
      if (plansRes.success && plansRes.plans) {
        setPlans(plansRes.plans.filter(p => p.enabled));
      }
      if (walletRes.success && walletRes.wallets) {
        setWallets(walletRes.wallets);
        if (walletRes.wallets.length > 0) {
          setSelectedNetwork(walletRes.wallets[0].network);
        }
      }
    } catch (err) {
      console.error('Subscription mount error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCheckoutInitiate = async (plan: any) => {
    setSelectedPlan(plan);
    setErrorMsg('');
    setStatusMsg('');
    setTxnHash('');
    
    // Auto initiate request for the default network
    if (wallets.length > 0) {
      const defaultNet = wallets[0].network;
      setSelectedNetwork(defaultNet);
      await createRequestRecord(plan.id, defaultNet);
    }
  };

  const createRequestRecord = async (planId: string, network: string) => {
    setErrorMsg('');
    try {
      const res = await createPaymentRequest(planId, network);
      if (res.success && res.payment) {
        setActivePayment(res.payment);
      } else {
        setErrorMsg(res.error || 'Failed to create payment invoice.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Invoice generation error');
    }
  };

  const handleNetworkChange = async (net: string) => {
    setSelectedNetwork(net);
    if (selectedPlan) {
      await createRequestRecord(selectedPlan.id, net);
    }
  };

  const handleVerifyTxn = async () => {
    if (!txnHash.trim() || txnHash.trim().length < 8) {
      setErrorMsg('Please input a valid transaction hash (at least 8 characters).');
      return;
    }
    setErrorMsg('');
    setVerifying(true);
    setStatusMsg('Verifying blockchain nodes block confirmations...');
    try {
      const res = await submitPaymentTxnHash(activePayment.id, txnHash);
      if (res.success) {
        setSuccessActivated(true);
        setStatusMsg('Success! Your account has been upgraded to Premium.');
        setTimeout(() => {
          setSuccessActivated(false);
          setSelectedPlan(null);
          loadSubscription();
        }, 3000);
      } else {
        setErrorMsg(res.error || 'Verification failed. Double check your tx hash.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification execution error');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">RESOLVING ACCOUNT SUBSCRIPTIONS...</span>
      </div>
    );
  }

  const currentRoleLabel = subState?.traderProfile?.premium_access
    ? 'Premium Pro'
    : subState?.traderProfile?.vip_access
    ? 'VIP Member'
    : 'Free Account';

  const progressPercent = subState?.subscription?.plan_id === 'premium_monthly'
    ? Math.round((subState.remainingDays / 30) * 100)
    : subState?.subscription?.plan_id === 'premium_6months'
    ? Math.round((subState.remainingDays / 180) * 100)
    : 100;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto text-left font-mono">
      
      {/* Title / Hero */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
        <div>
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">billing and invoices</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Subscription Center</h1>
        </div>
        <button
          onClick={loadSubscription}
          className="flex items-center gap-1.5 px-3 py-2 rounded border border-glass-border hover:bg-slate-900/40 text-xs font-mono font-bold text-slate-400 hover:text-slate-200 transition-all uppercase"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh status
        </button>
      </div>

      {/* Active membership status grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Plan card summary */}
        <div className="glass-panel p-5 rounded-xl border border-glass-border flex flex-col justify-between space-y-4 md:col-span-2 transition-all duration-300 hover:scale-[1.01] hover:border-glass-border/50 animate-fadeInUp">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[8px] text-slate-500 uppercase tracking-widest">Active Plan</span>
              <div className="text-xl font-bold text-slate-200 uppercase flex items-center gap-2">
                <Award className="h-5 w-5 text-gold-vip" />
                {currentRoleLabel}
              </div>
            </div>
            <span className={`px-2.5 py-0.5 rounded text-[9px] font-bold border ${
              subState?.hasActiveSubscription
                ? 'border-neon-green/30 bg-neon-green/10 text-neon-green'
                : 'border-slate-800 bg-slate-900/30 text-slate-500'
            }`}>
              {subState?.hasActiveSubscription ? 'ACTIVE SUBSCRIPTION' : 'FREE MODE'}
            </span>
          </div>

          {/* Dates list */}
          {subState?.subscription && (
            <div className="grid grid-cols-2 gap-4 text-xs pt-2 border-t border-glass-border/30">
              <div>
                <span className="text-[8px] text-slate-500 uppercase">Activated At</span>
                <span className="block font-bold text-slate-300 mt-1">
                  {new Date(subState.subscription.activated_at).toLocaleDateString([], { dateStyle: 'medium' })}
                </span>
              </div>
              <div>
                <span className="text-[8px] text-slate-500 uppercase">Expiry Date</span>
                <span className="block font-bold text-gold-vip mt-1">
                  {subState.subscription.expires_at 
                    ? new Date(subState.subscription.expires_at).toLocaleDateString([], { dateStyle: 'medium' })
                    : 'LIFETIME ACCESS'}
                </span>
              </div>
            </div>
          )}

          {/* Cancel future support notice */}
          {subState?.hasActiveSubscription && (
            <div className="text-[8px] text-slate-600 italic">
              * Auto-renew billing is processed via block transfers. Cancel subscription halts future deposit audits.
            </div>
          )}
        </div>

        {/* Days remaining progress widget */}
        <div className="glass-panel p-5 rounded-xl border border-glass-border flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] hover:border-glass-border/50 animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
          <div>
            <span className="text-[8px] text-slate-500 uppercase tracking-widest">Days Remaining</span>
            <div className="text-4xl font-extrabold text-slate-200 mt-3 font-mono">
              {subState?.subscription?.plan_id === 'premium_lifetime' ? '∞' : subState?.remainingDays || 0}
            </div>
            <div className="text-[9px] text-slate-500 mt-1 uppercase">days of premium left</div>
          </div>

          {subState?.subscription && subState?.subscription?.plan_id !== 'premium_lifetime' && (
            <div className="space-y-1.5 pt-4">
              <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-950">
                <div 
                  className="h-full bg-neon-green rounded-full glow-shadow-green transition-all duration-1000"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[8px] text-slate-500">
                <span>0 days</span>
                <span>{progressPercent}% left</span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Plans Pricing Grid */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-glass-border/40 pb-2">
          <Zap className="h-4.5 w-4.5 text-neon-green" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Choose Pricing Package Plan</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {plans.map((p) => {
            const isCurrentPlan = subState?.subscription?.plan_id === p.id;
            const hasDiscount = p.discount > 0;
            const discountedPrice = Math.max(0, p.price - (p.price * (p.discount / 100)));

            return (
              <div 
                key={p.id} 
                className={`glass-panel p-5 rounded-xl border flex flex-col justify-between transition-all duration-300 ${
                  isCurrentPlan 
                    ? 'border-neon-green/30 bg-neon-green/[0.01] scale-[1.02]' 
                    : 'border-glass-border hover:border-slate-700 hover:scale-[1.02] hover:shadow-lg'
                }`}
              >
                <div className="space-y-4">
                  {/* Name */}
                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-500 uppercase block">{p.id.replace('_', ' ')}</span>
                    <h3 className="text-base font-bold text-slate-200 uppercase">{p.name}</h3>
                  </div>

                  {/* Price info */}
                  <div className="pt-2">
                    {hasDiscount ? (
                      <div className="space-y-1">
                        <span className="text-[9px] text-rose-400 font-bold border border-rose-500/30 px-1.5 py-0.5 rounded bg-rose-500/5">
                          {p.discount}% DISCOUNT ACTIVE
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-2">
                          <span className="text-2xl font-extrabold text-slate-200 font-mono">${discountedPrice}</span>
                          <span className="text-xs text-slate-600 line-through">${p.price}</span>
                          <span className="text-[9px] text-slate-500 font-bold uppercase">/ {p.id === 'premium_lifetime' ? 'one-time' : p.id === 'premium_6months' ? '6 mo' : 'mo'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-2xl font-extrabold text-slate-200 font-mono">${p.price}</span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase">/ {p.id === 'premium_lifetime' ? 'one-time' : p.id === 'premium_6months' ? '6 mo' : 'mo'}</span>
                      </div>
                    )}
                  </div>

                  {/* Feature Lists */}
                  <ul className="text-[10px] text-slate-500 space-y-2 pt-4 border-t border-glass-border/30">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />
                      <span>Professional Signals Feed</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />
                      <span>Unlimited Journal Entries</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />
                      <span>Advanced Stats Analytics</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />
                      <span>Chronological timeline audits</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-6">
                  {p.id === 'free' ? (
                    <div className="text-center py-2 text-[9px] font-bold text-slate-600 border border-slate-900 rounded bg-slate-950/20 uppercase">
                      Default Level
                    </div>
                  ) : isCurrentPlan ? (
                    <div className="text-center py-2 text-[9px] font-bold text-neon-green border border-neon-green/30 rounded bg-neon-green/5 uppercase tracking-wider">
                      Current Plan
                    </div>
                  ) : (
                    <button
                      onClick={() => handleCheckoutInitiate(p)}
                      className="w-full py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-[10px] uppercase tracking-wider transition-colors shadow-md shadow-purple-900/40"
                    >
                      Subscribe package
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* Crypto Checkout Modal */}
      {selectedPlan && activePayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg glass-panel p-6 rounded-xl border border-glass-border space-y-5 text-left relative overflow-hidden">
            <button
              onClick={() => setSelectedPlan(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Title */}
            <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
              <Zap className="h-5 w-5 text-neon-green" />
              <span className="font-mono font-bold text-slate-200 text-sm uppercase">USDT Wallet Payment Gateway</span>
            </div>

            {/* Main Payment steps */}
            <div className="space-y-4 font-mono text-xs">
              
              {/* Plan info row */}
              <div className="flex justify-between items-center bg-[#020617]/50 p-3 rounded border border-glass-border/40">
                <div>
                  <span className="text-[8px] text-slate-500 uppercase block">PLAN SELECTION</span>
                  <span className="font-bold text-slate-200 uppercase">{selectedPlan.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-[8px] text-slate-500 uppercase block">TOTAL AMOUNT</span>
                  <span className="font-bold text-neon-green text-sm">${activePayment.amount} USDT</span>
                </div>
              </div>

              {/* Wallet Network Selectors */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-slate-500 uppercase block font-bold">1. Select Network</label>
                <div className="grid grid-cols-2 gap-2">
                  {wallets.map(w => (
                    <button
                      key={w.network}
                      onClick={() => handleNetworkChange(w.network)}
                      className={`py-2 rounded border font-bold text-[10px] text-center transition-all ${
                        selectedNetwork === w.network
                          ? 'border-neon-green/30 bg-neon-green/10 text-neon-green'
                          : 'border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-400'
                      }`}
                    >
                      {w.display_name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Address details */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-slate-500 uppercase block font-bold">2. Transfer Details</label>
                <div className="bg-[#020617] border border-glass-border p-3.5 rounded-lg flex items-center justify-between gap-3">
                  <div className="overflow-x-auto select-all scrollbar-none font-mono text-slate-300 text-[10px]">
                    {activePayment.wallet_address}
                  </div>
                  <button
                    onClick={() => copyAddress(activePayment.wallet_address)}
                    className="p-2 rounded bg-slate-900 border border-glass-border text-slate-400 hover:text-slate-200 transition-colors shrink-0"
                    title="Copy wallet address"
                  >
                    {copied ? <Check className="h-4 w-4 text-neon-green" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[8px] text-slate-500 uppercase font-bold italic tracking-wide">
                  * ONLY send USDT to this address. Sending any other token will result in permanent loss.
                </p>
              </div>

              {/* Tx Hash Input */}
              <div className="space-y-1.5 border-t border-glass-border/30 pt-4">
                <label className="text-[9px] text-slate-500 uppercase block font-bold">3. Enter Transaction Hash / Tx ID</label>
                <input
                  type="text"
                  placeholder="e.g. f83d7a8b9c20..."
                  value={txnHash}
                  onChange={(e) => setTxnHash(e.target.value)}
                  disabled={verifying}
                  className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none focus:border-neon-green/30 text-xs"
                />
              </div>

              {/* Status & Loader alerts */}
              {verifying && (
                <div className="flex items-center gap-2 text-gold-vip text-[10px] bg-gold-vip/5 p-3.5 rounded border border-gold-vip/20">
                  <Loader className="h-4 w-4 animate-spin shrink-0" />
                  <span>{statusMsg}</span>
                </div>
              )}

              {successActivated && (
                <div className="flex items-center gap-2 text-neon-green text-[10px] bg-neon-green/5 p-3.5 rounded border border-neon-green/20">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{statusMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-400 text-[10px] bg-rose-500/5 p-3.5 rounded border border-rose-500/20">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

            </div>

            {/* Modal Actions */}
            <div className="pt-2 grid grid-cols-2 gap-3 font-mono">
              <button
                onClick={() => setSelectedPlan(null)}
                disabled={verifying}
                className="py-2.5 rounded bg-slate-900 border border-glass-border text-slate-400 hover:text-slate-200 text-xs font-bold uppercase transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyTxn}
                disabled={verifying || successActivated}
                className="py-2.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase transition-colors shadow-md"
              >
                Verify Payment
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
