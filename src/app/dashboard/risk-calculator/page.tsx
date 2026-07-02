'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';
import { DollarSign, ShieldAlert, Percent, Activity, Calculator, TrendingUp, TrendingDown } from 'lucide-react';

export default function RiskCalculatorPage() {
  const [loading, setLoading] = useState(true);
  const [userAccess, setUserAccess] = useState<any>({
    vipAccess: false,
    premiumAccess: false,
    status: 'pending'
  });

  // Calculator state variables
  const [balance, setBalance] = useState<number>(1000);
  const [riskPercent, setRiskPercent] = useState<number>(1);
  const [entryPrice, setEntryPrice] = useState<number>(1.08500);
  const [stopLoss, setStopLoss] = useState<number>(1.08250);
  const [pipSize, setPipSize] = useState<number>(0.0001); // 4th decimal for standard forex

  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      try {
        const accessRes = await getUserAccessState();
        if (accessRes.success) {
          setUserAccess({
            vipAccess: accessRes.vipAccess,
            premiumAccess: accessRes.premiumAccess,
            status: accessRes.status
          });
        }
      } catch (err) {
        console.error('Failed to load risk calculator access details:', err);
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
        <span className="text-xs font-mono text-slate-500">INITIATING RISK EQUATIONS...</span>
      </div>
    );
  }

  const profile = {
    vip_access: userAccess.vipAccess,
    premium_access: userAccess.premiumAccess,
    status: userAccess.status
  };

  if (!canAccess('risk-calculator', profile)) {
    return <LockedFeature feature="risk-calculator" />;
  }

  // --- CALCULATION LOGIC ---
  const rawRiskAmount = balance * (riskPercent / 100);
  const priceDifference = Math.abs(entryPrice - stopLoss);
  const pipsAtRisk = pipSize > 0 ? priceDifference / pipSize : 0;
  
  // Lot sizing formulas
  // Lot size standard = amount at risk / (pips at risk * pip value)
  // standard pip value for 1 standard lot = $10 (for most majors like EUR/USD when USD is base)
  const pipValueMultiplier = 10; 
  const standardLots = pipsAtRisk > 0 ? rawRiskAmount / (pipsAtRisk * pipValueMultiplier) : 0;
  const unitsCount = Math.round(standardLots * 100000);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-4xl mx-auto animate-fadeIn text-left">
      
      {/* Title */}
      <div className="border-b border-glass-border pb-4">
        <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">capital preservation</span>
        <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Risk Calculator</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        
        {/* Input Card */}
        <div className="glass-panel p-6 rounded-xl border border-glass-border bg-slate-900/10 space-y-5">
          <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
            <Calculator className="h-4.5 w-4.5 text-neon-green" />
            <span className="text-xs font-mono text-slate-300 font-bold uppercase">Calculator Parameters</span>
          </div>

          <div className="space-y-4 font-mono text-xs text-slate-400">
            {/* Account Balance */}
            <div className="space-y-1.5">
              <label className="block text-[9px] text-slate-500 uppercase tracking-widest">Account Balance ($)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-500">$</span>
                <input
                  type="number"
                  value={balance}
                  onChange={(e) => setBalance(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-[#02050b] border border-glass-border pl-8 pr-4 py-2.5 rounded text-xs text-slate-200 focus:outline-none focus:border-neon-green/30"
                />
              </div>
            </div>

            {/* Risk Percentage */}
            <div className="space-y-1.5">
              <label className="block text-[9px] text-slate-500 uppercase tracking-widest">Risk Percentage (%)</label>
              <div className="relative">
                <span className="absolute right-3.5 top-2.5 text-slate-500">%</span>
                <input
                  type="number"
                  step="0.1"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-[#02050b] border border-glass-border px-3.5 py-2.5 rounded text-xs text-slate-200 focus:outline-none focus:border-neon-green/30"
                />
              </div>
            </div>

            {/* Entry Price */}
            <div className="space-y-1.5">
              <label className="block text-[9px] text-slate-500 uppercase tracking-widest">Entry Price ($)</label>
              <input
                type="number"
                step="0.00001"
                value={entryPrice}
                onChange={(e) => setEntryPrice(Math.max(0, Number(e.target.value)))}
                className="w-full bg-[#02050b] border border-glass-border px-3.5 py-2.5 rounded text-xs text-slate-200 focus:outline-none focus:border-neon-green/30"
              />
            </div>

            {/* Stop Loss Price */}
            <div className="space-y-1.5">
              <label className="block text-[9px] text-slate-500 uppercase tracking-widest">Stop Loss Price ($)</label>
              <input
                type="number"
                step="0.00001"
                value={stopLoss}
                onChange={(e) => setStopLoss(Math.max(0, Number(e.target.value)))}
                className="w-full bg-[#02050b] border border-glass-border px-3.5 py-2.5 rounded text-xs text-slate-200 focus:outline-none focus:border-neon-green/30"
              />
            </div>

            {/* Pip size configuration */}
            <div className="space-y-1.5">
              <label className="block text-[9px] text-slate-500 uppercase tracking-widest">Asset Decimal Pip Size</label>
              <select
                value={pipSize}
                onChange={(e) => setPipSize(Number(e.target.value))}
                className="w-full bg-[#02050b] border border-glass-border px-3.5 py-2.5 rounded text-xs text-slate-200 focus:outline-none focus:border-neon-green/30"
              >
                <option value={0.0001}>0.0001 (Standard Majors e.g. EUR/USD)</option>
                <option value={0.01}>0.01 (JPY Crosses e.g. USD/JPY)</option>
                <option value={0.001}>0.001 (3-Decimal Cryptos/Forex)</option>
                <option value={1}>1.00 (Index/Whole number points)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Outputs Panel */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-xl border border-glass-border bg-slate-900/10 space-y-6">
            <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
              <Activity className="h-4.5 w-4.5 text-neon-green" />
              <span className="text-xs font-mono text-slate-300 font-bold uppercase">Calculated Matrix</span>
            </div>

            <div className="grid grid-cols-2 gap-4 font-mono">
              
              {/* Risk Amount */}
              <div className="bg-[#020617]/50 border border-glass-border/40 p-4 rounded text-left">
                <div className="text-[8px] text-slate-500 uppercase">Cash Amount at Risk</div>
                <div className="text-xl font-bold text-rose-500 mt-1.5">${rawRiskAmount.toFixed(2)}</div>
              </div>

              {/* Pips to SL */}
              <div className="bg-[#020617]/50 border border-glass-border/40 p-4 rounded text-left">
                <div className="text-[8px] text-slate-500 uppercase">Pips to Stop Loss</div>
                <div className="text-xl font-bold text-slate-200 mt-1.5">{pipsAtRisk.toFixed(1)} Pips</div>
              </div>

              {/* Lot size Standard */}
              <div className="bg-[#020617]/50 border border-glass-border/40 p-4 rounded text-left col-span-2">
                <div className="text-[8px] text-slate-500 uppercase">Recommended Position Sizing</div>
                <div className="text-xl font-bold text-neon-green mt-1.5">
                  {standardLots.toFixed(3)} Lots <span className="text-xs text-slate-400 font-normal">({unitsCount.toLocaleString()} units)</span>
                </div>
              </div>

              {/* lot breaks details */}
              <div className="col-span-2 pt-2 border-t border-glass-border/30 text-[10px] text-slate-500 space-y-1 pl-1">
                <div>• Standard Lots: {standardLots.toFixed(3)} lots (100k per lot)</div>
                <div>• Mini Lots: {(standardLots * 10).toFixed(2)} mini lots (10k per lot)</div>
                <div>• Micro Lots: {(standardLots * 100).toFixed(1)} micro lots (1k per lot)</div>
              </div>

            </div>
          </div>

          {/* Sizing Warning */}
          {riskPercent > 2 && (
            <div className="p-4 bg-rose-950/15 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-mono flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                HIGH RISK WARNING: Risking more than 2% per transaction is considered highly aggressive. Review your capital preservation guidelines.
              </span>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
