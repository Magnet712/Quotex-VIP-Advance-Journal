'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getTrades } from '@/app/actions/trades';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';
import { 
  Layers, Plus, Loader, Lightbulb, AlertTriangle, 
  TrendingUp, TrendingDown 
} from 'lucide-react';

interface BreakdownRowProps {
  label: string;
  sublabel?: string;
  pl: number;
  tradeCount: number;
  winRate: number;
  maxAbsPL: number;
}

function BreakdownRow({ label, sublabel, pl, tradeCount, winRate, maxAbsPL }: BreakdownRowProps) {
  const isPositive = pl >= 0;
  // Calculate relative bar width (clamped between 3% and 100%)
  const percentage = maxAbsPL > 0 ? Math.max(3, Math.min(100, Math.round((Math.abs(pl) / maxAbsPL) * 100))) : 3;

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-900/60 last:border-0 hover:bg-white/[0.02] px-2 rounded transition-colors group">
      {/* Label / Name */}
      <div className="w-[120px] sm:w-[140px] truncate shrink-0">
        <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors block truncate">
          {label}
        </span>
        {sublabel && (
          <span className="text-[10px] text-slate-500 font-mono block truncate">
            {sublabel}
          </span>
        )}
      </div>

      {/* Horizontal Bar Visual (Relative length) */}
      <div className="flex-1 px-3 flex items-center justify-center">
        <div className="w-full bg-slate-900/80 rounded-full h-1.5 overflow-hidden flex items-center">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isPositive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* P&L and Trade Stats */}
      <div className="flex items-center gap-3 shrink-0 text-right min-w-[130px] sm:min-w-[150px] justify-end">
        <span className={`text-xs font-mono font-bold ${
          isPositive ? 'text-emerald-400' : 'text-rose-400'
        }`}>
          {isPositive ? '+' : ''}${pl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-[10px] font-mono text-slate-400">
          {tradeCount}t · {winRate}%
        </span>
      </div>
    </div>
  );
}

export default function BreakdownPage() {
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<any[]>([]);
  const [userAccess, setUserAccess] = useState<any>({
    vipAccess: false,
    premiumAccess: false,
    status: 'pending'
  });

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [tradesRes, accessRes] = await Promise.all([
          getTrades(),
          getUserAccessState()
        ]);
        if (cancelled) return;
        if (tradesRes.success && tradesRes.trades) {
          setTrades(tradesRes.trades);
        }
        if (accessRes.success) {
          setUserAccess({
            vipAccess: accessRes.vipAccess,
            premiumAccess: accessRes.premiumAccess,
            status: accessRes.status
          });
        }
      } catch (err) {
        console.error('Failed to load breakdown data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const isTradeWin = (t: any) => {
    return Number(t.profit_loss) > 0 || t.results === 'Win' || t.results === 'MTG Win' || t.results === 'WIN' || t.results === 'MTG WIN';
  };

  // --- CALCULATIONS ---
  const breakdownStats = useMemo(() => {
    if (trades.length === 0) return null;

    // Helper aggregator
    const aggregate = (keyFn: (t: any) => string) => {
      const map: Record<string, { pl: number; count: number; wins: number; key: string }> = {};
      trades.forEach((t) => {
        const key = keyFn(t);
        if (!map[key]) map[key] = { pl: 0, count: 0, wins: 0, key };
        map[key].count += 1;
        map[key].pl += Number(t.profit_loss || 0);
        if (isTradeWin(t)) map[key].wins += 1;
      });
      return Object.values(map).map((item) => ({
        ...item,
        winRate: item.count > 0 ? Math.round((item.wins / item.count) * 100) : 0,
        pl: Number(item.pl.toFixed(2))
      }));
    };

    // 1. Day of Week
    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayMap = aggregate((t) => {
      const dayIndex = new Date(t.trade_date).getDay();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return dayNames[dayIndex];
    });
    const dayRows = daysOrder.map((dayName) => {
      const found = dayMap.find((d) => d.key === dayName);
      return found || { key: dayName, pl: 0, count: 0, wins: 0, winRate: 0 };
    });

    // 2. Time of Day (4-hour session blocks)
    const timeBlocks = ['00-04', '04-08', '08-12', '12-16', '16-20', '20-24'];
    const timeMap = aggregate((t) => {
      const hour = new Date(t.trade_date).getHours();
      if (hour >= 0 && hour < 4) return '00-04';
      if (hour >= 4 && hour < 8) return '04-08';
      if (hour >= 8 && hour < 12) return '08-12';
      if (hour >= 12 && hour < 16) return '12-16';
      if (hour >= 16 && hour < 20) return '16-20';
      return '20-24';
    });
    const timeRows = timeBlocks.map((block) => {
      const found = timeMap.find((item) => item.key === block);
      return found || { key: block, pl: 0, count: 0, wins: 0, winRate: 0 };
    });

    // 3. Strategy
    const strategyMap = aggregate((t) => t.strategy || 'Price Action');
    const strategyRows = strategyMap.sort((a, b) => b.pl - a.pl);

    // 4. Symbol / Asset
    const symbolMap = aggregate((t) => t.asset || 'EUR/USD');
    const symbolRows = symbolMap.sort((a, b) => b.pl - a.pl);

    // 5. Side / Direction
    const sideMap = aggregate((t) => {
      const dir = (t.direction || 'CALL').toUpperCase();
      if (dir.includes('CALL') || dir.includes('BUY') || dir.includes('LONG')) return 'CALL (Long)';
      if (dir.includes('PUT') || dir.includes('SELL') || dir.includes('SHORT')) return 'PUT (Short)';
      return 'CALL (Long)';
    });
    const sideRows = ['CALL (Long)', 'PUT (Short)'].map((s) => {
      const found = sideMap.find((item) => item.key === s);
      return found || { key: s, pl: 0, count: 0, wins: 0, winRate: 0 };
    });

    // 6. Position Size Quartiles
    const amounts = trades.map((t) => Number(t.investment_amount || t.amount || 0)).filter((a) => a > 0).sort((a, b) => a - b);
    let q1Limit = 5, q2Limit = 15, q3Limit = 50;
    if (amounts.length >= 4) {
      q1Limit = amounts[Math.floor(amounts.length * 0.25)];
      q2Limit = amounts[Math.floor(amounts.length * 0.50)];
      q3Limit = amounts[Math.floor(amounts.length * 0.75)];
    }
    const sizeMap = aggregate((t) => {
      const amt = Number(t.investment_amount || t.amount || 0);
      if (amt <= q1Limit) return 'Q1 (smallest)';
      if (amt <= q2Limit) return 'Q2';
      if (amt <= q3Limit) return 'Q3';
      return 'Q4 (largest)';
    });
    const sizeOrder = ['Q1 (smallest)', 'Q2', 'Q3', 'Q4 (largest)'];
    const sizeRows = sizeOrder.map((s) => {
      const found = sizeMap.find((item) => item.key === s);
      return found || { key: s, pl: 0, count: 0, wins: 0, winRate: 0 };
    });

    // 7. Psychology / Emotional State
    const emotionMap = aggregate((t) => (t.emotional_state || t.emotion || 'Calm').trim());
    const emotionRows = emotionMap.sort((a, b) => b.pl - a.pl);

    // 8. Trade Setup Quality / Execution Grade
    const qualityMap = aggregate((t) => (t.execution_grade || t.trade_quality || 'Clean').trim());
    const qualityRows = qualityMap.sort((a, b) => b.pl - a.pl);

    // 9. Risk % Tier
    const riskMap = aggregate((t) => {
      const pct = Number(t.percentage || t.risk_percentage || 0);
      if (pct <= 0) return 'Standard Risk';
      if (pct <= 1) return 'Conservative (≤ 1%)';
      if (pct <= 3) return 'Moderate (1.1% - 3%)';
      if (pct <= 5) return 'Aggressive (3.1% - 5%)';
      return 'High Risk (> 5%)';
    });
    const riskRows = riskMap.sort((a, b) => b.pl - a.pl);

    // --- TOP INSIGHT CALLOUTS ---
    // Weakest Day
    const activeDays = dayRows.filter((d) => d.count > 0);
    const worstDay = [...activeDays].sort((a, b) => a.pl - b.pl)[0];

    // Best Market / Asset
    const bestAsset = [...symbolRows].filter((s) => s.count > 0)[0];
    const worstAsset = [...symbolRows].filter((s) => s.count > 0).sort((a, b) => a.pl - b.pl)[0];

    // Weakest Strategy or Side
    const activeStrategies = strategyRows.filter((s) => s.count > 0);
    const worstStrategy = [...activeStrategies].sort((a, b) => a.pl - b.pl)[0];

    return {
      dayRows,
      timeRows,
      strategyRows,
      symbolRows,
      sideRows,
      sizeRows,
      emotionRows,
      qualityRows,
      riskRows,
      worstDay,
      bestAsset,
      worstAsset,
      worstStrategy
    };
  }, [trades]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">
          ANALYZING TRADE ATTRIBUTION...
        </span>
      </div>
    );
  }

  // --- ACCESS CONTROL GATE ---
  const profile = {
    vip_access: userAccess.vipAccess,
    premium_access: userAccess.premiumAccess,
    status: userAccess.status
  };

  if (!canAccess('journal', profile)) {
    return <LockedFeature feature="breakdown" />;
  }

  if (trades.length === 0 || !breakdownStats) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-6 pt-16 animate-fadeInUp">
        <div className="inline-flex p-3 rounded-full bg-slate-900 border border-glass-border text-slate-500 mb-2">
          <Layers className="h-8 w-8 text-slate-500" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold font-mono text-slate-200">
          NO TRANSACTIONS LOGGED IN DATABASE
        </h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          Your trading ledger is currently empty. To see where your P&L comes from across all 9 dimensions, please record trades in the journal.
        </p>
        <div className="pt-2">
          <Link
            href="/dashboard/journal"
            className="inline-flex items-center gap-1.5 px-5 py-3 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-xs font-mono tracking-wider uppercase transition-colors glow-button hover:scale-105 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>Open Journal & Add Trades</span>
          </Link>
        </div>
      </div>
    );
  }

  // Max ABS helpers for relative bar scaling per card
  const maxDayAbs = Math.max(...breakdownStats.dayRows.map((r) => Math.abs(r.pl)), 1);
  const maxTimeAbs = Math.max(...breakdownStats.timeRows.map((r) => Math.abs(r.pl)), 1);
  const maxStratAbs = Math.max(...breakdownStats.strategyRows.map((r) => Math.abs(r.pl)), 1);
  const maxSymbolAbs = Math.max(...breakdownStats.symbolRows.map((r) => Math.abs(r.pl)), 1);
  const maxSideAbs = Math.max(...breakdownStats.sideRows.map((r) => Math.abs(r.pl)), 1);
  const maxSizeAbs = Math.max(...breakdownStats.sizeRows.map((r) => Math.abs(r.pl)), 1);
  const maxEmotionAbs = Math.max(...breakdownStats.emotionRows.map((r) => Math.abs(r.pl)), 1);
  const maxQualityAbs = Math.max(...breakdownStats.qualityRows.map((r) => Math.abs(r.pl)), 1);
  const maxRiskAbs = Math.max(...breakdownStats.riskRows.map((r) => Math.abs(r.pl)), 1);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-sans tracking-tight text-white">Breakdown</h1>
        <p className="text-xs sm:text-sm text-slate-400 font-sans mt-1">
          Where your P&L comes from.
        </p>
      </div>

      {/* Top Insight Callouts (Executive Takeaways Strip) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Weakest Day */}
        <div className="glass-panel p-3.5 rounded-xl border border-glass-border/60 bg-[#060b13]/80 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
            <Lightbulb className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] font-sans font-medium text-slate-300 block leading-tight">
              {breakdownStats.worstDay && breakdownStats.worstDay.pl < 0 ? (
                <>You lose most on <strong className="text-rose-400 font-semibold">{breakdownStats.worstDay.key}s</strong>: ${Math.abs(breakdownStats.worstDay.pl).toFixed(2)} across {breakdownStats.worstDay.count} trades.</>
              ) : (
                <>Consistent performance across all trading days.</>
              )}
            </span>
          </div>
        </div>

        {/* 2. Best Asset */}
        <div className="glass-panel p-3.5 rounded-xl border border-glass-border/60 bg-[#060b13]/80 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0 mt-0.5">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] font-sans font-medium text-slate-300 block leading-tight">
              {breakdownStats.bestAsset && breakdownStats.bestAsset.pl > 0 ? (
                <><strong className="text-emerald-400 font-semibold">{breakdownStats.bestAsset.key}</strong> is your best market: +${breakdownStats.bestAsset.pl.toFixed(2)} over {breakdownStats.bestAsset.count} trades.</>
              ) : (
                <>Log more asset trades to identify top market.</>
              )}
            </span>
          </div>
        </div>

        {/* 3. Worst Asset */}
        <div className="glass-panel p-3.5 rounded-xl border border-glass-border/60 bg-[#060b13]/80 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 shrink-0 mt-0.5">
            <TrendingDown className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] font-sans font-medium text-slate-300 block leading-tight">
              {breakdownStats.worstAsset && breakdownStats.worstAsset.pl < 0 ? (
                <><strong className="text-rose-400 font-semibold">{breakdownStats.worstAsset.key}</strong> costs you the most: -${Math.abs(breakdownStats.worstAsset.pl).toFixed(2)} over {breakdownStats.worstAsset.count} trades.</>
              ) : (
                <>No heavy drawdown asset identified.</>
              )}
            </span>
          </div>
        </div>

        {/* 4. Strategy / Setup Weakness */}
        <div className="glass-panel p-3.5 rounded-xl border border-glass-border/60 bg-[#060b13]/80 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 shrink-0 mt-0.5">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] font-sans font-medium text-slate-300 block leading-tight">
              {breakdownStats.worstStrategy && breakdownStats.worstStrategy.pl < 0 ? (
                <><strong className="text-amber-400 font-semibold">{breakdownStats.worstStrategy.key}</strong> setup is your weak spot (-${Math.abs(breakdownStats.worstStrategy.pl).toFixed(2)}).</>
              ) : (
                <>All current setups maintain positive return.</>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* 9 Core Breakdown Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
        {/* Card 1: Day of week */}
        <div className="glass-panel p-5 rounded-2xl border border-glass-border/70 bg-[#060b13]/85 space-y-4 hover:border-glass-border transition-all">
          <div>
            <h2 className="text-sm font-bold font-sans text-slate-100">Day of week</h2>
            <p className="text-[10px] font-sans text-slate-500">Net P&L by closing day</p>
          </div>
          <div className="space-y-1">
            {breakdownStats.dayRows.map((row) => (
              <BreakdownRow
                key={row.key}
                label={row.key}
                pl={row.pl}
                tradeCount={row.count}
                winRate={row.winRate}
                maxAbsPL={maxDayAbs}
              />
            ))}
          </div>
        </div>

        {/* Card 2: Time of day */}
        <div className="glass-panel p-5 rounded-2xl border border-glass-border/70 bg-[#060b13]/85 space-y-4 hover:border-glass-border transition-all">
          <div>
            <h2 className="text-sm font-bold font-sans text-slate-100">Time of day</h2>
            <p className="text-[10px] font-sans text-slate-500">Net P&L by entry hour</p>
          </div>
          <div className="space-y-1">
            {breakdownStats.timeRows.map((row) => (
              <BreakdownRow
                key={row.key}
                label={row.key}
                pl={row.pl}
                tradeCount={row.count}
                winRate={row.winRate}
                maxAbsPL={maxTimeAbs}
              />
            ))}
          </div>
        </div>

        {/* Card 3: Strategy */}
        <div className="glass-panel p-5 rounded-2xl border border-glass-border/70 bg-[#060b13]/85 space-y-4 hover:border-glass-border transition-all">
          <div>
            <h2 className="text-sm font-bold font-sans text-slate-100">Strategy</h2>
            <p className="text-[10px] font-sans text-slate-500">Net P&L by setup strategy</p>
          </div>
          <div className="space-y-1">
            {breakdownStats.strategyRows.length > 0 ? (
              breakdownStats.strategyRows.slice(0, 7).map((row) => (
                <BreakdownRow
                  key={row.key}
                  label={row.key}
                  pl={row.pl}
                  tradeCount={row.count}
                  winRate={row.winRate}
                  maxAbsPL={maxStratAbs}
                />
              ))
            ) : (
              <span className="text-xs text-slate-500 py-4 block text-center">No strategy data logged</span>
            )}
          </div>
        </div>

        {/* Card 4: Symbol */}
        <div className="glass-panel p-5 rounded-2xl border border-glass-border/70 bg-[#060b13]/85 space-y-4 hover:border-glass-border transition-all">
          <div>
            <h2 className="text-sm font-bold font-sans text-slate-100">Symbol</h2>
            <p className="text-[10px] font-sans text-slate-500">Ranked by impact</p>
          </div>
          <div className="space-y-1">
            {breakdownStats.symbolRows.length > 0 ? (
              breakdownStats.symbolRows.slice(0, 7).map((row) => (
                <BreakdownRow
                  key={row.key}
                  label={row.key}
                  pl={row.pl}
                  tradeCount={row.count}
                  winRate={row.winRate}
                  maxAbsPL={maxSymbolAbs}
                />
              ))
            ) : (
              <span className="text-xs text-slate-500 py-4 block text-center">No asset data logged</span>
            )}
          </div>
        </div>

        {/* Card 5: Side */}
        <div className="glass-panel p-5 rounded-2xl border border-glass-border/70 bg-[#060b13]/85 space-y-4 hover:border-glass-border transition-all">
          <div>
            <h2 className="text-sm font-bold font-sans text-slate-100">Side</h2>
            <p className="text-[10px] font-sans text-slate-500">CALL vs PUT</p>
          </div>
          <div className="space-y-1">
            {breakdownStats.sideRows.map((row) => (
              <BreakdownRow
                key={row.key}
                label={row.key}
                pl={row.pl}
                tradeCount={row.count}
                winRate={row.winRate}
                maxAbsPL={maxSideAbs}
              />
            ))}
          </div>
        </div>

        {/* Card 6: Position size */}
        <div className="glass-panel p-5 rounded-2xl border border-glass-border/70 bg-[#060b13]/85 space-y-4 hover:border-glass-border transition-all">
          <div>
            <h2 className="text-sm font-bold font-sans text-slate-100">Position size</h2>
            <p className="text-[10px] font-sans text-slate-500">Notional size quartiles</p>
          </div>
          <div className="space-y-1">
            {breakdownStats.sizeRows.map((row) => (
              <BreakdownRow
                key={row.key}
                label={row.key}
                pl={row.pl}
                tradeCount={row.count}
                winRate={row.winRate}
                maxAbsPL={maxSizeAbs}
              />
            ))}
          </div>
        </div>

        {/* Card 7: Psychology (Emotional State) */}
        <div className="glass-panel p-5 rounded-2xl border border-glass-border/70 bg-[#060b13]/85 space-y-4 hover:border-glass-border transition-all">
          <div>
            <h2 className="text-sm font-bold font-sans text-slate-100">Psychology & Emotion</h2>
            <p className="text-[10px] font-sans text-slate-500">Net P&L by mental state</p>
          </div>
          <div className="space-y-1">
            {breakdownStats.emotionRows.length > 0 ? (
              breakdownStats.emotionRows.slice(0, 7).map((row) => (
                <BreakdownRow
                  key={row.key}
                  label={row.key}
                  pl={row.pl}
                  tradeCount={row.count}
                  winRate={row.winRate}
                  maxAbsPL={maxEmotionAbs}
                />
              ))
            ) : (
              <span className="text-xs text-slate-500 py-4 block text-center">No psychology data logged</span>
            )}
          </div>
        </div>

        {/* Card 8: Setup Quality */}
        <div className="glass-panel p-5 rounded-2xl border border-glass-border/70 bg-[#060b13]/85 space-y-4 hover:border-glass-border transition-all">
          <div>
            <h2 className="text-sm font-bold font-sans text-slate-100">Setup Quality & Execution</h2>
            <p className="text-[10px] font-sans text-slate-500">Net P&L by execution grade</p>
          </div>
          <div className="space-y-1">
            {breakdownStats.qualityRows.length > 0 ? (
              breakdownStats.qualityRows.slice(0, 7).map((row) => (
                <BreakdownRow
                  key={row.key}
                  label={row.key}
                  pl={row.pl}
                  tradeCount={row.count}
                  winRate={row.winRate}
                  maxAbsPL={maxQualityAbs}
                />
              ))
            ) : (
              <span className="text-xs text-slate-500 py-4 block text-center">No execution quality data logged</span>
            )}
          </div>
        </div>

        {/* Card 9: Risk % Tier */}
        <div className="glass-panel p-5 rounded-2xl border border-glass-border/70 bg-[#060b13]/85 space-y-4 hover:border-glass-border transition-all">
          <div>
            <h2 className="text-sm font-bold font-sans text-slate-100">Risk % Exposure</h2>
            <p className="text-[10px] font-sans text-slate-500">Net P&L by account risk tier</p>
          </div>
          <div className="space-y-1">
            {breakdownStats.riskRows.map((row) => (
              <BreakdownRow
                key={row.key}
                label={row.key}
                pl={row.pl}
                tradeCount={row.count}
                winRate={row.winRate}
                maxAbsPL={maxRiskAbs}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
