'use client';

import React from 'react';
import { Lock, Award, Zap, ShieldAlert, ArrowRight } from 'lucide-react';
import { getFeatureRequiredRoleLabel } from '@/lib/permissions';

interface LockedFeatureProps {
  feature: string;
}

export default function LockedFeature({ feature }: LockedFeatureProps) {
  const requiredPlan = getFeatureRequiredRoleLabel(feature);
  const isPremiumRequired = requiredPlan === 'Premium Signal Pro';

  const triggerUpgrade = () => {
    // Dispatch custom window event to open the centralized upgrade modal
    window.dispatchEvent(new CustomEvent('open-upgrade-modal', { 
      detail: { requestedPlan: isPremiumRequired ? 'premium' : 'vip' } 
    }));
  };

  const premiumBenefits = [
    'Real-time automated signals engine (Forex & OTC)',
    '1-minute strategy indicators with trend filters',
    'Historical signal audits and full win rate database logs',
    'Premium Performance Analytics & Equity Curve reports'
  ];

  const vipBenefits = [
    'Advanced Multi-Asset Trading Journal',
    'Interactive statistics, charts, and metrics dashboard',
    'Position Sizing & Risk Management calculators',
    'Custom pre-trade strategy checklist system'
  ];

  const benefitsList = isPremiumRequired ? premiumBenefits : vipBenefits;

  return (
    <div className="flex items-center justify-center p-6 min-h-[500px]">
      <div className="w-full max-w-2xl glass-panel p-8 rounded-2xl border border-glass-border bg-slate-950/60 relative overflow-hidden text-center space-y-6">
        {/* Glow effect */}
        <div className={`absolute -top-32 -left-32 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-20 ${
          isPremiumRequired ? 'bg-purple-500' : 'bg-blue-500'
        }`} />

        {/* Lock Shield Icon */}
        <div className="inline-flex p-4 rounded-full bg-slate-900 border border-glass-border text-slate-400 relative">
          <Lock className="h-8 w-8 text-slate-300" />
          <div className={`absolute -bottom-1 -right-1 p-1 rounded-full text-white ${
            isPremiumRequired ? 'bg-purple-600' : 'bg-blue-600'
          }`}>
            {isPremiumRequired ? <Zap className="h-3 w-3" /> : <Award className="h-3 w-3" />}
          </div>
        </div>

        {/* Plan Header */}
        <div className="space-y-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
            isPremiumRequired 
              ? 'bg-purple-500/10 border border-purple-500/30 text-purple-400' 
              : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
          }`}>
            {requiredPlan} Required
          </span>
          <h2 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-slate-200">
            Locked Feature Access
          </h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            This module is reserved for members subscribed to our <span className="font-semibold text-slate-300">{requiredPlan}</span>.
          </p>
        </div>

        {/* Benefits Matrix */}
        <div className="max-w-md mx-auto bg-slate-900/40 border border-glass-border/40 rounded-xl p-5 text-left space-y-3.5">
          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">UNLOCKED WITH THIS PLAN:</span>
          <ul className="space-y-2.5">
            {benefitsList.map((benefit, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-400">
                <span className={`text-xs mt-0.5 ${isPremiumRequired ? 'text-purple-400' : 'text-blue-400'}`}>✓</span>
                <span className="leading-normal">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={triggerUpgrade}
            className={`inline-flex items-center gap-2 px-8 py-3 rounded-md font-mono text-xs font-bold uppercase tracking-wider text-white transition-all shadow-lg hover:translate-y-[-1px] active:translate-y-[0px] ${
              isPremiumRequired 
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-900/20' 
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-blue-900/20'
            }`}
          >
            Upgrade Membership <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
