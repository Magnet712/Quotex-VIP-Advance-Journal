'use client';

import React from 'react';
import { Lock, ChevronUp, ChevronDown, Activity, Eye } from 'lucide-react';

interface SignalCardPair {
  symbol: string; short: string; base: number; pip: number; vol: string;
}

type SignalStatus = 'ACTIVE' | 'SCANNING' | 'NO_SIGNAL' | 'LOADING_NEXT';

interface PairSignal {
  pair: string;
  direction: 'CALL' | 'PUT';
  confidence: number;
  strategy: string;
  entry_price?: number;
  expiry_time?: string;
  entryPrice?: number;
  expiryTime?: string;
  strategy_version?: string;
  quality_score?: number;
  is_premium?: boolean;
  blockedReason?: string;
  risk?: string;
}

interface PairSignalState {
  signal: PairSignal | null;
  status: SignalStatus;
  expiresIn: number;
  generatedAt: string;
}

interface SignalCardProps {
  pair: SignalCardPair;
  ps: PairSignalState;
  hasAccess: boolean;
  onClick: () => void;
}

export const SignalCard = React.memo(function SignalCard({
  pair,
  ps,
  hasAccess,
  onClick
}: SignalCardProps) {
  const isActive = ps.status === 'ACTIVE' && ps.signal;
  const isScanning = ps.status === 'SCANNING';
  const isLoadingNext = ps.status === 'LOADING_NEXT';
  const sig = ps.signal;
  const isCall = sig?.direction === 'CALL';

  const borderColor = !isActive && !isLoadingNext
    ? 'border-glass-border'
    : isCall
      ? 'border-neon-green/25 shadow-[0_0_20px_rgba(0,230,118,0.04)]'
      : 'border-rose-500/25 shadow-[0_0_20px_rgba(239,68,68,0.04)]';

  return (
    <div
      onClick={isActive ? onClick : undefined}
      className={`glass-panel glass-panel-hover rounded-xl border transition-all duration-300 overflow-hidden relative ${borderColor} ${isActive ? 'cursor-pointer hover:scale-[1.01]' : ''}`}
    >

      {/* Blurred overlay locker for standard/Free users */}
      {isActive && !hasAccess && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/85 backdrop-blur-[2px] rounded-xl text-center space-y-3.5 z-10 font-mono">
          <div className="p-2.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Lock className="h-4.5 w-4.5" />
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">Premium Access Required</div>
            <p className="text-[8px] text-slate-500 max-w-[200px] leading-relaxed">
              Upgrade to unlock directional indicators, entry positions, and confluence counts.
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { requestedPlan: 'premium' } }));
            }}
            className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-[9px] uppercase tracking-wider transition-colors shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-green/30"
          >
            Upgrade Now
          </button>
        </div>
      )}

      {/* Card Header */}
      <div className={`px-4 pt-4 pb-3 flex items-start justify-between ${isActive ? (isCall ? 'bg-neon-green/[0.02]' : 'bg-rose-500/[0.02]') : ''}`}>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold font-mono text-slate-100 tracking-wider">
              {pair.symbol}
            </span>
            <span className="text-[8px] font-mono text-slate-600 border border-slate-800 px-1.5 py-0.5 rounded font-bold">OTC</span>
          </div>
          <div className="text-[9px] font-mono text-slate-600">
            VOLATILITY: <span className="text-slate-400 font-bold uppercase">{pair.vol}</span>
          </div>
        </div>

        {/* Status badges */}
        {isActive ? (
          <div className="flex flex-col items-end gap-1">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border ${isCall ? 'bg-neon-green/10 border-neon-green/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
              <div className={`h-1.5 w-1.5 rounded-full bg-neon-green animate-pulse`} />
              <span className={`text-[9px] font-mono font-bold tracking-wider ${isCall ? 'text-neon-green' : 'text-rose-400'}`}>
                LIVE
              </span>
            </div>
          </div>
        ) : isLoadingNext ? (
          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded border border-neon-green/20 bg-neon-green/5">
            <span className="text-[9px] font-mono font-bold text-neon-green animate-pulse">NEXT</span>
          </div>
        ) : isScanning ? (
          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded border border-slate-800 bg-slate-900/40">
            <span className="text-[9px] font-mono font-bold text-amber-400 animate-pulse">SCAN</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded border border-slate-900 bg-slate-950/20">
            <span className="text-[9px] font-mono font-bold text-slate-600">WAIT</span>
          </div>
        )}
      </div>

      {/* Card Body */}
      {isActive && sig ? (
        <div className={`px-4 pb-4 space-y-3.5 ${!hasAccess ? 'blur-[3px] select-none pointer-events-none' : ''}`}>

          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border ${isCall ? 'bg-neon-green/5 border-neon-green/15 text-neon-green' : 'bg-rose-500/5 border-rose-500/15 text-rose-400'}`}>
              {isCall ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              <span className="text-sm font-extrabold font-mono tracking-wider">
                {hasAccess ? sig.direction : 'LOCK'}
              </span>
            </div>

            <div className="text-right font-mono">
              <div className="text-[8px] text-slate-600 tracking-wider">CONFIDENCE</div>
              <div className="text-lg font-extrabold text-slate-200 mt-1">
                {hasAccess ? `${sig.confidence}%` : '••%'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-[#020617]/50 rounded p-2.5 border border-glass-border/30">
              <div className="text-[8px] text-slate-600 tracking-wider">ENTRY PRICE</div>
              <div className="text-xs font-bold text-slate-200 mt-1">
                {hasAccess ? sig.entryPrice : '•.••••'}
              </div>
            </div>
            <div className="bg-[#020617]/50 rounded p-2.5 border border-glass-border/30">
              <div className="text-[8px] text-slate-600 tracking-wider">EXPIRY TIME</div>
              <div className="text-xs font-bold text-gold-vip mt-1">1 MINUTE</div>
            </div>
          </div>
        </div>
      ) : isScanning ? (
        <div className="px-4 pb-4 pt-1 flex flex-col items-center justify-center py-6 gap-2">
          <Activity className="h-5 w-5 text-amber-500 animate-spin" />
          <div className="text-[9px] font-mono text-amber-400">ANALYSING INDICATORS...</div>
        </div>
      ) : (
        <div className="px-4 pb-5 pt-1 flex flex-col items-center justify-center py-5 gap-1.5 opacity-30">
          <Eye className="h-5 w-5 text-slate-700 animate-pulse-soft" />
          <span className="text-[9px] font-mono text-slate-600 tracking-wider">AWAITING TRIGGER</span>
        </div>
      )}

    </div>
  );
});
