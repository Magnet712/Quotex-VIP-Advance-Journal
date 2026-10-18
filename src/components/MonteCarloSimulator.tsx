'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid 
} from 'recharts';
import { 
  Activity, Sparkles, RefreshCw, AlertTriangle, ShieldCheck, ShieldAlert, 
  TrendingUp, TrendingDown, DollarSign, Percent, BarChart3, ArrowRight, Zap, 
  Target, Flame, Layers
} from 'lucide-react';
import { getTrades } from '@/app/actions/trades';

interface MonteCarloProps {
  initialBalance?: number;
  initialRiskPercent?: number;
  initialPayout?: number;
}

interface SimulationSummary {
  ruinProbability: number; // % reaching 0 or < 1 trade size
  severeDrawdownProb: number; // % reaching 50% drawdown
  profitProbability: number; // % finishing above starting balance
  medianFinalBalance: number;
  p95FinalBalance: number;
  p05FinalBalance: number;
  avgMaxDrawdown: number;
  maxConsecutiveLossMedian: number;
  maxConsecutiveLossP95: number;
  streakOdds: { streak: number; probability: number }[];
  trajectory: { trade: number; p95: number; p75: number; p50: number; p25: number; p05: number }[];
}

export default function MonteCarloSimulator({
  initialBalance = 1000,
  initialRiskPercent = 2,
  initialPayout = 85,
}: MonteCarloProps) {
  // Inputs
  const [balance, setBalance] = useState<number>(initialBalance);
  const [winRate, setWinRate] = useState<number>(62);
  const [payout, setPayout] = useState<number>(initialPayout);
  const [riskPercent, setRiskPercent] = useState<number>(initialRiskPercent);
  const [tradeCount, setTradeCount] = useState<number>(100);
  const [stakingStrategy, setStakingStrategy] = useState<'fixed_percent' | 'fixed_amount' | 'martingale_1step'>('fixed_percent');
  const [fixedStakeAmount, setFixedStakeAmount] = useState<number>(20);
  
  // Loading & sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Sync actual win rate and payout from user's journal
  const handleSyncJournal = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await getTrades();
      if (res.success && res.trades && res.trades.length > 0) {
        const trades = res.trades;
        const validTrades = trades.filter((t: any) => t.results === 'WIN' || t.results === 'LOSS' || t.profit_loss !== 0);
        const wins = validTrades.filter((t: any) => t.results === 'WIN' || t.results === 'MTG WIN' || t.profit_loss > 0).length;
        const rate = validTrades.length > 0 ? Math.round((wins / validTrades.length) * 100) : 60;
        
        setWinRate(rate);
        setSyncStatus(`Synced: ${validTrades.length} trades (${rate}% Win Rate)`);
      } else {
        setSyncStatus('No journal trades logged yet. Using defaults.');
      }
    } catch {
      setSyncStatus('Failed to sync. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Run Monte Carlo simulation (1,500 iterations)
  const runSimulation = useCallback((): SimulationSummary => {
    const NUM_SIMS = 1500;
    const steps = 15; // Number of checkpoints along trade timeline for chart
    const checkpointInterval = Math.max(1, Math.floor(tradeCount / steps));

    const finalBalances: number[] = [];
    const maxDrawdowns: number[] = [];
    const maxLossStreaks: number[] = [];
    let ruinedCount = 0;
    let severeDrawdownCount = 0;
    let profitCount = 0;

    // Streaks tracking counts
    const streakHits: Record<number, number> = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 10: 0 };

    // Grid of trajectory trajectories[checkpointIndex] = array of balances across all sims
    const trajectoryCheckpoints: number[][] = Array.from({ length: steps + 1 }, () => []);

    for (let sim = 0; sim < NUM_SIMS; sim++) {
      let currentBal = balance;
      let peakBal = balance;
      let maxDD = 0;
      let currentLossStreak = 0;
      let simMaxLossStreak = 0;
      let isRuined = false;
      let isSevereDD = false;
      let lastOutcomeWasLoss = false;

      // Track streak thresholds hit in this sim
      const hitInThisSim: Record<number, boolean> = {};

      trajectoryCheckpoints[0].push(currentBal);

      for (let t = 1; t <= tradeCount; t++) {
        if (currentBal <= 1) {
          isRuined = true;
          currentBal = 0;
        }

        // Determine stake
        let stake = 0;
        if (!isRuined) {
          if (stakingStrategy === 'fixed_percent') {
            stake = Math.max(1, currentBal * (riskPercent / 100));
          } else if (stakingStrategy === 'fixed_amount') {
            stake = Math.min(currentBal, fixedStakeAmount);
          } else if (stakingStrategy === 'martingale_1step') {
            const baseStake = Math.max(1, currentBal * (riskPercent / 100));
            stake = lastOutcomeWasLoss ? Math.min(currentBal, baseStake * 2.2) : baseStake;
          }
        }

        // Trade outcome simulation
        if (!isRuined && stake > 0) {
          const isWin = Math.random() * 100 < winRate;
          if (isWin) {
            const profit = stake * (payout / 100);
            currentBal += profit;
            currentLossStreak = 0;
            lastOutcomeWasLoss = false;
          } else {
            currentBal -= stake;
            currentLossStreak++;
            lastOutcomeWasLoss = true;
            if (currentLossStreak > simMaxLossStreak) {
              simMaxLossStreak = currentLossStreak;
            }
            [3, 4, 5, 6, 7, 8, 10].forEach((stk) => {
              if (currentLossStreak >= stk && !hitInThisSim[stk]) {
                hitInThisSim[stk] = true;
              }
            });
          }
        }

        // Drawdown update
        if (currentBal > peakBal) {
          peakBal = currentBal;
        } else if (peakBal > 0) {
          const dd = ((peakBal - currentBal) / peakBal) * 100;
          if (dd > maxDD) maxDD = dd;
          if (dd >= 50) isSevereDD = true;
        }

        // Record checkpoints
        if (t % checkpointInterval === 0 || t === tradeCount) {
          const cpIdx = Math.min(steps, Math.floor(t / checkpointInterval));
          if (trajectoryCheckpoints[cpIdx]) {
            trajectoryCheckpoints[cpIdx].push(Math.round(currentBal));
          }
        }
      }

      if (currentBal <= 1) ruinedCount++;
      if (isSevereDD) severeDrawdownCount++;
      if (currentBal > balance) profitCount++;

      finalBalances.push(currentBal);
      maxDrawdowns.push(maxDD);
      maxLossStreaks.push(simMaxLossStreak);

      Object.keys(hitInThisSim).forEach((stkStr) => {
        const stk = Number(stkStr);
        streakHits[stk] = (streakHits[stk] || 0) + 1;
      });
    }

    // Sort for percentiles
    finalBalances.sort((a, b) => a - b);
    maxDrawdowns.sort((a, b) => a - b);
    maxLossStreaks.sort((a, b) => a - b);

    const getPercentile = (arr: number[], pct: number) => {
      const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((pct / 100) * arr.length)));
      return arr[idx];
    };

    // Calculate trajectory curve points
    const trajectory = trajectoryCheckpoints.map((balancesAtPoint, stepIdx) => {
      balancesAtPoint.sort((a, b) => a - b);
      const tradeNumber = Math.min(tradeCount, stepIdx * checkpointInterval);
      return {
        trade: tradeNumber,
        p95: Math.round(getPercentile(balancesAtPoint, 95)),
        p75: Math.round(getPercentile(balancesAtPoint, 75)),
        p50: Math.round(getPercentile(balancesAtPoint, 50)),
        p25: Math.round(getPercentile(balancesAtPoint, 25)),
        p05: Math.round(getPercentile(balancesAtPoint, 5)),
      };
    });

    const streakOdds = [3, 4, 5, 6, 7, 8, 10].map((streak) => ({
      streak,
      probability: Math.round(((streakHits[streak] || 0) / NUM_SIMS) * 100),
    }));

    return {
      ruinProbability: Number(((ruinedCount / NUM_SIMS) * 100).toFixed(1)),
      severeDrawdownProb: Number(((severeDrawdownCount / NUM_SIMS) * 100).toFixed(1)),
      profitProbability: Number(((profitCount / NUM_SIMS) * 100).toFixed(1)),
      medianFinalBalance: Math.round(getPercentile(finalBalances, 50)),
      p95FinalBalance: Math.round(getPercentile(finalBalances, 95)),
      p05FinalBalance: Math.round(getPercentile(finalBalances, 5)),
      avgMaxDrawdown: Math.round(maxDrawdowns.reduce((a, b) => a + b, 0) / maxDrawdowns.length),
      maxConsecutiveLossMedian: getPercentile(maxLossStreaks, 50),
      maxConsecutiveLossP95: getPercentile(maxLossStreaks, 95),
      streakOdds,
      trajectory,
    };
  }, [balance, winRate, payout, riskPercent, tradeCount, stakingStrategy, fixedStakeAmount]);

  const results = useMemo(() => runSimulation(), [runSimulation]);

  // Risk Rating badge & color
  const riskVerdict = useMemo(() => {
    if (results.ruinProbability > 25 || results.severeDrawdownProb > 60) {
      return {
        grade: 'CRITICAL HAZARD',
        color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
        badge: 'bg-rose-500 text-slate-950',
        message: 'Severe capital liquidation risk. Account failure is mathematically probable under normal variance.',
      };
    }
    if (results.ruinProbability > 5 || results.severeDrawdownProb > 25) {
      return {
        grade: 'HIGH VARIANCE',
        color: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
        badge: 'bg-amber-400 text-slate-950',
        message: 'Elevated drawdown vulnerability. Reduce stake sizing or eliminate Martingale to safeguard capital.',
      };
    }
    if (results.profitProbability >= 70 && results.ruinProbability <= 1) {
      return {
        grade: 'INSTITUTIONAL SAFE',
        color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
        badge: 'bg-emerald-400 text-slate-950',
        message: 'Robust positive mathematical expectancy with exceptional ruin defense. Optimal growth profile.',
      };
    }
    return {
      grade: 'MODERATE RISK',
      color: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
      badge: 'bg-sky-400 text-slate-950',
      message: 'Balanced parameter setup. Sustainable if strict daily session stop rules are enforced.',
    };
  }, [results]);

  // Quick preset handlers
  const applySetupPreset = (wr: number, risk: number, strat: 'fixed_percent' | 'fixed_amount' | 'martingale_1step') => {
    setWinRate(wr);
    setRiskPercent(risk);
    setStakingStrategy(strat);
  };

  return (
    <div className="space-y-8 animate-fadeIn text-left font-mono">
      {/* Header Banner */}
      <div className="glass-panel p-5 rounded-xl border border-glass-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/10">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-neon-green animate-pulse" />
            <span className="text-[10px] text-neon-green font-bold uppercase tracking-wider">
              1,500 Multi-Path Iterations
            </span>
          </div>
          <h2 className="text-xl font-bold font-mono tracking-tight text-slate-100 flex items-center gap-2">
            Monte Carlo Stress Simulator
          </h2>
          <p className="text-xs text-slate-400 font-sans leading-relaxed">
            Stress-test your binary trading edge against 1,500 randomized futures to calculate exact Risk of Ruin.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncJournal}
            disabled={isSyncing}
            className="px-4 py-2.5 rounded border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync My Journal'}</span>
          </button>
        </div>
      </div>

      {syncStatus && (
        <div className="text-[11px] px-3.5 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
          <span>{syncStatus}</span>
        </div>
      )}

      {/* Preset Strategy Buttons */}
      <div className="flex flex-wrap gap-2.5 items-center">
        <span className="text-[9px] text-slate-500 uppercase tracking-widest mr-1">Presets:</span>
        <button
          onClick={() => applySetupPreset(65, 1.5, 'fixed_percent')}
          className="px-3 py-1.5 rounded border border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-400 text-[10px] uppercase font-bold transition-all cursor-pointer"
        >
          🛡️ Institutional 1.5% Flat
        </button>
        <button
          onClick={() => applySetupPreset(60, 2.5, 'fixed_percent')}
          className="px-3 py-1.5 rounded border border-sky-500/25 bg-sky-500/5 hover:bg-sky-500/15 text-sky-400 text-[10px] uppercase font-bold transition-all cursor-pointer"
        >
          ⚖️ Balanced 2.5% Growth
        </button>
        <button
          onClick={() => applySetupPreset(55, 2.0, 'martingale_1step')}
          className="px-3 py-1.5 rounded border border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 text-[10px] uppercase font-bold transition-all cursor-pointer"
        >
          ⚠️ 1-Step Martingale Stress Test
        </button>
      </div>

      {/* Main Grid: Parameters vs Core KPI Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Parameter Inputs (5 Cols) */}
        <div className="lg:col-span-5 glass-panel p-5 rounded-xl border border-glass-border space-y-4 bg-slate-900/10">
          <div className="flex items-center justify-between border-b border-glass-border/40 pb-3">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Zap className="h-4 w-4 text-neon-green" /> Simulation Parameters
            </span>
            <span className="text-[9px] text-slate-500">N={tradeCount} Trades</span>
          </div>

          {/* Capital Balance */}
          <div className="space-y-1">
            <label className="text-[9px] text-slate-400 uppercase tracking-widest flex justify-between">
              <span>Starting Balance ($)</span>
              <span className="text-slate-200 font-bold">${balance.toLocaleString()}</span>
            </label>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(Math.max(10, Number(e.target.value)))}
              className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-xs text-slate-200 focus:outline-none focus:border-neon-green/40"
            />
          </div>

          {/* Win Rate Slider */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[9px] uppercase tracking-widest">
              <span className="text-slate-400">Expected Win Rate (%)</span>
              <span className={`font-bold text-xs ${winRate >= 58 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {winRate}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="45"
                max="85"
                step="1"
                value={winRate}
                onChange={(e) => setWinRate(Number(e.target.value))}
                className="flex-1 accent-neon-green bg-slate-950 h-2 rounded appearance-none cursor-pointer"
              />
              <span className="text-xs text-slate-400 w-10 text-right">{winRate}%</span>
            </div>
          </div>

          {/* Broker Payout */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[9px] uppercase tracking-widest">
              <span className="text-slate-400">Broker Payout Rate (%)</span>
              <span className="text-slate-200 font-bold text-xs">{payout}%</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="70"
                max="95"
                step="1"
                value={payout}
                onChange={(e) => setPayout(Number(e.target.value))}
                className="flex-1 accent-neon-green bg-slate-950 h-2 rounded appearance-none cursor-pointer"
              />
              <span className="text-xs text-slate-400 w-10 text-right">{payout}%</span>
            </div>
          </div>

          {/* Staking Method */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[9px] text-slate-400 uppercase tracking-widest block">
              Money Management Strategy
            </label>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <button
                onClick={() => setStakingStrategy('fixed_percent')}
                className={`py-2 px-1 rounded border text-center font-bold uppercase transition-all cursor-pointer ${
                  stakingStrategy === 'fixed_percent'
                    ? 'border-neon-green/50 bg-neon-green/15 text-neon-green'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                Fixed %
              </button>
              <button
                onClick={() => setStakingStrategy('fixed_amount')}
                className={`py-2 px-1 rounded border text-center font-bold uppercase transition-all cursor-pointer ${
                  stakingStrategy === 'fixed_amount'
                    ? 'border-neon-green/50 bg-neon-green/15 text-neon-green'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                Flat $
              </button>
              <button
                onClick={() => setStakingStrategy('martingale_1step')}
                className={`py-2 px-1 rounded border text-center font-bold uppercase transition-all cursor-pointer ${
                  stakingStrategy === 'martingale_1step'
                    ? 'border-rose-500/50 bg-rose-500/15 text-rose-300'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                1-Step MTG
              </button>
            </div>
          </div>

          {/* Stake Input based on Strategy */}
          {stakingStrategy !== 'fixed_amount' ? (
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[9px] uppercase tracking-widest">
                <span className="text-slate-400">Risk Per Trade (%)</span>
                <span className="text-slate-200 font-bold text-xs">{riskPercent}%</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0.5"
                  max="8"
                  step="0.5"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value))}
                  className="flex-1 accent-neon-green bg-slate-950 h-2 rounded appearance-none cursor-pointer"
                />
                <span className="text-xs text-slate-400 w-10 text-right">{riskPercent}%</span>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[9px] uppercase tracking-widest">
                <span className="text-slate-400">Flat Amount Per Trade ($)</span>
                <span className="text-slate-200 font-bold text-xs">${fixedStakeAmount}</span>
              </div>
              <input
                type="number"
                value={fixedStakeAmount}
                onChange={(e) => setFixedStakeAmount(Math.max(1, Number(e.target.value)))}
                className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-xs text-slate-200 focus:outline-none focus:border-neon-green/40"
              />
            </div>
          )}

          {/* Trade Horizon */}
          <div className="space-y-1 pt-1">
            <div className="flex justify-between items-center text-[9px] uppercase tracking-widest">
              <span className="text-slate-400">Horizon Trade Count</span>
              <span className="text-purple-300 font-bold text-xs">{tradeCount} Trades</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[50, 100, 250].map((count) => (
                <button
                  key={count}
                  onClick={() => setTradeCount(count)}
                  className={`py-1.5 rounded border text-[10px] font-bold uppercase transition-all cursor-pointer ${
                    tradeCount === count
                      ? 'border-purple-500/50 bg-purple-500/20 text-purple-200'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {count} Trades
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Key Stress Metrics & Ruin Engine (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Top 3 High-Impact Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Risk of Ruin */}
            <div className={`p-4 rounded-xl border flex flex-col justify-between ${
              results.ruinProbability <= 1 
                ? 'border-emerald-500/30 bg-emerald-500/5' 
                : results.ruinProbability <= 10 
                ? 'border-amber-500/30 bg-amber-500/5' 
                : 'border-rose-500/30 bg-rose-500/10'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Risk of Ruin</span>
                <ShieldAlert className={`h-4 w-4 ${
                  results.ruinProbability <= 1 ? 'text-emerald-400' : 'text-rose-400'
                }`} />
              </div>
              <div className="mt-3">
                <div className={`text-2xl font-extrabold font-mono ${
                  results.ruinProbability <= 1 ? 'text-emerald-400' : results.ruinProbability <= 10 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {results.ruinProbability}%
                </div>
                <div className="text-[9px] text-slate-500 mt-1 uppercase">Odds of account total bust</div>
              </div>
            </div>

            {/* Profit Probability */}
            <div className="p-4 rounded-xl border border-glass-border bg-slate-900/10 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Profit Probability</span>
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold font-mono text-emerald-400">
                  {results.profitProbability}%
                </div>
                <div className="text-[9px] text-slate-500 mt-1 uppercase">Ends above starting capital</div>
              </div>
            </div>

            {/* Severe Drawdown (>50%) */}
            <div className="p-4 rounded-xl border border-glass-border bg-slate-900/10 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">50% Drawdown Risk</span>
                <Flame className={`h-4 w-4 ${results.severeDrawdownProb > 25 ? 'text-rose-400' : 'text-amber-400'}`} />
              </div>
              <div className="mt-3">
                <div className={`text-2xl font-extrabold font-mono ${
                  results.severeDrawdownProb <= 10 ? 'text-emerald-400' : results.severeDrawdownProb <= 30 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {results.severeDrawdownProb}%
                </div>
                <div className="text-[9px] text-slate-500 mt-1 uppercase">Chance of half-capital loss</div>
              </div>
            </div>

          </div>

          {/* AI Risk Engine Verdict Banner */}
          <div className={`p-4 rounded-xl border ${riskVerdict.color} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-[9px] px-2 py-0.5 rounded font-extrabold font-mono tracking-wider ${riskVerdict.badge}`}>
                  {riskVerdict.grade}
                </span>
                <span className="text-xs font-bold text-slate-200 font-mono">Statistical Edge Verdict</span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                {riskVerdict.message}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[9px] text-slate-500 uppercase block font-mono">Expected Max DD</span>
              <span className="text-sm font-bold text-amber-300 font-mono">~{results.avgMaxDrawdown}%</span>
            </div>
          </div>

          {/* Percentile Balance Projections */}
          <div className="glass-panel p-4 rounded-xl border border-glass-border grid grid-cols-3 gap-3 text-center bg-slate-900/10">
            <div>
              <span className="text-[8px] text-slate-500 uppercase font-mono block">Worst 5% (Bearish)</span>
              <span className="text-sm font-bold font-mono text-rose-400 mt-1 block">
                ${results.p05FinalBalance.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-[8px] text-slate-500 uppercase font-mono block">Median 50% (Expected)</span>
              <span className="text-sm font-bold font-mono text-emerald-400 mt-1 block">
                ${results.medianFinalBalance.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-[8px] text-slate-500 uppercase font-mono block">Best 5% (Bullish)</span>
              <span className="text-sm font-bold font-mono text-neon-green mt-1 block">
                ${results.p95FinalBalance.toLocaleString()}
              </span>
            </div>
          </div>

        </div>

      </div>

      {/* Trajectory Cone Visual Chart */}
      <div className="glass-panel p-6 rounded-xl border border-glass-border space-y-4 bg-slate-900/10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-glass-border/40 pb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-neon-green" /> Simulated Equity Cone (1,500 Paths)
            </h3>
            <span className="text-[9px] text-slate-500">Distribution of equity across {tradeCount} future trades</span>
          </div>
          <div className="flex items-center gap-4 text-[9px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Best 5% (P95)</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-neon-green" /> Median (P50)</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" /> Worst 5% (P05)</span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={results.trajectory} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="coneGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
              <XAxis dataKey="trade" stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'Trades', position: 'insideBottomRight', offset: -5, fill: '#64748b', fontSize: 9 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(val) => `$${val}`} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#02050b]/95 border border-glass-border p-3 rounded-lg shadow-2xl font-mono text-xs space-y-1">
                        <div className="text-[10px] text-slate-400 border-b border-glass-border/40 pb-1">
                          After {data.trade} Trades
                        </div>
                        <div className="text-emerald-400 font-bold">Top 5% (P95): ${data.p95.toLocaleString()}</div>
                        <div className="text-neon-green font-bold">Median (P50): ${data.p50.toLocaleString()}</div>
                        <div className="text-rose-400 font-bold">Worst 5% (P05): ${data.p05.toLocaleString()}</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area type="monotone" dataKey="p95" stroke="#10b981" strokeWidth={1.5} fill="url(#coneGradient)" />
              <Area type="monotone" dataKey="p50" stroke="#00ff88" strokeWidth={2} fill="transparent" />
              <Area type="monotone" dataKey="p05" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4 4" fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Losing Streak Probability Histogram */}
      <div className="glass-panel p-6 rounded-xl border border-glass-border space-y-4 bg-slate-900/10">
        <div className="flex justify-between items-center border-b border-glass-border/40 pb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-400" /> Consecutive Loss Odds (In {tradeCount} Trades)
            </h3>
            <span className="text-[9px] text-slate-500">Normal statistical likelihood of hitting consecutive losing streaks</span>
          </div>
          <span className="text-[10px] text-amber-300 font-bold">
            Expected Max Streak: {results.maxConsecutiveLossMedian} losses
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {results.streakOdds.map((item) => (
            <div
              key={item.streak}
              className={`p-3 rounded-lg border text-center transition-all ${
                item.probability > 70
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                  : item.probability > 30
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300'
              }`}
            >
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                {item.streak} In A Row
              </div>
              <div className="text-lg font-extrabold font-mono mt-1">
                {item.probability}%
              </div>
              <div className="text-[8px] text-slate-500 uppercase mt-0.5">Likelihood</div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed font-sans pt-1">
          💡 **Trading Insight:** Even with a profitable {winRate}% win rate, you have a{' '}
          <strong className="text-amber-300">
            {results.streakOdds.find((s) => s.streak === 5)?.probability || 0}% chance
          </strong>{' '}
          of hitting 5 consecutive losses over {tradeCount} trades. Never double your stake during streaks.
        </p>
      </div>
    </div>
  );
}
