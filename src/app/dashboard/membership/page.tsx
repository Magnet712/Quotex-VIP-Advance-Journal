'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getMembershipRole, getFeatureRequiredRoleLabel } from '@/lib/permissions';
import { Award, Zap, User, Calendar, ShieldCheck, Activity, Send, Check } from 'lucide-react';
import Link from 'next/link';

export default function MembershipPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data: userProfile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (userProfile) {
          setProfile(userProfile);
        }
      } catch (err) {
        console.error('Failed to load profile for membership page:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Activity className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">RETRIEVING SUBSCRIPTION STATE...</span>
      </div>
    );
  }

  const role = getMembershipRole(profile);
  const isPremium = role === 'premium';
  const isVip = role === 'vip';

  const triggerUpgrade = (plan: 'vip' | 'premium') => {
    window.dispatchEvent(new CustomEvent('open-upgrade-modal', { 
      detail: { requestedPlan: plan } 
    }));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-4xl mx-auto animate-fadeIn text-left">
      
      {/* Title */}
      <div className="border-b border-glass-border pb-4">
        <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">billing terminal</span>
        <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Membership & Subscriptions</h1>
      </div>

      {/* Current plan box */}
      <div className="glass-panel p-6 rounded-2xl border border-glass-border bg-slate-900/10 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-4">
          <div className="space-y-1">
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Active Plan</span>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold font-mono text-slate-200">
                {isPremium ? 'Premium Signal Pro' : isVip ? 'VIP Journal Member' : 'Free Trader'}
              </h2>
              {isPremium ? (
                <span className="p-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/35">
                  <Zap className="h-4 w-4" />
                </span>
              ) : isVip ? (
                <span className="p-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/35">
                  <Award className="h-4 w-4" />
                </span>
              ) : (
                <span className="p-1 rounded bg-slate-800 text-slate-500 border border-slate-700">
                  <User className="h-4 w-4" />
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs font-mono">
            <div>
              <span className="text-slate-500">Plan Duration:</span>
              <span className="text-slate-300 ml-2">{isPremium || isVip ? 'Lifetime Access' : 'Trial'}</span>
            </div>
            <div>
              <span className="text-slate-500">Status:</span>
              <span className="text-emerald-400 ml-2 font-bold uppercase">Active</span>
            </div>
            <div>
              <span className="text-slate-500">Activation Date:</span>
              <span className="text-slate-300 ml-2">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-500">Renewal Period:</span>
              <span className="text-slate-300 ml-2">{isPremium || isVip ? 'Never (No Renewals)' : 'Upgrade Required'}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {!isPremium && (
          <div className="flex flex-col gap-2.5 shrink-0">
            <button
              onClick={() => triggerUpgrade('premium')}
              className="px-6 py-3 rounded bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-purple-900/20"
            >
              Upgrade to Premium
            </button>
            {!isVip && (
              <button
                onClick={() => triggerUpgrade('vip')}
                className="px-6 py-3 rounded border border-blue-500/35 hover:border-blue-400 bg-blue-500/5 text-blue-400 hover:text-blue-300 font-mono font-bold text-xs uppercase tracking-wider transition-all"
              >
                Unlock VIP Journal
              </button>
            )}
          </div>
        )}
      </div>

      {/* Plan Benefits comparative section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Tier 1: Free */}
        <div className="glass-panel p-5 rounded-xl border border-glass-border bg-slate-900/10 space-y-4">
          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Free Tier Benefits</span>
          <ul className="space-y-2.5 text-xs text-slate-400">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <span>Basic indicator education resources</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <span>Public Telegram channel metrics access</span>
            </li>
          </ul>
        </div>

        {/* Tier 2: VIP */}
        <div className="glass-panel p-5 rounded-xl border border-glass-border/60 bg-slate-900/10 space-y-4">
          <span className="text-[9px] font-mono text-blue-400 uppercase tracking-widest block">VIP Journal Benefits</span>
          <ul className="space-y-2.5 text-xs text-slate-400">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <span>Advanced multi-asset Trading Journal</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <span>Detailed statistics & performance charts</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <span>Risk & position size calculator</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <span>Discipline checklist manager</span>
            </li>
          </ul>
        </div>

        {/* Tier 3: Premium */}
        <div className="glass-panel p-5 rounded-xl border border-purple-500/20 bg-purple-950/5 space-y-4">
          <span className="text-[9px] font-mono text-purple-400 uppercase tracking-widest block">Premium Pro Benefits</span>
          <ul className="space-y-2.5 text-xs text-slate-400">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
              <span>Includes all VIP Journal features</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
              <span>Real-time live signal dash (OTC & Forex)</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
              <span>Signals execution logs & win rate analytics</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
              <span>Equity curve & drawdown performance reports</span>
            </li>
          </ul>
        </div>

      </div>

      {/* Subscription Transaction Logs */}
      <div className="space-y-4">
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">billing ledger</span>
          <h3 className="text-base font-bold font-mono text-slate-200">Subscription History</h3>
        </div>

        <div className="glass-panel border border-glass-border rounded-xl overflow-hidden">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-[#030812] border-b border-glass-border text-slate-500">
              <tr>
                <th className="p-4">ACTIVATION DATE</th>
                <th className="p-4">MEMBERSHIP PLAN</th>
                <th className="p-4">AMOUNT</th>
                <th className="p-4">METHOD</th>
                <th className="p-4 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border/30 text-slate-300">
              {isPremium || isVip ? (
                <tr>
                  <td className="p-4">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}</td>
                  <td className="p-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                      isPremium ? 'bg-purple-950/20 text-purple-400 border border-purple-500/20' : 'bg-blue-950/20 text-blue-400 border border-blue-500/20'
                    }`}>
                      {isPremium ? 'Premium Signal Pro' : 'VIP Journal'}
                    </span>
                  </td>
                  <td className="p-4">$0.00</td>
                  <td className="p-4">{isPremium ? 'Direct Activation' : 'Broker Referral'}</td>
                  <td className="p-4 text-right text-emerald-400 font-bold">COMPLETED</td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 font-mono text-xs">
                    NO PAYMENT TRANSACTIONS LOGGED. ACTIVE ON FREE TIER.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
