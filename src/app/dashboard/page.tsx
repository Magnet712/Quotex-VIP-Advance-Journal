'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getTrades } from '@/app/actions/trades';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ResponsiveContainer, RadarChart, PolarGrid, 
  PolarAngleAxis, PolarRadiusAxis, Radar 
} from 'recharts';
import { 
  TrendingUp, Award, DollarSign, Target, Activity, 
  Flame, ShieldAlert, BarChart3, Plus, ArrowRight, Loader 
} from 'lucide-react';

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    async function loadTrades() {
      try {
        const res = await getTrades();
        if (res.success && res.trades) {
          setTrades(res.trades);
        }
      } catch (err) {
        console.error('Failed to load trades:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTrades();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">COMPILING FINANCIAL METRICS...</span>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-6 pt-16">
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
            className="inline-flex items-center gap-1.5 px-5 py-3 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-xs font-mono tracking-wider uppercase transition-colors glow-button"
          >
            <Plus className="h-4 w-4" />
            <span>Open Journal & Add Trades</span>
          </Link>
        </div>
      </div>
    );
  }

  // --- STATS CALCULATIONS ---
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.profit_loss > 0);
  const losses = trades.filter((t) => t.profit_loss <= 0);
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
  const sortedTrades = [...trades].sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());

  // 1. Daily P&L and 4. Equity Curve
  let cumulativePL = 0;
  const initialEquity = 1000; // base virtual account equity
  const dailyData = sortedTrades.map((t, index) => {
    cumulativePL += Number(t.profit_loss);
    return {
      name: `Trade ${index + 1}`,
      date: new Date(t.trade_date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      pl: cumulativePL,
      equity: initialEquity + cumulativePL,
    };
  });

  // 2. Win/Loss Ratio
  const winLossData = [
    { name: 'Wins', value: wins.length },
    { name: 'Losses', value: losses.length },
  ];
  const COLORS = ['#10B981', '#EF4444'];

  // 3. Monthly Performance
  const monthlyMap: Record<string, number> = {};
  sortedTrades.forEach((t) => {
    const month = new Date(t.trade_date).toLocaleDateString([], { month: 'short', year: '2-digit' });
    monthlyMap[month] = (monthlyMap[month] || 0) + Number(t.profit_loss);
  });
  const monthlyData = Object.entries(monthlyMap).map(([month, pl]) => ({ name: month, pl }));

  // 5. Trading Hours Analysis
  const hourlyMap: Record<number, { count: number; wins: number; pl: number }> = {};
  sortedTrades.forEach((t) => {
    const hour = new Date(t.trade_date).getHours();
    if (!hourlyMap[hour]) hourlyMap[hour] = { count: 0, wins: 0, pl: 0 };
    hourlyMap[hour].count += 1;
    hourlyMap[hour].pl += Number(t.profit_loss);
    if (t.profit_loss > 0) hourlyMap[hour].wins += 1;
  });
  const hourlyData = Array.from({ length: 24 }).map((_, h) => {
    const data = hourlyMap[h] || { count: 0, wins: 0, pl: 0 };
    return {
      name: `${h}:00`,
      pl: data.pl,
      winRate: data.count > 0 ? Math.round((data.wins / data.count) * 100) : 0,
    };
  }).filter(h => h.winRate > 0 || h.pl !== 0); // only show hours with trades

  // 6. Strategy Performance
  const strategyMap: Record<string, number> = {};
  sortedTrades.forEach((t) => {
    const strat = t.strategy || 'Unknown';
    strategyMap[strat] = (strategyMap[strat] || 0) + Number(t.profit_loss);
  });
  const strategyData = Object.entries(strategyMap).map(([strategy, pl]) => ({ name: strategy, pl }));

  // 7. Risk Reward Comparison (Avg Win vs Avg Loss)
  const avgWinAmount = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLossAmount = losses.length > 0 ? grossLoss / losses.length : 0;
  const riskRewardData = [
    { name: 'Avg Profit (Wins)', amount: Math.round(avgWinAmount) },
    { name: 'Avg Loss (Losses)', amount: Math.round(avgLossAmount) },
  ];

  // 8. Drawdown Chart
  let currentMaxEquity = initialEquity;
  const drawdownData = sortedTrades.map((t, index) => {
    const equity = initialEquity + sortedTrades.slice(0, index + 1).reduce((sum, curr) => sum + Number(curr.profit_loss), 0);
    if (equity > currentMaxEquity) {
      currentMaxEquity = equity;
    }
    const drawdown = currentMaxEquity > 0 ? ((currentMaxEquity - equity) / currentMaxEquity) * 100 : 0;
    return {
      name: `T ${index + 1}`,
      drawdown: Number(drawdown.toFixed(2)),
    };
  });

  // 9. Profit Factor visual stacked
  const profitFactorData = [
    { name: 'Performance Ratio', Profit: Math.round(grossProfit), Loss: Math.round(grossLoss) },
  ];

  // 10. Consistency Score Line Chart (Cumulative win rate progression)
  let winSum = 0;
  const consistencyProgression = sortedTrades.map((t, index) => {
    if (t.profit_loss > 0) winSum += 1;
    const currentRate = (winSum / (index + 1)) * 100;
    return {
      name: `T ${index + 1}`,
      rate: Number(currentRate.toFixed(1)),
    };
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-glass-border pb-4">
        <div>
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">analytical database</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Performance Terminal</h1>
        </div>
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
          <div key={i} className="glass-panel p-4 rounded-lg flex flex-col justify-between">
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

      {/* Charts Grid */}
      {mounted && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
          
          {/* 1. Daily P&L Line Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3">
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
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3">
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
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. Monthly Performance Bar Chart */}
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3">
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
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3">
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
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3">
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
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3">
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
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3">
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
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3">
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
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3">
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
          <div className="glass-panel p-5 rounded-lg border border-glass-border space-y-3">
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
    </div>
  );
}
