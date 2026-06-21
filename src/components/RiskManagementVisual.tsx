'use client';

import React, { useState } from 'react';
import { Percent, Shield, AlertTriangle } from 'lucide-react';

export default function RiskManagementVisual() {
  const [balance, setBalance] = useState(1000);
  const [riskPercent, setRiskPercent] = useState(2);
  const [riskReward, setRiskReward] = useState(2.5);

  const riskAmount = (balance * (riskPercent / 100)).toFixed(2);
  const targetProfit = (Number(riskAmount) * riskReward).toFixed(2);

  return (
    <div className="w-full h-full bg-[#030812] border border-glass-border rounded-lg overflow-hidden flex flex-col font-sans text-xs">
      <div className="flex justify-between items-center bg-[#070e1b] px-3 py-2 border-b border-glass-border">
        <span className="font-mono font-bold text-slate-300">Risk Manager Widget</span>
        <span className="flex items-center gap-1 text-[10px] text-gold-vip font-mono">
          <Shield className="h-3.5 w-3.5 text-gold-vip" /> SMART SIZING
        </span>
      </div>

      <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
        {/* Account balance slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Account Balance</span>
            <span className="font-mono text-neon-green font-bold">${balance}</span>
          </div>
          <input
            type="range"
            min="100"
            max="10000"
            step="100"
            value={balance}
            onChange={(e) => setBalance(Number(e.target.value))}
            className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-neon-green"
          />
        </div>

        {/* Risk percentage slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Risk per Trade</span>
            <span className="font-mono text-slate-200 font-bold">{riskPercent}%</span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            step="0.5"
            value={riskPercent}
            onChange={(e) => setRiskPercent(Number(e.target.value))}
            className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-neon-green"
          />
        </div>

        {/* Output metrics card */}
        <div className="grid grid-cols-2 gap-3 mt-1">
          <div className="bg-slate-950/80 border border-glass-border p-3 rounded">
            <div className="text-[10px] text-slate-500 font-mono">MAX RISK LOSS</div>
            <div className="text-sm font-bold font-mono text-rose-400 mt-1">-${riskAmount}</div>
          </div>
          <div className="bg-slate-950/80 border border-glass-border p-3 rounded">
            <div className="text-[10px] text-slate-500 font-mono">PROFIT TARGET</div>
            <div className="text-sm font-bold font-mono text-neon-green mt-1">+${targetProfit}</div>
          </div>
        </div>

        {/* Safe zones indicator */}
        <div className={`p-2.5 rounded border text-[10px] leading-relaxed ${riskPercent <= 2 ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-amber-950/20 border-amber-500/20 text-amber-400'}`}>
          <div className="flex items-center gap-1.5 font-bold mb-0.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {riskPercent <= 2 ? 'CONSERVATIVE RISK SIZE' : 'AGGRESSIVE RISK SIZE'}
          </div>
          <span>
            {riskPercent <= 2
              ? 'This size ensures portfolio survival over 50 consecutive losses.'
              : 'Reduce risk to under 2% to protect equity against random market noise.'}
          </span>
        </div>
      </div>
    </div>
  );
}
