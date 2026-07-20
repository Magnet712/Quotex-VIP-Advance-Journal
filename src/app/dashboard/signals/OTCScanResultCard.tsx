'use client';

import React from 'react';
import { OTCExecutionRecord } from '@/lib/otc/otc-execution-types';
import {
  ChevronUp, ChevronDown, Minus, CheckCircle2, XCircle,
  Clock, Loader, Activity, Zap
} from 'lucide-react';

interface OTCScanResultCardProps {
  result: OTCExecutionRecord;
  clockTime: number;
  onDismiss?: () => void;
}

function getCountdown(entryTime: string, expiryTime: string, clockTime: number, status: string): string {
  const now = clockTime;
  const entryMs = new Date(entryTime).getTime();
  const expiryMs = new Date(expiryTime).getTime();

  if (status === 'SCANNING') return 'Analyzing...';
  if (status === 'SETTLING') return 'Waiting for candle close...';
  if (status === 'FAILED' || status === 'NO_TRADE' || status === 'WIN' || status === 'LOSS' || status === 'REFUND') return '';

  if (now < entryMs) {
    const secs = Math.max(0, Math.floor((entryMs - now) / 1000));
    const min = Math.floor(secs / 60);
    const s = secs % 60;
    return `${min.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  if (now < expiryMs) {
    const secs = Math.max(0, Math.floor((expiryMs - now) / 1000));
    const min = Math.floor(secs / 60);
    const s = secs % 60;
    return `${min.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return 'Updating...';
}

const OTCScanResultCard: React.FC<OTCScanResultCardProps> = React.memo(({ result, clockTime, onDismiss }) => {
  const isCall = result.direction === 'CALL';
  const isPut = result.direction === 'PUT';
  const isWait = result.direction === 'WAIT';
  const isScanning = result.status === 'SCANNING';
  const isWaitingEntry = result.status === 'WAITING_FOR_ENTRY';
  const isPending = result.status === 'PENDING';
  const isSettling = result.status === 'SETTLING';
  const isFailed = result.status === 'FAILED';
  const isNoTrade = result.status === 'NO_TRADE';
  const isWin = result.status === 'WIN';
  const isLoss = result.status === 'LOSS';
  const isRefund = result.status === 'REFUND';
  const isTerminal = isWin || isLoss || isRefund;
  const decisionParamsDimmed = isTerminal || isWaitingEntry || isSettling || isFailed || isNoTrade;

  const starsCount = Math.round(result.confidence / 20);
  const starsStr = '★'.repeat(starsCount) + '☆'.repeat(5 - starsCount);
  const countdown = getCountdown(result.entryTime, result.expiryTime, clockTime, result.status);

  const formattedTimes = (() => {
    try {
      const entryDate = new Date(result.entryTime);
      const expiryDate = new Date(result.expiryTime);
      return {
        entry: new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(entryDate),
        expiry: new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(expiryDate),
      };
    } catch {
      return { entry: 'N/A', expiry: 'N/A' };
    }
  })();

  return (
    <div className={`backdrop-blur-xl glow-halo rounded-2xl border p-6 space-y-6 text-sm text-left shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all duration-300 ${
      isWin 
        ? 'border-emerald-500/40 bg-slate-950/40 glow-shadow-green' 
        : isLoss 
          ? 'border-rose-500/40 bg-slate-950/40 glow-shadow-red'
          : isCall 
            ? 'border-emerald-500/40 bg-slate-950/40 glow-shadow-green' 
            : isPut 
              ? 'border-rose-500/40 bg-slate-950/40 glow-shadow-red' 
              : 'border-slate-800 bg-slate-950/30'
    }`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-glass-border/30 pb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-extrabold text-slate-50 tracking-wide flex items-center gap-2.5">
            {result.pair}
            <span className={`text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-sm transition-all ${
              isCall 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 glow-shadow-green' 
                : isPut 
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 glow-shadow-red' 
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {isCall ? <ChevronUp className="h-4 w-4 inline-block align-middle animate-bounce mr-0.5" /> : isPut ? <ChevronDown className="h-4 w-4 inline-block align-middle animate-bounce mr-0.5" /> : null}
              {result.direction}
            </span>
          </h2>
          <span className="text-[8px] font-mono text-slate-600 border border-slate-800 px-2 py-0.5 rounded font-bold">OTC</span>
        </div>
        <button onClick={onDismiss} className="text-slate-600 hover:text-slate-400 text-sm transition-colors">✕</button>
      </div>

      {/* Status Banners */}
      {isScanning && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-[11px] font-bold">
          <div className="flex items-center gap-2">
            <Loader className="h-4 w-4 animate-spin text-amber-400" />
            <span className="text-amber-400">SCANNING PIPELINE ACTIVE</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 ml-6">Analyzing OTC market data...</div>
        </div>
      )}

      {isWaitingEntry && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-400 font-bold flex items-center justify-between animate-pulse">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block animate-ping" />
            WAITING FOR ENTRY — {countdown}
          </span>
        </div>
      )}

      {isPending && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-[11px] text-emerald-400 font-bold flex items-center justify-between animate-pulse glow-shadow-green">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-ping" />
            ACTIVE — PENDING EXPIRY • {countdown}
          </span>
        </div>
      )}

      {isSettling && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-[11px] font-bold flex items-center justify-between animate-pulse">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 animate-pulse text-yellow-400" />
            <span className="text-yellow-400">VERIFYING CANDLE CLOSE... PLEASE WAIT</span>
          </span>
        </div>
      )}

      {isFailed && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-[11px] font-bold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-rose-400" />
            <span className="text-rose-400">SCAN PIPELINE FAILURE: {result.noTradeReason || 'TIMEOUT / DISCONNECT'}</span>
          </span>
        </div>
      )}

      {isNoTrade && (
        <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-4 text-[11px] text-slate-400 font-bold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Minus className="h-4 w-4 text-slate-400" />
            NO TRADE — {result.noTradeReason || 'No setup detected'}
          </span>
        </div>
      )}

      {isWin && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-4 text-[11px] font-bold flex items-center justify-between glow-shadow-green">
          <span className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            OUTCOME: WIN — Entry: {result.entryPrice} | Expiry: {result.expiryPrice || '—'}
          </span>
        </div>
      )}

      {isLoss && (
        <div className="bg-rose-500/15 border border-rose-500/30 rounded-xl p-4 text-[11px] font-bold flex items-center justify-between glow-shadow-red">
          <span className="flex items-center gap-2 text-rose-400">
            <XCircle className="h-5 w-5 text-rose-400" />
            OUTCOME: LOSS — Entry: {result.entryPrice} | Expiry: {result.expiryPrice || '—'}
          </span>
        </div>
      )}

      {isRefund && (
        <div className="bg-slate-500/15 border border-slate-800 rounded-xl p-4 text-[11px] font-bold flex items-center justify-between">
          <span className="flex items-center gap-2 text-slate-400">
            <Clock className="h-4 w-4 text-slate-400" />
            REFUND — INSUFFICIENT DATA FOR SETTLEMENT
          </span>
        </div>
      )}

      {/* Decision Parameters (non-terminal) */}
      {!isTerminal && !isFailed && (
        <>
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4.5 ${decisionParamsDimmed ? 'opacity-40 select-none pointer-events-none' : ''}`}>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 text-left shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Confidence</span>
              <span className="text-sm font-extrabold text-amber-400 mt-2 block tracking-wider">{starsStr}</span>
              <span className="text-[8px] text-slate-400 font-bold mt-1.5 block">{result.confidence}% Probability</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 text-left shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Strategy</span>
              <span className="text-xs font-extrabold text-slate-300 mt-2 block uppercase tracking-wider">{result.strategy}</span>
              <span className="text-[8px] text-slate-400 font-bold mt-1.5 block">CONFLUENCE STRATEGY</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 text-left shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Risk Level</span>
              <span className={`text-xs font-extrabold mt-2 block uppercase tracking-wide ${
                result.risk === 'LOW' ? 'text-emerald-400' : result.risk === 'MEDIUM' ? 'text-amber-400' : 'text-rose-400'
              }`}>
                <Zap className="h-3.5 w-3.5 inline-block align-middle mr-0.5" />
                {result.risk}
              </span>
              <span className="text-[8px] text-slate-400 font-bold mt-1.5 block">RISK ASSESSMENT</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 text-left shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">{isWaitingEntry ? 'Entry In' : 'Countdown'}</span>
              <span className={`text-xs font-extrabold mt-2 block uppercase tracking-wide ${
                countdown && (countdown.includes(':') && parseInt(countdown.split(':')[1]) <= 10) ? 'text-rose-400 animate-pulse' : 'text-amber-400 animate-pulse'
              }`}>
                {countdown || '—'}
              </span>
              <span className="text-[8px] text-slate-400 font-bold mt-1.5 block">REMAINING TIME</span>
            </div>
          </div>

          {/* Trade Times */}
          <div className={`bg-[#020617]/50 border border-slate-900 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-4 ${decisionParamsDimmed ? 'opacity-40 select-none pointer-events-none' : ''}`}>
            <div>
              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">ENTRY CANDLE</span>
              <span className="text-xs font-extrabold text-slate-200 mt-1.5 block">{formattedTimes.entry}</span>
            </div>
            <div>
              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">EXPIRY TIME</span>
              <span className="text-xs font-extrabold text-rose-400 mt-1.5 block">{formattedTimes.expiry}</span>
            </div>
            <div>
              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">ENTRY PRICE</span>
              <span className="text-xs font-extrabold text-slate-200 mt-1.5 block">{(result.officialEntryPrice || result.entryPrice).toFixed(5)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

OTCScanResultCard.displayName = 'OTCScanResultCard';
export default OTCScanResultCard;
