'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';
import { 
  DollarSign, ShieldAlert, Percent, Activity, Calculator, 
  TrendingUp, ShieldCheck, Sparkles, BookOpen, Gift, Award
} from 'lucide-react';

export default function RiskCalculatorPage() {
  const [loading, setLoading] = useState(true);
  const [userAccess, setUserAccess] = useState<any>({
    vipAccess: false,
    premiumAccess: false,
    status: 'pending'
  });

  // Calculator inputs state
  const [balance, setBalance] = useState<number>(1000);
  const [riskPercent, setRiskPercent] = useState<number>(2);
  const [payout, setPayout] = useState<number>(90);
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState<number>(5);
  const [dailyMaxRisk, setDailyMaxRisk] = useState<number>(5);
  const [plannedTrades, setPlannedTrades] = useState<number>(10);

  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

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
        <span className="text-xs font-mono text-slate-500">INITIATING CAPITAL PROTECTION METRICS...</span>
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

  // Preset configuration handlers
  const applyPreset = (risk: number, dailyRisk: number) => {
    setRiskPercent(risk);
    setDailyMaxRisk(dailyRisk);
  };

  // --- CALCULATION LOGIC ---
  const investment = balance * (riskPercent / 100);
  const maxDailyLoss = balance * (dailyMaxRisk / 100);
  
  // Maximum loss streak before daily stop (drawdown constraint)
  const maxLossStreakBeforeDailyStop = investment > 0 
    ? Math.floor(maxDailyLoss / investment)
    : 0;

  // Expected profit per win trade
  const expectedProfit = investment * (payout / 100);

  // Recovery wins math: Math.ceil( LossCount / PayoutPercent )
  const payoutDecimal = payout / 100;
  const recoveryWins1Loss = payoutDecimal > 0 ? Math.ceil(1 / payoutDecimal) : 0;
  const recoveryWins2Loss = payoutDecimal > 0 ? Math.ceil(2 / payoutDecimal) : 0;

  // Break-even win rate required
  const minWinRate = payout > 0 
    ? Math.round((100 / (payout + 100)) * 100)
    : 50;

  // Account consecutive losses survival count before reaching daily stop limit
  const survivalLosses = investment > 0 
    ? Math.floor(maxDailyLoss / investment)
    : 0;

  // Risk Status Analyzer Engine
  const getRiskStatus = () => {
    if (riskPercent <= 1.5 && dailyMaxRisk <= 4) {
      return {
        level: 'LOW RISK',
        color: 'text-emerald-400 border-emerald-500/20 bg-emerald-950/5',
        dot: '🟢',
        desc: 'Excellent capital preservation setups. Optimal for long-term compound growth.'
      };
    }
    if (riskPercent <= 3 && dailyMaxRisk <= 7) {
      return {
        level: 'MODERATE RISK',
        color: 'text-gold-vip border-gold-vip/20 bg-gold-vip/5',
        dot: '🟡',
        desc: 'Acceptable parameters. Sizing is balanced, but reduce risk if win streaks decline.'
      };
    }
    return {
      level: 'HIGH RISK',
      color: 'text-rose-500 border-rose-500/20 bg-rose-950/5',
      dot: '🔴',
      desc: 'Highly aggressive sizing. Risk of severe drawdown. Reduce investment sizes immediately.'
    };
  };

  const riskStatus = getRiskStatus();

  // Dynamic Money Management Recommendations
  const getMMRules = () => {
    const rules = [];
    if (riskPercent > 5) {
      rules.push("Your selected trade risk is highly aggressive. Exceeding 5% per trade can wipe out accounts in minor market streaks.");
    } else {
      rules.push("Maintain a strict limit of 1–2% risk per transaction to preserve capital during standard variance phases.");
    }

    if (dailyMaxRisk > 10) {
      rules.push("WARNING: Daily maximum risk limit is excessive. A bad session can delete more than 10% of your total balance.");
    } else {
      rules.push(`Ensure you stop trading immediately once your daily drawdown limit ($${maxDailyLoss.toFixed(2)}) is breached.`);
    }

    rules.push("Never double position sizes after a losing trade (Martingale setups lead to exponential account blowouts).");
    rules.push("Withdraw trading profits regularly to secure real-world capital gains and keep emotion in check.");
    return rules;
  };

  const mmRules = getMMRules();

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-5xl mx-auto animate-fadeIn text-left">
      
      {/* Title */}
      <div className="border-b border-glass-border pb-4">
        <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">capital preservation</span>
        <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Risk Calculator</h1>
      </div>

      {/* Preset Risk Profiles Card */}
      <div className="glass-panel p-4 rounded-xl border border-glass-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/5 transition-all duration-200 hover:border-glass-border/50 animate-fadeInUp">
        <div className="space-y-1">
          <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest block">quick configurations</span>
          <span className="text-xs font-bold font-mono text-slate-300">Preset Risk Profiles</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => applyPreset(1, 3)}
            className="px-3.5 py-2 rounded border border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 font-mono text-xs uppercase tracking-wider transition-all"
          >
            🟢 Conservative (1% / 3%)
          </button>
          <button
            onClick={() => applyPreset(2, 5)}
            className="px-3.5 py-2 rounded border border-gold-vip/25 bg-gold-vip/5 hover:bg-gold-vip/10 text-gold-vip font-mono text-xs uppercase tracking-wider transition-all"
          >
            🟡 Balanced (2% / 5%)
          </button>
          <button
            onClick={() => applyPreset(5, 10)}
            className="px-3.5 py-2 rounded border border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 font-mono text-xs uppercase tracking-wider transition-all"
          >
            🔴 Aggressive (5% / 10%)
          </button>
        </div>
      </div>

      {/* Main Grid Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* Left Column: Input Parameter Panel */}
        <div className="glass-panel p-6 rounded-xl border border-glass-border bg-slate-900/10 space-y-5 transition-all duration-200 hover:border-glass-border/50 animate-fadeInUp">
          <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
            <Calculator className="h-4.5 w-4.5 text-neon-green" />
            <span className="text-xs font-mono text-slate-300 font-bold uppercase">Binary Risk Parameters</span>
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
                  className="w-full bg-[#02050b] border border-glass-border pl-8 pr-4 py-2.5 rounded text-xs text-slate-200 focus:outline-none focus:border-neon-green/30 focus:glow-shadow-green transition-all duration-200"
                />
              </div>
            </div>

            {/* Risk Per Trade */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-[9px] text-slate-500 uppercase tracking-widest">Risk Per Trade (%)</label>
                <span className="text-slate-300 font-bold text-xs">{riskPercent}%</span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value))}
                  className="flex-1 accent-neon-green bg-slate-950 h-2 rounded-lg appearance-none cursor-pointer transition-all duration-150"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="10"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Math.max(0.5, Math.min(10, Number(e.target.value))))}
                  className="w-16 bg-[#02050b] border border-glass-border px-2 py-1.5 rounded text-center text-xs text-slate-200 focus:outline-none"
                />
              </div>
            </div>

            {/* Binary Payout */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-[9px] text-slate-500 uppercase tracking-widest">Binary Payout (%)</label>
                <span className="text-slate-300 font-bold text-xs">{payout}%</span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="50"
                  max="98"
                  step="1"
                  value={payout}
                  onChange={(e) => setPayout(Number(e.target.value))}
                  className="flex-1 accent-neon-green bg-slate-950 h-2 rounded-lg appearance-none cursor-pointer transition-all duration-150"
                />
                <input
                  type="number"
                  min="50"
                  max="98"
                  value={payout}
                  onChange={(e) => setPayout(Math.max(50, Math.min(98, Number(e.target.value))))}
                  className="w-16 bg-[#02050b] border border-glass-border px-2 py-1.5 rounded text-center text-xs text-slate-200 focus:outline-none"
                />
              </div>
            </div>

            {/* Max Consecutive Losses */}
            <div className="space-y-1.5">
              <label className="block text-[9px] text-slate-500 uppercase tracking-widest">Max Consecutive Losses Allowed</label>
              <select
                value={maxConsecutiveLosses}
                onChange={(e) => setMaxConsecutiveLosses(Number(e.target.value))}
                className="w-full bg-[#02050b] border border-glass-border px-3.5 py-2.5 rounded text-xs text-slate-200 focus:outline-none focus:border-neon-green/30"
              >
                <option value={3}>3 Losses</option>
                <option value={5}>5 Losses</option>
                <option value={7}>7 Losses</option>
                <option value={10}>10 Losses</option>
              </select>
            </div>

            {/* Daily Max Risk */}
            <div className="space-y-1.5">
              <label className="block text-[9px] text-slate-500 uppercase tracking-widest">Daily Maximum Risk (%)</label>
              <div className="relative">
                <span className="absolute right-3.5 top-2.5 text-slate-500">%</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={dailyMaxRisk}
                  onChange={(e) => setDailyMaxRisk(Math.max(1, Math.min(30, Number(e.target.value))))}
                  className="w-full bg-[#02050b] border border-glass-border px-3.5 py-2.5 rounded text-xs text-slate-200 focus:outline-none focus:border-neon-green/30"
                />
              </div>
            </div>

            {/* Planned Trades */}
            <div className="space-y-1.5">
              <label className="block text-[9px] text-slate-500 uppercase tracking-widest">Planned Trades Today</label>
              <input
                type="number"
                min="1"
                max="100"
                value={plannedTrades}
                onChange={(e) => setPlannedTrades(Math.max(1, Math.min(100, Number(e.target.value))))}
                className="w-full bg-[#02050b] border border-glass-border px-3.5 py-2.5 rounded text-xs text-slate-200 focus:outline-none focus:border-neon-green/30"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Sizing Results Card */}
        <div className="space-y-6">
          
          {/* Sizing Results Details */}
          <div className="glass-panel p-6 rounded-xl border border-glass-border bg-slate-900/10 space-y-6 transition-all duration-200 hover:border-glass-border/50 animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
              <Activity className="h-4.5 w-4.5 text-neon-green" />
              <span className="text-xs font-mono text-slate-300 font-bold uppercase">Risk Management Summary</span>
            </div>

            <div className="grid grid-cols-2 gap-4 font-mono">
              
              {/* Investment amount */}
              <div className="bg-[#020617]/50 border border-glass-border/40 p-4 rounded text-left transition-all duration-200 hover:border-neon-green/20 hover:shadow-lg">
                <div className="text-[8px] text-slate-500 uppercase">Investment Per Trade</div>
                <div className="text-lg font-bold text-slate-200 mt-1.5">${investment.toFixed(2)}</div>
              </div>

              {/* Max daily loss */}
              <div className="bg-[#020617]/50 border border-glass-border/40 p-4 rounded text-left">
                <div className="text-[8px] text-slate-500 uppercase">Maximum Daily Loss</div>
                <div className="text-lg font-bold text-rose-500 mt-1.5">${maxDailyLoss.toFixed(2)}</div>
              </div>

              {/* Max loss streak limit */}
              <div className="bg-[#020617]/50 border border-glass-border/40 p-4 rounded text-left">
                <div className="text-[8px] text-slate-500 uppercase">Max Loss Streak Before Stop</div>
                <div className="text-lg font-bold text-slate-200 mt-1.5">{maxLossStreakBeforeDailyStop} Trades</div>
              </div>

              {/* Expected profit */}
              <div className="bg-[#020617]/50 border border-glass-border/40 p-4 rounded text-left">
                <div className="text-[8px] text-slate-500 uppercase">Expected Profit Per Win</div>
                <div className="text-lg font-bold text-emerald-400 mt-1.5">+${expectedProfit.toFixed(2)}</div>
              </div>

              {/* Recovery Trades Required */}
              <div className="bg-[#020617]/50 border border-glass-border/40 p-4 rounded text-left col-span-2 space-y-1">
                <div className="text-[8px] text-slate-500 uppercase">Recovery Wins Required (To cover losses)</div>
                <div className="text-xs font-bold text-slate-300 mt-2 flex flex-col gap-1">
                  <div>• After 1 Loss: <span className="text-gold-vip font-mono font-bold">Need {recoveryWins1Loss} consecutive wins</span></div>
                  <div>• After 2 Losses: <span className="text-gold-vip font-mono font-bold">Need {recoveryWins2Loss} consecutive wins</span></div>
                </div>
              </div>

              {/* Recommended Daily Stop */}
              <div className="bg-[#020617]/50 border border-glass-border/40 p-4 rounded text-left col-span-2">
                <div className="text-[8px] text-slate-500 uppercase">Recommended Daily Stop Rule</div>
                <div className="text-xs font-bold text-slate-300 mt-2 leading-relaxed">
                  STOP TRADING after: <span className="text-rose-400">{maxConsecutiveLosses} consecutive losses</span> or <span className="text-rose-400">{dailyMaxRisk}% drawdown</span>, whichever comes first.
                </div>
              </div>

            </div>
          </div>

          {/* Risk Engine Status Card */}
          <div className={`p-5 rounded-xl border font-mono space-y-3 ${riskStatus.color}`}>
            <div className="flex justify-between items-center">
              <span className="text-[9px] uppercase tracking-widest font-bold">Risk Status Engine</span>
              <span className="text-xs font-bold font-mono uppercase">{riskStatus.dot} {riskStatus.level}</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-300 font-sans">
              {riskStatus.desc}
            </p>
          </div>

        </div>

      </div>

      {/* Grid: Win Rate & Session Survival */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Win Rate Requirement Card */}
        <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4">
          <div className="flex justify-between items-center border-b border-slate-900 pb-2.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Minimum Win Rate Required</span>
            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono uppercase font-bold">
              {minWinRate}%
            </span>
          </div>
          
          <div className="space-y-3 font-sans text-xs text-slate-400 leading-relaxed">
            <p>
              To maintain a positive expectancy at a **{payout}% payout**, your strategy must achieve a minimum profitable win rate of **{minWinRate}%** to break even.
            </p>
            {/* Visual indicator bar */}
            <div className="w-full bg-slate-950 border border-slate-900 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-emerald-400 h-full rounded-full transition-all" 
                style={{ width: `${minWinRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Session Survival Card */}
        <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4">
          <div className="flex justify-between items-center border-b border-slate-900 pb-2.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Session Survival Estimate</span>
            <span className="text-[9px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-mono uppercase font-bold">
              {survivalLosses} Losses
            </span>
          </div>
          <p className="text-xs font-sans text-slate-400 leading-relaxed">
            Based on your risk profile, your account balance of **${balance}** can survive **{survivalLosses} consecutive losses** in a single session before hitting your daily maximum risk threshold of **{dailyMaxRisk}% ($${maxDailyLoss.toFixed(2)})**.
          </p>
        </div>

      </div>

      {/* Money Management Rules Card */}
      <div className="glass-panel p-6 rounded-xl border border-glass-border space-y-4 bg-slate-900/5">
        <div className="flex items-center gap-2 border-b border-glass-border pb-3">
          <ShieldCheck className="h-4.5 w-4.5 text-gold-vip animate-pulse" />
          <h2 className="text-xs font-bold font-mono uppercase tracking-widest text-slate-200">
            Capital Protection Rules
          </h2>
        </div>

        <ul className="space-y-3 font-sans text-xs text-slate-400">
          {mmRules.map((rule, idx) => (
            <li key={idx} className="flex items-start gap-2.5">
              <span className="text-gold-vip text-xs shrink-0 mt-0.5">✓</span>
              <span className="leading-relaxed">{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Educational Guide Section */}
      <div className="space-y-6 pt-4 border-t border-glass-border/30">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-neon-green" />
          <h2 className="text-sm font-bold font-mono uppercase tracking-widest text-slate-200">
            Binary Trading Risk Guide
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-400 font-sans leading-relaxed">
          
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-2.5">
            <h3 className="font-bold text-slate-200 font-mono text-[11px] uppercase">1. Why Risking 1-2% is Safer</h3>
            <p>
              Professional binary options traders rarely risk more than 2% per trade. Sizing trade allocations at 1% of your balance shields you from normal market variance, meaning a streak of 5 losses only reduces your capital by 5%, making recovery fast and simple.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-2.5">
            <h3 className="font-bold text-slate-200 font-mono text-[11px] uppercase">2. Why Martingale is Dangerous</h3>
            <p>
              Martingale (doubling trade sizes after a loss to recover instantly) is a toxic strategy in binary options. At an 85% payout, doubling down 6 times turns a $10 trade into a $640 trade to make back a minor loss. A 6-loss streak completely wipes out standard account balances.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-2.5">
            <h3 className="font-bold text-slate-200 font-mono text-[11px] uppercase">3. Consistency Beats Sizing</h3>
            <p>
              Your edge in binary trading comes from statistical execution frequency, not single trade sizes. Focus entirely on trading setups where your win rate remains above your break-even threshold, letting compound interests expand your equity line organically.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-2.5">
            <h3 className="font-bold text-slate-200 font-mono text-[11px] uppercase">4. Professional Capital Protection</h3>
            <p>
              A true professional trader knows exactly when to close the trading terminal. By setting a strict daily loss threshold (drawdown) and consecutive loss caps, you protect your trading psychology from decay and shield your capital from revenge trading.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
