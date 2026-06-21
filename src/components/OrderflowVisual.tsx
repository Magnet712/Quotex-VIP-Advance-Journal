'use client';

import React, { useState, useEffect } from 'react';
import { Eye, TrendingUp, DollarSign } from 'lucide-react';

interface OrderLog {
  id: string;
  time: string;
  type: 'BUY' | 'SELL';
  price: string;
  amount: string;
  volume: number;
}

export default function OrderflowVisual() {
  const [logs, setLogs] = useState<OrderLog[]>([]);
  const [buyRatio, setBuyRatio] = useState(55);

  useEffect(() => {
    // Generate initial order book log
    const generateLog = (): OrderLog => {
      const isBuy = Math.random() > 0.45;
      const basePrice = 1.0850;
      const randOffset = (Math.random() - 0.5) * 0.0030;
      const amount = (Math.random() * 5 + 0.1).toFixed(2);
      const volume = Math.floor(Math.random() * 20000 + 500);
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

      return {
        id: Math.random().toString(36).substring(2, 9),
        time: timeStr,
        type: isBuy ? 'BUY' : 'SELL',
        price: (basePrice + randOffset).toFixed(4),
        amount,
        volume,
      };
    };

    const initialLogs = Array.from({ length: 5 }, generateLog);
    setLogs(initialLogs);

    const interval = setInterval(() => {
      setLogs(prev => {
        const nextLog = generateLog();
        const updated = [nextLog, ...prev.slice(0, 4)];
        // Calculate new buy/sell ratios
        const buys = updated.filter(l => l.type === 'BUY').length;
        setBuyRatio(Math.round((buys / updated.length) * 100));
        return updated;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full bg-[#030812] border border-glass-border rounded-lg overflow-hidden flex flex-col font-mono text-xs">
      {/* Header */}
      <div className="flex justify-between items-center bg-[#070e1b] px-3 py-2 border-b border-glass-border">
        <span className="font-bold text-slate-300">Orderflow Heatmap & Tape</span>
        <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-glass-border">
          <Eye className="h-3 w-3 text-neon-green" /> LIVE TAPE
        </span>
      </div>

      {/* Visual representation of buy/sell pressure */}
      <div className="p-3 border-b border-glass-border bg-slate-950/40">
        <div className="flex justify-between mb-1.5 text-[10px] text-slate-400 font-bold">
          <span className="text-neon-green">BUY POWER: {buyRatio}%</span>
          <span className="text-rose-500">SELL POWER: {100 - buyRatio}%</span>
        </div>
        <div className="w-full h-2 bg-rose-500/20 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-neon-green transition-all duration-500"
            style={{ width: `${buyRatio}%` }}
          />
        </div>
      </div>

      {/* Realtime logs */}
      <div className="flex-1 overflow-hidden p-2.5 space-y-1.5">
        <div className="grid grid-cols-4 font-semibold text-slate-500 pb-1 border-b border-slate-900 text-[10px]">
          <span>TIME</span>
          <span>ACTION</span>
          <span className="text-right">PRICE</span>
          <span className="text-right">SIZE</span>
        </div>
        <div className="space-y-1">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`grid grid-cols-4 py-1.5 px-1 rounded transition-all duration-300 ${
                log.type === 'BUY'
                  ? 'bg-neon-green/5 text-neon-green hover:bg-neon-green/10'
                  : 'bg-rose-500/5 text-rose-400 hover:bg-rose-500/10'
              }`}
            >
              <span className="text-slate-400">{log.time}</span>
              <span className="font-bold">{log.type}</span>
              <span className="text-right font-semibold">{log.price}</span>
              <span className="text-right text-slate-300">${(log.volume / 1000).toFixed(1)}k</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
