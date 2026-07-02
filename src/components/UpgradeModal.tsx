'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, Award, Zap, Send, ShieldAlert, ArrowRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { getPublicOptimizationSettings } from '@/app/actions/admin_optimization';

export default function UpgradeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [defaultPlan, setDefaultPlan] = useState<'vip' | 'premium'>('premium');
  const [prices, setPrices] = useState({
    monthly: '$19',
    sixMonths: '$99',
    lifetime: '$199'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Listen for custom window event to open modal
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.requestedPlan) {
        setDefaultPlan(customEvent.detail.requestedPlan);
      }
      setIsOpen(true);
      fetchPrices();
    };

    window.addEventListener('open-upgrade-modal', handleOpen);
    return () => {
      window.removeEventListener('open-upgrade-modal', handleOpen);
    };
  }, []);

  const fetchPrices = async () => {
    setLoading(true);
    try {
      const res = await getPublicOptimizationSettings();
      if (res.success && res.settings) {
        setPrices({
          monthly: res.settings['price_premium_monthly'] || '$19',
          sixMonths: res.settings['price_premium_6months'] || '$99',
          lifetime: res.settings['price_premium_lifetime'] || '$199'
        });
      }
    } catch (err) {
      console.error('Failed to load prices dynamically:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="w-full max-w-4xl glass-panel bg-slate-950 border border-glass-border rounded-2xl relative overflow-hidden my-8">
        
        {/* Decorative backdrop gradients */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-glass-border/40">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold font-mono text-slate-100 uppercase tracking-wide">
              Upgrade Subscription Tier
            </h2>
            <p className="text-[10px] font-mono text-slate-500">
              SECURE UPGRADE GATEWAY • DYNAMIC DATA LOADED
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg border border-glass-border/40 bg-slate-900/60 text-slate-500 hover:text-slate-300 hover:border-slate-700/60 transition-colors"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Modal Body / Plan Comparison */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto max-h-[70vh]">
          
          {/* Plan 1: VIP Journal */}
          <div className="glass-panel border border-glass-border/60 bg-slate-900/10 p-6 rounded-xl flex flex-col justify-between space-y-6 relative">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 border border-blue-500/25 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Tier Unlocked via Referral
                </span>
                <Award className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-mono text-slate-200">VIP Journal</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">LIFETIME FREE ACCESS</p>
              </div>

              <div className="py-2.5 border-y border-glass-border/40">
                <span className="text-2xl font-mono font-extrabold text-slate-100">$0</span>
                <span className="text-xs text-slate-500 font-mono ml-1.5">with partner broker deposit</span>
              </div>

              <ul className="space-y-2.5 text-xs text-slate-400">
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                  <span>Advanced Multi-Asset Trading Journal</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                  <span>Interactive statistics & performance analysis charts</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                  <span>Interactive pre-trade strategy checklist</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                  <span>Dynamic leverage & position sizing risk calculator</span>
                </li>
              </ul>
            </div>

            <div className="pt-4">
              <Link
                href="/register-info"
                onClick={() => setIsOpen(false)}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded border border-blue-500/30 hover:border-blue-400 bg-blue-500/5 hover:bg-blue-500/10 text-xs font-mono font-bold text-blue-400 uppercase tracking-wider transition-all"
              >
                Link Broker Account <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Plan 2: Premium Signal Pro */}
          <div className="glass-panel border-2 border-purple-500/30 bg-purple-950/5 p-6 rounded-xl flex flex-col justify-between space-y-6 relative">
            {/* Best Value indicator */}
            <div className="absolute -top-3.5 right-6 px-3 py-1 bg-purple-600 text-white rounded-full text-[9px] font-mono font-bold uppercase tracking-wider shadow-lg shadow-purple-900/30">
              Highly Recommended
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-purple-400 bg-purple-500/10 border border-purple-500/25 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Automated Signals Tier
                </span>
                <Zap className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-mono text-slate-200">Premium Signal Pro</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">FULL SIGNAL SYSTEM & LOGS</p>
              </div>

              {/* Pricing Cards */}
              <div className="grid grid-cols-3 gap-2 bg-[#02050b]/80 border border-glass-border/40 p-2.5 rounded-lg text-center font-mono">
                <div>
                  <div className="text-[8px] text-slate-500 uppercase tracking-wider">Monthly</div>
                  <div className="text-sm font-bold text-slate-200 mt-0.5">{prices.monthly}</div>
                </div>
                <div className="border-x border-glass-border/40">
                  <div className="text-[8px] text-slate-500 uppercase tracking-wider">6-Months</div>
                  <div className="text-sm font-bold text-slate-200 mt-0.5">{prices.sixMonths}</div>
                </div>
                <div>
                  <div className="text-[8px] text-slate-500 uppercase tracking-wider">Lifetime</div>
                  <div className="text-sm font-bold text-slate-200 mt-0.5">{prices.lifetime}</div>
                </div>
              </div>

              <ul className="space-y-2.5 text-xs text-slate-400">
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
                  <span>**Includes everything inside the VIP tier**</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
                  <span>Real-time live signal dash (Forex Webhooks & OTC)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
                  <span>Historical signal databases & verified logs archive</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
                  <span>Dynamic Premium performance & win rate reporting</span>
                </li>
              </ul>
            </div>

            <div className="pt-4">
              <Link
                href="/dashboard/subscription"
                onClick={() => setIsOpen(false)}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded border border-purple-500/35 hover:border-purple-400 bg-purple-600 hover:bg-purple-500 text-xs font-mono font-bold text-white uppercase tracking-wider transition-all shadow-md shadow-purple-900/20"
              >
                <Zap className="h-3.5 w-3.5" /> Subscription
              </Link>
            </div>
          </div>

        </div>

        {/* Modal Footer / Secure Checkout Notice */}
        <div className="p-4 bg-slate-900/30 border-t border-glass-border/40 text-center font-mono text-[10px] text-slate-500 flex items-center justify-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>PORTAL SECURED BY ENCRYPTED ACCESS • PRICING CONFIGURATIONS STORED IN CLOUD DB</span>
        </div>

      </div>
    </div>
  );
}
