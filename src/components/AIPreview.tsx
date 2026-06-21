'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, Award, Target, Flame, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';

interface Metric {
  label: string;
  value: string;
  icon: any;
  colorClass: string;
  glowClass: string;
}

export default function AIPreview() {
  const [profit, setProfit] = useState(14850);
  const [winRate, setWinRate] = useState(72.4);
  const [tradesCount, setTradesCount] = useState(142);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);

  useEffect(() => {
    // Generate initial recent trades
    const assets = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'BTC/USD'];
    const strategies = ['Support Breakout', 'MACD Cross', 'VIP Golden EMA', 'Fibonacci Rebound'];
    
    const generateTrade = (index = 0) => {
      const outcome = Math.random() > 0.3 ? 'WIN' : 'LOSS';
      const pl = outcome === 'WIN' ? Math.floor(Math.random() * 400 + 50) : -Math.floor(Math.random() * 200 + 40);
      return {
        id: index || Math.random().toString(),
        asset: assets[Math.floor(Math.random() * assets.length)],
        strategy: strategies[Math.floor(Math.random() * strategies.length)],
        outcome,
        profit_loss: pl,
        time: 'Just now'
      };
    };

    setRecentTrades([
      generateTrade(1),
      { id: '2', asset: 'BTC/USD', strategy: 'VIP Golden EMA', outcome: 'WIN', profit_loss: 850, time: '2 mins ago' },
      { id: '3', asset: 'EUR/USD', strategy: 'Support Breakout', outcome: 'LOSS', profit_loss: -120, time: '10 mins ago' },
      { id: '4', asset: 'USD/JPY', strategy: 'MACD Cross', outcome: 'WIN', profit_loss: 340, time: '25 mins ago' }
    ]);

    const interval = setInterval(() => {
      // Create a new simulated trade
      const newTrade = generateTrade();
      
      setRecentTrades(prev => [newTrade, ...prev.slice(0, 3)]);
      setProfit(prev => prev + newTrade.profit_loss);
      setTradesCount(prev => prev + 1);
      setWinRate(prev => {
        const nextRate = prev + (newTrade.outcome === 'WIN' ? 0.2 : -0.4);
        return Number(Math.max(10, Math.min(100, nextRate)).toFixed(1));
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const metrics: Metric[] = [
    {
      label: 'NET PROFIT',
      value: `$${profit.toLocaleString()}`,
      icon: DollarSign,
      colorClass: 'text-neon-green',
      glowClass: 'glow-text-green',
    },
    {
      label: 'WIN RATE',
      value: `${winRate}%`,
      icon: Target,
      colorClass: 'text-neon-green',
      glowClass: 'glow-text-green',
    },
    {
      label: 'TOTAL TRADES',
      value: String(tradesCount),
      icon: Activity,
      colorClass: 'text-slate-300',
      glowClass: '',
    },
    {
      label: 'PROFIT FACTOR',
      value: '2.14',
      icon: Flame,
      colorClass: 'text-gold-vip',
      glowClass: 'glow-text-gold',
    },
  ];

  return (
    <div className="w-full glass-panel border border-glass-border rounded-xl p-5 font-sans relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-neon-green/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-gold-vip/5 rounded-full blur-3xl pointer-events-none" />

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 relative z-10">
        {metrics.map((metric, i) => (
          <div key={i} className="bg-slate-950/60 border border-glass-border p-4 rounded-lg flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-[10px] tracking-wider font-mono">
              <span>{metric.label}</span>
              <metric.icon className="h-3.5 w-3.5" />
            </div>
            <div className={`text-lg sm:text-xl font-bold font-mono mt-2 ${metric.colorClass} ${metric.glowClass}`}>
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity Table Preview */}
      <div className="bg-slate-950/40 border border-glass-border rounded-lg p-4 relative z-10">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-xs font-mono font-bold tracking-wider text-slate-300 uppercase">Live Trading Feed</h4>
          <span className="flex items-center gap-1 text-[10px] text-neon-green font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-neon-green animate-ping" /> AUTO SYNCING
          </span>
        </div>

        <div className="space-y-2">
          {recentTrades.map((trade) => (
            <div key={trade.id} className="flex items-center justify-between bg-slate-950/80 border border-glass-border/40 py-2.5 px-3 rounded hover:border-glass-border transition-colors">
              <div className="flex items-center space-x-3">
                <div className={`p-1.5 rounded ${trade.outcome === 'WIN' ? 'bg-neon-green/10 text-neon-green' : 'bg-rose-500/10 text-rose-400'}`}>
                  {trade.outcome === 'WIN' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-200">{trade.asset}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{trade.strategy}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-xs font-bold font-mono ${trade.outcome === 'WIN' ? 'text-neon-green' : 'text-rose-400'}`}>
                  {trade.outcome === 'WIN' ? '+' : ''}${trade.profit_loss}
                </div>
                <div className="text-[9px] text-slate-500 font-mono">{trade.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
