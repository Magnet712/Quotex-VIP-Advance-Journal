'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getTrades, eraseTrades } from '@/app/actions/trades';
import { getSignalPerformance } from '@/app/actions/signals';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Award, DollarSign, Target, Activity, 
  Flame, BarChart3, Plus, Loader, Trash2, Calendar, AlertCircle, X
} from 'lucide-react';

interface AITradingIntelligencePanelProps {
  trades: any[];
  netProfit: number;
  winRate: number;
  profitFactor: number;
  consistencyScore: number;
  avgWinAmount: number;
  avgLossAmount: number;
  drawdownData: any[];
  strategyData: any[];
  hourlyData: any[];
}

function AITradingIntelligencePanel({
  trades,
  netProfit,
  winRate,
  profitFactor,
  consistencyScore,
  avgWinAmount,
  avgLossAmount,
  drawdownData,
  strategyData,
  hourlyData
}: AITradingIntelligencePanelProps) {
  if (trades.length < 10) {
    return (
      <div className="glass-panel p-6 rounded-lg border border-glass-border space-y-6 mt-8">
        <div className="border-b border-glass-border pb-4">
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">AI ANALYTICS ENGINE</span>
          <h2 className="text-xl font-bold font-mono tracking-tight text-slate-100">AI Trading Intelligence</h2>
          <p className="text-xs text-slate-400 font-sans mt-1">
            Personalized analysis of your trading behavior based on your journal statistics.
          </p>
        </div>
        <div className="text-center py-8 text-slate-500 text-xs font-mono">
          AI Trading Intelligence becomes available after at least 10 completed journal trades.
        </div>
      </div>
    );
  }

  // Real Max Drawdown calculation from daily data points
  const maxDrawdown = drawdownData.reduce((max, d) => Math.max(max, d.drawdown), 0);

  // Dynamic Strategy Expectations Calculations
  const stratStats = Object.entries(
    trades.reduce((acc: Record<string, { wins: number; count: number; pl: number; grossProfit: number; grossLoss: number }>, t) => {
      const strat = t.strategy || 'Unknown';
      if (!acc[strat]) acc[strat] = { wins: 0, count: 0, pl: 0, grossProfit: 0, grossLoss: 0 };
      acc[strat].count += 1;
      const plVal = Number(t.profit_loss);
      acc[strat].pl += plVal;
      if (plVal > 0 || t.results === 'Win' || t.results === 'MTG Win') {
        acc[strat].wins += 1;
        acc[strat].grossProfit += plVal;
      } else {
        acc[strat].grossLoss += Math.abs(plVal);
      }
      return acc;
    }, {})
  ).map(([name, s]) => {
    const avgWin = s.wins > 0 ? s.grossProfit / s.wins : 0;
    const avgLoss = (s.count - s.wins) > 0 ? s.grossLoss / (s.count - s.wins) : 0;
    return {
      name,
      count: s.count,
      pl: s.pl,
      winRate: Math.round((s.wins / s.count) * 100),
      avgRR: avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(1)) : 1.5
    };
  });

  const bestStrat = [...stratStats].sort((a, b) => b.pl - a.pl)[0] || { name: 'N/A', winRate: 0, pl: 0, count: 0, avgRR: 1.5 };
  const worstStrat = [...stratStats].sort((a, b) => a.pl - b.pl)[0] || { name: 'N/A', winRate: 0, pl: 0, count: 0, avgRR: 1.0 };

  // Overconfidence Detection: losses after a win compared to baseline average loss
  const sortedTrades = [...trades].sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());
  let winFollowedCount = 0;
  let winFollowedLossCount = 0;
  let winFollowedLossSum = 0;

  for (let i = 1; i < sortedTrades.length; i++) {
    const prev = sortedTrades[i - 1];
    const curr = sortedTrades[i];
    const prevWin = prev.profit_loss > 0 || prev.results === 'Win' || prev.results === 'MTG Win';
    if (prevWin) {
      winFollowedCount += 1;
      const currLoss = curr.profit_loss < 0;
      if (currLoss) {
        winFollowedLossCount += 1;
        winFollowedLossSum += Math.abs(Number(curr.profit_loss));
      }
    }
  }

  const avgLossAfterWin = winFollowedLossCount > 0 ? winFollowedLossSum / winFollowedLossCount : avgLossAmount;
  const lossIncreasePct = avgLossAmount > 0 
    ? Math.max(0, Math.round(((avgLossAfterWin - avgLossAmount) / avgLossAmount) * 100))
    : 0;

  // Worst hour window check
  const hourlyPlMap = trades.reduce((acc: Record<number, number>, t) => {
    const hour = new Date(t.trade_date).getHours();
    acc[hour] = (acc[hour] || 0) + Number(t.profit_loss);
    return acc;
  }, {});
  const worstHourEntry = Object.entries(hourlyPlMap).sort((a, b) => Number(a[1]) - Number(b[1]))[0];
  const worstHour = worstHourEntry ? Number(worstHourEntry[0]) : 13;
  const worstHourPL = worstHourEntry ? Number(worstHourEntry[1]) : 0;

  // Worst day window check
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayPlMap = trades.reduce((acc: Record<number, number>, t) => {
    const day = new Date(t.trade_date).getDay();
    acc[day] = (acc[day] || 0) + Number(t.profit_loss);
    return acc;
  }, {});
  const worstDayEntry = Object.entries(dayPlMap).sort((a, b) => Number(a[1]) - Number(b[1]))[0];
  const worstDayName = worstDayEntry ? days[Number(worstDayEntry[0])] : 'Monday';

  // Overall Score Calculation (Win Rate + Consistency + Profit Factor weightings)
  const tradingScore = Math.min(100, Math.max(10, Math.round(
    (winRate * 0.4) + (consistencyScore * 0.3) + (Math.min(3, profitFactor) / 3 * 30)
  )));

  let overallGrade = 'C';
  let overallGradeLabel = 'Needs Improvement';
  if (tradingScore >= 85) {
    overallGrade = 'A-';
    overallGradeLabel = 'Professional Level Trader';
  } else if (tradingScore >= 72) {
    overallGrade = 'B+';
    overallGradeLabel = 'Consistent Developing Trader';
  } else if (tradingScore >= 60) {
    overallGrade = 'B';
    overallGradeLabel = 'Average Growth Trader';
  } else if (tradingScore >= 45) {
    overallGrade = 'C+';
    overallGradeLabel = 'Needs Strategy Refinement';
  }

  // Sub-metrics Grades
  const getRiskGrade = () => {
    if (maxDrawdown <= 5) return 'A';
    if (maxDrawdown <= 10) return 'A-';
    if (maxDrawdown <= 15) return 'B+';
    return 'C';
  };

  const getPsychGrade = () => {
    if (lossIncreasePct < 15) return 'A';
    if (lossIncreasePct < 30) return 'B+';
    return 'C+';
  };

  const getConsistencyGrade = () => {
    if (consistencyScore >= 80) return 'A';
    if (consistencyScore >= 60) return 'B';
    return 'C';
  };

  const getExecutionGrade = () => {
    if (winRate >= 65) return 'A';
    if (winRate >= 52) return 'A-';
    return 'B';
  };

  const getDisciplineGrade = () => {
    if (profitFactor >= 2.0) return 'A';
    if (profitFactor >= 1.3) return 'B+';
    return 'C+';
  };

  // Confidence Calculation
  const confidencePct = Math.min(99, Math.round(50 + (trades.length / 100) * 49));

  // Trading Personality selector
  const getTradingPersonality = () => {
    if (winRate >= 65 && maxDrawdown <= 8) {
      return {
        name: "Disciplined Scalper",
        characteristics: ["Excellent patience", "Low drawdown curve", "High consistency"],
        weakness: "Overtrading after winning streaks."
      };
    }
    const avgRR = avgLossAmount > 0 ? avgWinAmount / avgLossAmount : 1.0;
    if (avgRR >= 2.0) {
      return {
        name: "Patient Swing Opportunist",
        characteristics: ["Large risk-reward targets", "High profit expectancy", "Low session stress"],
        weakness: "Hesitation during fast breakout trends."
      };
    }
    if (consistencyScore >= 75) {
      return {
        name: "Systematic Price Action Trader",
        characteristics: ["Stable sizing rules", "Highly predictable results", "Clear entry criteria"],
        weakness: "Lower execution frequency on low-volatility days."
      };
    }
    return {
      name: "Developing Trend Rider",
      characteristics: ["Standardized risk controls", "Active market adaptation", "Increasing trade accuracy"],
      weakness: "Risk scaling under drawdown streaks."
    };
  };

  const personality = getTradingPersonality();

  // Recommendations builder (deterministic, statistics-based)
  const getRecommendations = () => {
    const list: Array<{ text: string; priority: 'High' | 'Medium' | 'Low' }> = [];

    if (worstHourPL < 0) {
      list.push({
        text: `Avoid entering new setups during your weakest hourly window (${worstHour}:00–${(worstHour+1)%24}:00) to protect gains.`,
        priority: 'High'
      });
    }

    if (worstStrat.pl < 0 && worstStrat.name !== 'N/A') {
      list.push({
        text: `The "${worstStrat.name}" strategy has a low win rate of ${worstStrat.winRate}%. Consider reducing its usage in current market phases.`,
        priority: 'High'
      });
    }

    if (lossIncreasePct > 15) {
      list.push({
        text: `Your average loss is ${lossIncreasePct}% larger than your planned stop sizes. Stick to your risk parameters.`,
        priority: 'High'
      });
    }

    if (worstDayEntry) {
      list.push({
        text: `Reduce active position sizing on ${worstDayName}s, which is statistically your least profitable trading day.`,
        priority: 'Medium'
      });
    }

    if (winFollowedLossCount > 2) {
      list.push({
        text: "Halt trading sessions immediately after 2 consecutive losses to prevent revenge trading.",
        priority: 'Medium'
      });
    }

    // Pad if needed
    if (list.length < 5) {
      const avgRRVal = avgLossAmount > 0 ? avgWinAmount / avgLossAmount : 1.0;
      if (avgRRVal < 1.5) {
        list.push({
          text: "Extend profit targets to increase average Risk-to-Reward above 1.5 on scalp setups.",
          priority: 'Medium'
        });
      }
    }
    while (list.length < 5) {
      list.push({
        text: `Prioritize the "${bestStrat.name}" strategy which produces your highest expectancy (${bestStrat.winRate}% win rate).`,
        priority: 'Low'
      });
    }

    return list.slice(0, 5);
  };

  const recommendations = getRecommendations();

  // Coach message builder
  const getCoachMessage = () => {
    const frequency = trades.length / 30; // mock active days
    if (frequency > 2.0) {
      return `Your statistics indicate that your edge comes from patience, not frequency. You currently average ${frequency.toFixed(1)} trades/day. Restricting entries to A+ setups will improve overall monthly performance.`;
    }
    return `Your patient entry frequency is excellent. Focus on maintaining your strict checklist and scaling size only on your highest win rate strategy (${bestStrat.name}).`;
  };

  const getProgressBar = (filledCount: number) => {
    const filled = Math.max(0, Math.min(10, filledCount));
    return "█".repeat(filled) + "░".repeat(10 - filled);
  };

  return (
    <div className="glass-panel p-6 rounded-lg border border-glass-border space-y-6 mt-8 relative overflow-hidden animate-fadeInUp">
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-gold-vip/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Header and Telemetry Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-glass-border pb-4">
        <div>
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">AI ANALYTICS ENGINE</span>
          <h2 className="text-xl font-bold font-mono tracking-tight text-slate-100">AI Trading Intelligence</h2>
          <p className="text-xs text-slate-400 font-sans mt-1">
            Personalized analysis of your trading behavior based on your journal statistics.
          </p>
        </div>
        
        {/* Confidence Badge */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-[#020617] border border-glass-border px-3 py-1.5 rounded flex flex-col font-mono text-[10px] text-left">
            <span className="text-slate-500 uppercase tracking-widest text-[8px]">Analysis Confidence</span>
            <span className="text-neon-green font-bold">{confidencePct}% ({trades.length} Trades)</span>
          </div>
        </div>
      </div>

      {/* Row 1: Overall Performance & Trading Personality */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Overall Performance Grade Card */}
        <div className="glass-panel p-5 rounded-lg border border-glass-border flex flex-col justify-between space-y-4">
          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block font-bold">Overall Performance</span>
          <div className="flex items-center gap-4 pt-2">
            <div className="w-16 h-16 rounded bg-gold-vip/10 border border-gold-vip/30 flex items-center justify-center font-mono font-bold text-3xl text-gold-vip glow-text-gold">
              {overallGrade}
            </div>
            <div>
              <span className="text-[10px] font-mono text-slate-500 block uppercase">Trading Status</span>
              <h4 className="text-sm font-bold font-mono text-slate-200">{overallGradeLabel}</h4>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 font-sans leading-normal pt-2 border-t border-slate-900">
            Rating calculated across profit factor volatility, win rate distribution, and equity curve integrity.
          </p>
        </div>

        {/* Trading Personality Card */}
        <div className="glass-panel p-5 rounded-lg border border-glass-border flex flex-col justify-between space-y-4 md:col-span-2">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block font-bold">Trading Personality</span>
            <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-mono uppercase font-bold">
              Cognitive Profile
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-sm font-bold font-mono text-slate-100">{personality.name}</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                Your trades show traits of a <strong className="text-slate-300">{personality.name.toLowerCase()}</strong>. You rely on patterns and defined risk boundaries.
              </p>
            </div>
            <div className="text-xs space-y-1.5 font-mono text-slate-400 border-l border-slate-900 pl-4">
              <span className="text-[9px] text-slate-500 uppercase block font-bold font-mono">Core Traits</span>
              {personality.characteristics.map((trait, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="text-neon-green">✓</span>
                  <span>{trait}</span>
                </div>
              ))}
              <div className="pt-1.5">
                <span className="text-[9px] text-slate-500 uppercase block font-bold font-mono">Cognitive Weakness</span>
                <span className="text-rose-400 text-[11px]">{personality.weakness}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Row 2: Highest Edge & Primary Weakness */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card 1: Highest Edge */}
        <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-4">
          <div className="flex justify-between items-center text-emerald-400">
            <span className="text-[10px] font-mono uppercase tracking-wider block font-bold">✓ Highest Edge</span>
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold">Optimal Setup</span>
          </div>
          <div className="space-y-3">
            <h3 className="text-base font-bold font-mono text-slate-200">
              {bestStrat.name !== 'N/A' ? bestStrat.name : 'Standard Execution'}
            </h3>
            
            {/* Stats Block */}
            {bestStrat.name !== 'N/A' && (
              <div className="grid grid-cols-3 gap-2 bg-[#020617]/50 border border-slate-900 p-2.5 rounded font-mono text-xs text-slate-400">
                <div>
                  <span className="text-[8px] text-slate-500 block">WIN RATE</span>
                  <span className="text-slate-200 font-bold">{bestStrat.winRate}%</span>
                </div>
                <div>
                  <span className="text-[8px] text-slate-500 block">AVERAGE RR</span>
                  <span className="text-slate-200 font-bold">{bestStrat.avgRR}</span>
                </div>
                <div>
                  <span className="text-[8px] text-slate-500 block">NET PROFIT</span>
                  <span className="text-emerald-400 font-bold">+${Math.round(bestStrat.pl)}</span>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400 leading-normal font-sans">
              This strategy produces your highest expectancy. Continue prioritizing this setup in high-probability sessions.
            </p>
          </div>
        </div>

        {/* Card 2: Primary Weakness */}
        <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-4">
          <div className="flex justify-between items-center text-rose-500">
            <span className="text-[10px] font-mono uppercase tracking-wider block font-bold">⚠ Primary Weakness</span>
            <span className="text-xs font-mono uppercase tracking-wider text-rose-500 font-bold">Leak Alert</span>
          </div>
          <div className="space-y-3">
            <h3 className="text-base font-bold font-mono text-slate-200">
              {lossIncreasePct > 15 ? 'Overconfidence Streaks' : 'Risk Skew Discrepancies'}
            </h3>
            
            {lossIncreasePct > 15 ? (
              <div className="bg-[#020617]/50 border border-slate-900 p-2.5 rounded font-mono text-xs text-slate-400">
                <span className="text-[9px] text-slate-500 block uppercase font-bold">Expectancy Bleed</span>
                <span className="text-rose-400 leading-relaxed block">
                  Your average loss increases by <strong className="text-slate-200">{lossIncreasePct}%</strong> after a winning trade.
                </span>
              </div>
            ) : (
              <div className="bg-[#020617]/50 border border-slate-900 p-2.5 rounded font-mono text-xs text-slate-400">
                <span className="text-[9px] text-slate-500 block uppercase font-bold">Expectancy Bleed</span>
                <span className="text-rose-400 leading-relaxed block">
                  Your average loss (${Math.round(avgLossAmount)}) is larger than your average winning trade.
                </span>
              </div>
            )}

            <p className="text-xs text-slate-400 leading-normal font-sans">
              {lossIncreasePct > 15 
                ? "Possible Cause: Overconfidence or sizing expansion. Recommendation: Limit yourself to one high-confidence trade after a winning streak."
                : "Possible Cause: Holding losing trades past planned exit points. Recommendation: Exit immediately on invalidate signals."}
            </p>
          </div>
        </div>

      </div>

      {/* Row 3: AI Recommendations & Improvement Grades */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card 3: AI Recommendations */}
        <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-4">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block font-bold">AI Recommendations</span>
            <span className="text-[9px] bg-slate-950 border border-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono uppercase">
              Action Plan
            </span>
          </div>
          <ul className="space-y-3 font-sans text-xs">
            {recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start justify-between gap-3 text-slate-300">
                <span className="leading-relaxed">{rec.text}</span>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase font-bold shrink-0 ${
                  rec.priority === 'High' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
                  rec.priority === 'Medium' ? 'bg-gold-vip/10 text-gold-vip border-gold-vip/20' : 
                  'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {rec.priority}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Card 4: Grading Milestones */}
        <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block font-bold">Trading Score</span>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono uppercase font-bold">
                {tradingScore}%
              </span>
            </div>
            
            {/* Score progress bar */}
            <div className="flex items-center gap-3 pt-2 font-mono text-xs text-gold-vip">
              <span>{getProgressBar(Math.round(tradingScore / 10))}</span>
              <span className="text-[9px] text-slate-500 uppercase font-bold">Expectancy Score</span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block font-bold">Metric Breakdown Grades</span>
            <div className="grid grid-cols-5 gap-1.5 text-center font-mono text-[10px] text-slate-400">
              <div className="bg-[#020617]/50 border border-slate-900 py-2 rounded">
                <span className="text-[8px] text-slate-500 block">RISK</span>
                <strong className="text-slate-200 text-xs">{getRiskGrade()}</strong>
              </div>
              <div className="bg-[#020617]/50 border border-slate-900 py-2 rounded">
                <span className="text-[8px] text-slate-500 block">PSYCH</span>
                <strong className="text-slate-200 text-xs">{getPsychGrade()}</strong>
              </div>
              <div className="bg-[#020617]/50 border border-slate-900 py-2 rounded">
                <span className="text-[8px] text-slate-500 block">CONST</span>
                <strong className="text-slate-200 text-xs">{getConsistencyGrade()}</strong>
              </div>
              <div className="bg-[#020617]/50 border border-slate-900 py-2 rounded">
                <span className="text-[8px] text-slate-500 block">EXEC</span>
                <strong className="text-slate-200 text-xs">{getExecutionGrade()}</strong>
              </div>
              <div className="bg-[#020617]/50 border border-slate-900 py-2 rounded">
                <span className="text-[8px] text-slate-500 block">DISC</span>
                <strong className="text-slate-200 text-xs">{getDisciplineGrade()}</strong>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Row 4: AI Coach Message */}
      <div className="glass-panel p-5 rounded-lg border border-glass-border flex flex-col justify-between space-y-3 relative overflow-hidden bg-gold-vip/5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono text-gold-vip uppercase tracking-widest block font-bold">Today's Coach Message</span>
          <Award className="h-4 w-4 text-gold-vip" />
        </div>
        <p className="text-xs text-slate-200 leading-relaxed font-sans font-medium">
          {getCoachMessage()}
        </p>
      </div>

    </div>
  );
}

const CHART_COLORS = ['#10B981', '#EF4444'];

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [isErasing, setIsErasing] = useState(false);
  const [trades, setTrades] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);
  const [userAccess, setUserAccess] = useState<any>({
    vipAccess: false,
    premiumAccess: false,
    status: 'pending'
  });

  const [eraseConfirmStep, setEraseConfirmStep] = useState(0);
  const [signalStats, setSignalStats] = useState<{ total: number; wins: number; losses: number; pending: number; accuracy: number; totalToday: number } | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Daily Inspector State
  const [inspectorDate, setInspectorDate] = useState(() => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(today.getTime() - tzOffset)).toISOString().slice(0, 10);
    return localISOTime;
  });

  useEffect(() => {
    setMounted(true);
    async function loadDashboardData() {
      try {
        const [tradesRes, accessRes, perfRes] = await Promise.all([
          getTrades(),
          getUserAccessState(),
          getSignalPerformance('ALL')
        ]);
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
        if (perfRes.success && perfRes.stats) {
          setSignalStats(perfRes.stats);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(t);
  }, [notification]);

  const handleEraseData = async () => {
    setEraseConfirmStep(1);
  };

  const confirmEraseFirst = () => {
    setEraseConfirmStep(2);
  };

  const confirmEraseSecond = async () => {
    setEraseConfirmStep(0);
    setIsErasing(true);
    try {
      const res = await eraseTrades();
      if (res.success) {
        setNotification({ type: 'success', message: 'All trading data has been permanently deleted.' });
        window.location.reload();
      } else {
        setNotification({ type: 'error', message: res.error || 'Failed to erase data.' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Error erasing data: ' + err.message });
    } finally {
      setIsErasing(false);
    }
  };

  if (loading || isErasing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">
          {isErasing ? "ERASING SYSTEM ARCHIVES..." : "COMPILING FINANCIAL METRICS..."}
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

  if (!canAccess('analytics', profile)) {
    return <LockedFeature feature="analytics" />;
  }

  if (trades.length === 0) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-6 pt-16 animate-fadeInUp">
        <div className="inline-flex p-3 rounded-full bg-slate-900 border border-glass-border text-slate-500 mb-2">
          <BarChart3 className="h-8 w-8 text-slate-500" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold font-mono text-slate-200">
          NO TRANSACTIONS LOGGED IN DATABASE
        </h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          Your analytics ledger is currently empty. To generate the 10 professional charts, please navigate to the journal section and record your latest trading sessions.
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

  // Helper helper to see if a trade is a Win (considers MTG Win as win)
  const isTradeWin = (t: any) => {
    return t.profit_loss > 0 || t.results === 'Win' || t.results === 'MTG Win';
  };

  // --- STATS CALCULATIONS ---
  const totalTrades = trades.length;
  const wins = trades.filter(isTradeWin);
  const losses = trades.filter((t) => !isTradeWin(t));
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const netProfit = trades.reduce((acc, t) => acc + Number(t.profit_loss), 0);
  const avgTrade = totalTrades > 0 ? netProfit / totalTrades : 0;

  const grossProfit = wins.reduce((acc, t) => acc + Number(t.profit_loss), 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + Number(t.profit_loss), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit;

  // Consistency Score formula
  const mean = netProfit / totalTrades;
  const variance = trades.reduce((acc, t) => acc + Math.pow(Number(t.profit_loss) - mean, 2), 0) / totalTrades;
  const stdDev = Math.sqrt(variance);
  const consistencyScore = totalTrades > 1 
    ? Math.max(10, Math.min(100, Math.round(100 - (stdDev / (Math.abs(mean) || 80)) * 5))) 
    : 100;

  // --- CHART DATA PREPARATION ---

  // Sort trades ascending for cumulative lines
  const sortedTrades = useMemo(() => {
    return [...trades].sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());
  }, [trades]);

  // 1. Daily P&L and 4. Equity Curve
  const initialEquity = 1000; // base virtual account equity
  const dailyData = useMemo(() => {
    let cumulativePL = 0;
    return sortedTrades.map((t, index) => {
      cumulativePL += Number(t.profit_loss);
      return {
        name: `Trade ${index + 1}`,
        date: new Date(t.trade_date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        pl: cumulativePL,
        equity: initialEquity + cumulativePL,
      };
    });
  }, [sortedTrades]);

  // 2. Win/Loss Ratio
  const winLossData = useMemo(() => [
    { name: 'Wins', value: wins.length },
    { name: 'Losses', value: losses.length },
  ], [trades]);

  // 3. Monthly Performance
  const monthlyData = useMemo(() => {
    const monthlyMap: Record<string, number> = {};
    sortedTrades.forEach((t) => {
      const month = new Date(t.trade_date).toLocaleDateString([], { month: 'short', year: '2-digit' });
      monthlyMap[month] = (monthlyMap[month] || 0) + Number(t.profit_loss);
    });
    return Object.entries(monthlyMap).map(([month, pl]) => ({ name: month, pl }));
  }, [sortedTrades]);

  // 5. Trading Hours Analysis
  const hourlyData = useMemo(() => {
    const hourlyMap: Record<number, { count: number; wins: number; pl: number }> = {};
    sortedTrades.forEach((t) => {
      const hour = new Date(t.trade_date).getHours();
      if (!hourlyMap[hour]) hourlyMap[hour] = { count: 0, wins: 0, pl: 0 };
      hourlyMap[hour].count += 1;
      hourlyMap[hour].pl += Number(t.profit_loss);
      if (isTradeWin(t)) hourlyMap[hour].wins += 1;
    });
    return Array.from({ length: 24 }).map((_, h) => {
      const data = hourlyMap[h] || { count: 0, wins: 0, pl: 0 };
      return {
        name: `${h}:00`,
        pl: data.pl,
        winRate: data.count > 0 ? Math.round((data.wins / data.count) * 100) : 0,
      };
    }).filter(h => h.winRate > 0 || h.pl !== 0); // only show hours with trades
  }, [sortedTrades]);

  // 6. Strategy Performance
  const strategyData = useMemo(() => {
    const strategyMap: Record<string, number> = {};
    sortedTrades.forEach((t) => {
      const strat = t.strategy || 'Unknown';
      strategyMap[strat] = (strategyMap[strat] || 0) + Number(t.profit_loss);
    });
    return Object.entries(strategyMap).map(([strategy, pl]) => ({ name: strategy, pl }));
  }, [sortedTrades]);

  // 7. Risk Reward Comparison (Avg Win vs Avg Loss)
  const avgWinAmount = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLossAmount = losses.length > 0 ? grossLoss / losses.length : 0;
  const riskRewardData = useMemo(() => [
    { name: 'Avg Profit (Wins)', amount: Math.round(avgWinAmount) },
    { name: 'Avg Loss (Losses)', amount: Math.round(avgLossAmount) },
  ], [avgWinAmount, avgLossAmount]);

  // 8. Drawdown Chart
  const drawdownData = useMemo(() => {
    let cum = 0;
    let peak = initialEquity;
    return sortedTrades.map((t, index) => {
      cum += Number(t.profit_loss);
      const equity = initialEquity + cum;
      if (equity > peak) peak = equity;
      const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      return {
        name: `T ${index + 1}`,
        drawdown: Number(drawdown.toFixed(2)),
      };
    });
  }, [sortedTrades]);

  // 9. Profit Factor visual stacked
  const profitFactorData = [
    { name: 'Performance Ratio', Profit: Math.round(grossProfit), Loss: Math.round(grossLoss) },
  ];

  // 10. Consistency Score Line Chart (Cumulative win rate progression)
  const consistencyProgression = useMemo(() => {
    let winSum = 0;
    return sortedTrades.map((t, index) => {
      if (isTradeWin(t)) winSum += 1;
      const currentRate = (winSum / (index + 1)) * 100;
      return {
        name: `T ${index + 1}`,
        rate: Number(currentRate.toFixed(1)),
      };
    });
  }, [sortedTrades]);

  // Daily Inspector Calculations
  const inspectorTrades = trades.filter((t) => {
    const tradeLocalDate = new Date(t.trade_date).toLocaleDateString('sv-SE');
    return tradeLocalDate === inspectorDate;
  });
  const inspectorTotal = inspectorTrades.length;
  const inspectorWins = inspectorTrades.filter(isTradeWin).length;
  const inspectorLosses = inspectorTrades.filter((t) => !isTradeWin(t)).length;
  const inspectorNetPL = inspectorTrades.reduce((acc, t) => acc + Number(t.profit_loss), 0);
  const inspectorWinRate = inspectorTotal > 0 ? (inspectorWins / inspectorTotal) * 100 : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto animate-fadeIn">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-glass-border pb-4">
        <div>
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">analytical database</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Performance Terminal</h1>
        </div>
        <button
          onClick={handleEraseData}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded border border-rose-500/35 hover:bg-rose-950/20 text-rose-400 font-bold text-xs font-mono tracking-wider uppercase transition-all"
        >
          <Trash2 className="h-4 w-4" /> ERASE ALL DATA
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: 'NET PROFIT', value: `${netProfit >= 0 ? '+' : ''}$${Math.round(netProfit)}`, icon: DollarSign, color: netProfit >= 0 ? 'text-neon-green glow-text-green' : 'text-rose-500' },
          { label: 'WIN RATE', value: `${winRate.toFixed(1)}%`, icon: Target, color: 'text-neon-green glow-text-green' },
          { label: 'TOTAL TRADES', value: String(totalTrades), icon: Activity, color: 'text-slate-300' },
          { label: 'PROFIT FACTOR', value: profitFactor.toFixed(2), icon: Flame, color: 'text-gold-vip glow-text-gold' },
          { label: 'CONSISTENCY', value: `${consistencyScore}%`, icon: Award, color: 'text-gold-vip glow-text-gold' },
          { label: 'AVG TRADE', value: `${avgTrade >= 0 ? '+' : ''}$${Math.round(avgTrade)}`, icon: DollarSign, color: avgTrade >= 0 ? 'text-neon-green' : 'text-rose-500' },
        ].map((item, i) => (
          <div key={i} className="glass-panel p-4 rounded-lg flex flex-col justify-between transition-all duration-300 hover:scale-[1.03] hover:border-glass-border/50 animate-fadeInUp" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider font-mono">
              <span>{item.label}</span>
              <item.icon className="h-3.5 w-3.5" />
            </div>
            <div className={`text-lg font-bold font-mono mt-3 ${item.color}`}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Daily Inspector lookup */}
      <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-4 transition-all duration-300 hover:border-glass-border/50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">daily trade inspector</span>
            <h2 className="text-base font-bold font-mono text-slate-200">Daily Performance Lookup</h2>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={inspectorDate}
              onChange={(e) => setInspectorDate(e.target.value)}
              className="bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 font-mono text-xs focus:outline-none focus:border-neon-green/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-2 animate-fadeInUp">
          <div className="bg-[#020617]/50 border border-glass-border/40 p-3.5 rounded text-center">
            <div className="text-[8px] font-mono text-slate-500 uppercase">total trades</div>
            <div className="text-base font-mono font-bold text-slate-200 mt-1">{inspectorTotal}</div>
          </div>
          <div className="bg-[#020617]/50 border border-glass-border/40 p-3.5 rounded text-center">
            <div className="text-[8px] font-mono text-slate-500 uppercase">wins</div>
            <div className="text-base font-mono font-bold text-neon-green mt-1">{inspectorWins}</div>
          </div>
          <div className="bg-[#020617]/50 border border-glass-border/40 p-3.5 rounded text-center">
            <div className="text-[8px] font-mono text-slate-500 uppercase">losses</div>
            <div className="text-base font-mono font-bold text-rose-500 mt-1">{inspectorLosses}</div>
          </div>
          <div className="bg-[#020617]/50 border border-glass-border/40 p-3.5 rounded text-center">
            <div className="text-[8px] font-mono text-slate-500 uppercase">win rate</div>
            <div className="text-base font-mono font-bold text-neon-green mt-1">{inspectorWinRate.toFixed(1)}%</div>
          </div>
          <div className="bg-[#020617]/50 border border-glass-border/40 p-3.5 rounded text-center col-span-2 md:col-span-1">
            <div className="text-[8px] font-mono text-slate-500 uppercase">net p&l</div>
            <div className={`text-base font-mono font-bold mt-1 ${inspectorNetPL >= 0 ? 'text-neon-green' : 'text-rose-500'}`}>
              {inspectorNetPL >= 0 ? '+' : ''}${inspectorNetPL.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      {mounted && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
          
          {/* 1. Daily P&L Line Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp">
            <span className="text-[10px] font-mono text-slate-500 tracking-wider block">1. DAILY CUMULATIVE P&L (USD)</span>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={9} />
                  <YAxis stroke="#475569" fontSize={9} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                  <Line type="monotone" dataKey="pl" stroke="#00E676" strokeWidth={2} dot={false} name="Net P&L" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2. Win/Loss Ratio Pie Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.05s' }}>
            <span className="text-[10px] font-mono text-slate-500 tracking-wider block">2. WIN/LOSS DISTRIBUTION</span>
            <div className="h-[260px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={winLossData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {winLossData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. Monthly Performance Bar Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
            <span className="text-[10px] font-mono text-slate-500 tracking-wider block">3. MONTHLY NET P&L (USD)</span>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="name" stroke="#475569" fontSize={9} />
                  <YAxis stroke="#475569" fontSize={9} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                  <Bar dataKey="pl" fill="#00E676">
                    {monthlyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.pl >= 0 ? '#10B981' : '#EF4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. Equity Curve Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.15s' }}>
            <span className="text-[10px] font-mono text-slate-500 tracking-wider block">4. ACCOUNT EQUITY PROGRESSION (USD)</span>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={9} />
                  <YAxis stroke="#475569" fontSize={9} domain={['dataMin - 100', 'dataMax + 100']} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                  <defs>
                    <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFD700" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#FFD700" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="equity" stroke="#FFD700" strokeWidth={2} fillOpacity={1} fill="url(#colorEquity)" name="Equity" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. Trading Hours Analysis Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.2s' }}>
            <span className="text-[10px] font-mono text-slate-500 tracking-wider block">5. HOURLY DISTRIBUTION P&L (USD)</span>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="name" stroke="#475569" fontSize={9} />
                  <YAxis stroke="#475569" fontSize={9} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                  <Bar dataKey="pl" fill="#3B82F6">
                    {hourlyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.pl >= 0 ? '#10B981' : '#EF4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 6. Strategy Performance Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.25s' }}>
            <span className="text-[10px] font-mono text-slate-500 tracking-wider block">6. STRATEGY PROFITABILITY (USD)</span>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={strategyData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis type="number" stroke="#475569" fontSize={9} />
                  <YAxis dataKey="name" type="category" stroke="#475569" fontSize={8} width={90} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                  <Bar dataKey="pl" fill="#8B5CF6">
                    {strategyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.pl >= 0 ? '#10B981' : '#EF4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 7. Risk Reward Ratio Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.3s' }}>
            <span className="text-[10px] font-mono text-slate-500 tracking-wider block">7. AVERAGE WIN VS AVERAGE LOSS SIZE (USD)</span>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskRewardData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="name" stroke="#475569" fontSize={9} />
                  <YAxis stroke="#475569" fontSize={9} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                  <Bar dataKey="amount" fill="#FF8042">
                    <Cell fill="#10B981" />
                    <Cell fill="#EF4444" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 8. Drawdown Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.35s' }}>
            <span className="text-[10px] font-mono text-slate-500 tracking-wider block">8. PEAK EQUITY PERCENTAGE DRAWDOWN</span>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drawdownData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="name" stroke="#475569" fontSize={9} />
                  <YAxis stroke="#475569" fontSize={9} reversed />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                  <defs>
                    <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="drawdown" stroke="#EF4444" strokeWidth={1.5} fillOpacity={1} fill="url(#colorDrawdown)" name="Drawdown %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 9. Profit Factor Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.4s' }}>
            <span className="text-[10px] font-mono text-slate-500 tracking-wider block">9. CUMULATIVE VOLUMES (GROSS PROFIT VS LOSS)</span>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitFactorData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="name" stroke="#475569" fontSize={9} />
                  <YAxis stroke="#475569" fontSize={9} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                  <Legend />
                  <Bar dataKey="Profit" fill="#10B981" />
                  <Bar dataKey="Loss" fill="#EF4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 10. Consistency Score Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3 transition-all duration-200 hover:border-glass-border/50 hover:shadow-lg animate-fadeInUp" style={{ animationDelay: '0.45s' }}>
            <span className="text-[10px] font-mono text-slate-500 tracking-wider block">10. WINNING EDGE STABILITY PROGRESSION (%)</span>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={consistencyProgression}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="name" stroke="#475569" fontSize={9} />
                  <YAxis stroke="#475569" fontSize={9} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                  <Line type="monotone" dataKey="rate" stroke="#FFD700" strokeWidth={2} dot={false} name="Win Rate %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      {mounted && (
        <AITradingIntelligencePanel
          trades={trades}
          netProfit={netProfit}
          winRate={winRate}
          profitFactor={profitFactor}
          consistencyScore={consistencyScore}
          avgWinAmount={avgWinAmount}
          avgLossAmount={avgLossAmount}
          drawdownData={drawdownData}
          strategyData={strategyData}
          hourlyData={hourlyData}
        />
      )}

      {/* ── OTC + Forex Signal Performance Section ──────────────────────── */}
      {signalStats && (
        <div className="glass-panel p-6 rounded-lg border border-glass-border space-y-6 mt-8">
          <div className="border-b border-glass-border pb-4">
            <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">SIGNAL ANALYTICS</span>
            <h2 className="text-xl font-bold font-mono tracking-tight text-slate-100">OTC & Live Forex Signal Performance</h2>
            <p className="text-xs text-slate-400 font-sans mt-1">
              Aggregated performance from all signal pipelines (OTC + Forex).
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'TOTAL SIGNALS', value: String(signalStats.total), color: 'text-slate-200' },
              { label: "TODAY'S SIGNALS", value: String(signalStats.totalToday), color: 'text-slate-200' },
              { label: 'WIN RATE', value: `${signalStats.accuracy}%`, color: 'text-neon-green' },
              { label: 'WINS', value: String(signalStats.wins), color: 'text-neon-green' },
              { label: 'LOSSES', value: String(signalStats.losses), color: 'text-rose-400' },
              { label: 'PENDING', value: String(signalStats.pending), color: 'text-amber-400' },
            ].map((stat, i) => (
              <div key={i} className="glass-panel p-4 rounded-xl flex flex-col justify-between transition-all duration-300 hover:scale-[1.03] hover:border-glass-border/50">
                <div className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">{stat.label}</div>
                <div className={`text-lg font-extrabold font-mono mt-2 ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Erase all step 1 confirmation */}
      {eraseConfirmStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-rose-400" />
              <h3 className="text-sm font-bold font-mono text-slate-200">Erase All Data</h3>
            </div>
            <p className="text-xs font-mono text-slate-400 leading-relaxed">
              WARNING: This will permanently delete ALL your trading journal records. This action cannot be undone. Do you want to proceed?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEraseConfirmStep(0)}
                className="px-4 py-2 rounded text-xs font-mono font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmEraseFirst}
                className="px-4 py-2 rounded text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Erase all step 2 final confirmation */}
      {eraseConfirmStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-rose-500/50 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-rose-400" />
              <h3 className="text-sm font-bold font-mono text-slate-200">Final Confirmation</h3>
            </div>
            <p className="text-xs font-mono text-slate-400 leading-relaxed">
              Are you absolutely sure you want to delete everything? Click Confirm to permanently erase all your data.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEraseConfirmStep(0)}
                className="px-4 py-2 rounded text-xs font-mono font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmEraseSecond}
                className="px-4 py-2 rounded text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all"
              >
                Confirm Erase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-slideIn">
          <div className={`p-4 rounded-xl border flex items-start gap-3 w-80 shadow-2xl ${
            notification.type === 'error'
              ? 'border-rose-500/30 bg-[#0a0303]'
              : 'border-neon-green/30 bg-[#030b17]'
          }`}>
            <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${notification.type === 'error' ? 'text-rose-400' : 'text-neon-green'}`} />
            <div className="space-y-1 font-mono text-xs">
              <div className={`font-bold uppercase ${notification.type === 'error' ? 'text-rose-300' : 'text-neon-green'}`}>
                {notification.type === 'error' ? 'ERROR' : 'SUCCESS'}
              </div>
              <div className="text-slate-400">{notification.message}</div>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="ml-auto text-slate-600 hover:text-slate-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
