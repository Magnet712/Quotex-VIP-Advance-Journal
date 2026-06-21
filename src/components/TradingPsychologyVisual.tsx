'use client';

import React, { useState, useEffect } from 'react';
import { Brain, Smile, AlertCircle } from 'lucide-react';

export default function TradingPsychologyVisual() {
  const [fearGreed, setFearGreed] = useState(48);

  useEffect(() => {
    const interval = setInterval(() => {
      setFearGreed(prev => {
        const delta = Math.floor(Math.random() * 9 - 4);
        return Math.max(10, Math.min(90, prev + delta));
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const getStatus = (val: number) => {
    if (val < 35) return { label: 'EXTREME FEAR', color: 'text-blue-400', desc: 'Market panic. Prime time to wait for solid setups.' };
    if (val < 45) return { label: 'FEAR', color: 'text-sky-300', desc: 'Traders hesitant. Follow rules strictly.' };
    if (val < 55) return { label: 'NEUTRAL / DISCIPLINED', color: 'text-neon-green glow-text-green', desc: 'Optimal state. Focus entirely on trading system.' };
    if (val < 65) return { label: 'GREED', color: 'text-amber-400', desc: 'Fomo rising. Avoid chasing high candles.' };
    return { label: 'EXTREME GREED', color: 'text-rose-500 glow-text-gold', desc: 'Overleveraging warning. Step away from terminal.' };
  };

  const status = getStatus(fearGreed);

  return (
    <div className="w-full h-full bg-[#030812] border border-glass-border rounded-lg overflow-hidden flex flex-col font-sans text-xs">
      <div className="flex justify-between items-center bg-[#070e1b] px-3 py-2 border-b border-glass-border">
        <span className="font-mono font-bold text-slate-300">Psychology Monitor</span>
        <span className="flex items-center gap-1 text-[10px] text-neon-green font-mono">
          <Brain className="h-3.5 w-3.5 text-neon-green" /> DISCIPLINE TRACKER
        </span>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        {/* Fear & Greed dial representation */}
        <div className="space-y-2 text-center">
          <div className="text-[10px] text-slate-500 font-mono tracking-wider">FEAR & GREED INDEX</div>
          <div className="relative flex items-center justify-center h-20">
            {/* Semicircle dial track */}
            <div className="absolute w-32 h-16 border-t-[8px] border-l-[8px] border-r-[8px] border-slate-800 rounded-t-full top-4" />
            <div className="absolute text-2xl font-bold font-mono text-slate-100 top-8">{fearGreed}</div>
            
            {/* Dial hand indicator */}
            <div
              className="absolute w-12 h-1 bg-neon-green origin-right right-[50%] top-[48px] transition-transform duration-700"
              style={{ transform: `rotate(${(fearGreed / 100) * 180}deg)` }}
            />
          </div>
          <div className={`font-mono font-bold text-[11px] ${status.color}`}>
            {status.label}
          </div>
        </div>

        {/* State description */}
        <div className="bg-slate-950/60 border border-glass-border p-2.5 rounded text-[10px] leading-relaxed text-slate-400">
          <div className="flex items-center gap-1 font-semibold text-slate-200 mb-0.5">
            <Smile className="h-3.5 w-3.5 text-neon-green" /> State Analysis
          </div>
          {status.desc}
        </div>

        {/* Action item list */}
        <div className="space-y-1 text-[9px] text-slate-500 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="h-1 w-1 bg-neon-green rounded-full" /> JOURNAL TO SUPPRESS FOMO
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1 w-1 bg-neon-green rounded-full" /> STOP REVENGE TRADING TRIGGERS
          </div>
        </div>
      </div>
    </div>
  );
}
