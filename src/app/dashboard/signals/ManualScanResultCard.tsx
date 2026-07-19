'use client';

import React from 'react';
import { ChevronUp, ChevronDown, RefreshCw, Clock, Radio, BarChart2, CheckCircle2 } from 'lucide-react';
import { ExecutionRecord } from '@/lib/forex-execution/types';

interface ManualScanResultCardProps {
  result: ExecutionRecord;
  clockTime: number;
  onRetry?: () => void;
}

type ScanStage = 'connecting' | 'fetching' | 'analyzing' | 'finalizing';

interface ScanStageDef {
  key: ScanStage;
  label: string;
  icon: React.ReactNode;
  timing: number;
}

const SCAN_STAGES: ScanStageDef[] = [
  { key: 'connecting', label: 'Connecting to Provider', icon: <Radio className="h-3.5 w-3.5" />, timing: 0 },
  { key: 'fetching', label: 'Fetching Market Data', icon: <RefreshCw className="h-3.5 w-3.5" />, timing: 2000 },
  { key: 'analyzing', label: 'Running Confluence Analysis', icon: <BarChart2 className="h-3.5 w-3.5" />, timing: 5000 },
  { key: 'finalizing', label: 'Finalizing Signal', icon: <CheckCircle2 className="h-3.5 w-3.5" />, timing: 8000 },
];

function getScanStageIdx(elapsed: number): number {
  let idx = 0;
  for (let i = SCAN_STAGES.length - 1; i >= 0; i--) {
    if (elapsed >= SCAN_STAGES[i].timing) {
      idx = i;
      break;
    }
  }
  return Math.min(idx + 1, SCAN_STAGES.length);
}

export const ManualScanResultCard = React.memo(function ManualScanResultCard({
  result,
  clockTime,
  onRetry,
}: ManualScanResultCardProps) {
  const isCall = result.direction === 'CALL';
  const isPut = result.direction === 'PUT';
  const isWait = result.direction === 'WAIT';

  const isRunning = result.status === 'SCANNING';
  const isWaitingEntry = result.status === 'WAITING_FOR_ENTRY';
  const isPending = result.status === 'PENDING';
  const isSettling = result.status === 'SETTLING';
  const isFailed = result.status === 'FAILED';
  const isNoTrade = result.status === 'NO TRADE';
  const isWin = result.status === 'WIN';
  const isLoss = result.status === 'LOSS';
  const isRefund = result.status === 'REFUND';

  const starsCount = Math.round(result.confidence / 20);
  const starsStr = '★'.repeat(starsCount) + '☆'.repeat(5 - starsCount);

  const entryMs = new Date(result.entryTime).getTime();
  const expiryMs = new Date(result.expiryTime).getTime();

  const secToEntry = Math.max(0, Math.ceil((entryMs - clockTime) / 1000));
  const diffSec = Math.max(0, Math.ceil((expiryMs - clockTime) / 1000));

  const countdownStr = (() => {
    if (isWaitingEntry) {
      const min = Math.floor(secToEntry / 60);
      const sec = secToEntry % 60;
      return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
    const min = Math.floor(diffSec / 60);
    const sec = diffSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  })();

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

  const scanElapsed = isRunning ? Math.floor((clockTime - result.scanStartedAt) / 1000) * 1000 : 9000;
  const scanStageIdx = isRunning ? getScanStageIdx(scanElapsed) : SCAN_STAGES.length;

  const isTerminal = isWin || isLoss || isRefund || isFailed || isNoTrade;
  const isEntryActive = isPending && entryMs <= clockTime;
  const decisionParamsDimmed = isTerminal || isWaitingEntry || isSettling;

  return (
    <div className={`backdrop-blur-xl rounded-2xl border p-6 space-y-6 text-sm text-left shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all duration-300 ${
      isCall 
        ? 'border-emerald-500/40 bg-slate-950/40 shadow-[0_0_30px_rgba(16,185,129,0.15)]' 
        : isPut 
          ? 'border-rose-500/40 bg-slate-950/40 shadow-[0_0_30px_rgba(244,63,94,0.15)]' 
          : 'border-slate-800 bg-slate-950/30'
    }`}>
      {/* Header Decision Block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-glass-border/30 pb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-50 tracking-wide flex items-center gap-2.5">
            {result.pair}
            <span className={`text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-sm transition-all ${
              isCall 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
                : isPut 
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]' 
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {isCall ? <ChevronUp className="h-4 w-4 inline-block align-middle animate-bounce mr-0.5" /> : isPut ? <ChevronDown className="h-4 w-4 inline-block align-middle animate-bounce mr-0.5" /> : null}
              {isCall ? 'CALL' : isPut ? 'PUT' : 'WAIT'}
            </span>
          </h2>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1.5 block">
            CONFLUENCE SIGNAL DIRECTIVE
          </span>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-wider">ENGINE VERSION</span>
          <span className="text-[10px] text-slate-300 font-bold">v{result.analysisEngine || '1.3'}</span>
        </div>
      </div>

      {/* Status Banner */}
      {isRunning ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-[11px] font-bold transition-all duration-300">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block animate-ping" />
            <span className="text-amber-400">SCANNING PIPELINE ACTIVE</span>
          </div>
          <div className="space-y-2 pl-1.5">
            {SCAN_STAGES.map((stage, idx) => {
              const isActive = idx === scanStageIdx;
              const isComplete = idx < scanStageIdx;
              return (
                <div key={stage.key} className={`flex items-center gap-2.5 text-[10px] transition-all duration-300 ${isActive ? 'text-amber-300' : isComplete ? 'text-emerald-400' : 'text-slate-600'}`}>
                  <span className={`w-4 flex justify-center ${isActive ? 'animate-pulse' : ''}`}>
                    {isComplete ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : isActive ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-300" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-700" />}
                  </span>
                  <span className="font-semibold">{stage.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : isWaitingEntry ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-400 font-bold flex items-center justify-between animate-pulse">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block animate-ping" />
            WAITING FOR NEXT CANDLE — ENTRY SCHEDULED
          </span>
        </div>
      ) : isPending ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-[11px] text-emerald-400 font-bold flex items-center justify-between animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.05)]">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-ping" />
            ENTRY ACTIVE — COUNTDOWN RUNNING
          </span>
        </div>
      ) : isSettling ? (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-[11px] font-bold flex items-center justify-between animate-pulse">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block animate-ping" />
            VERIFYING CANDLE CLOSE... PLEASE WAIT
          </span>
        </div>
      ) : isFailed ? (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-[11px] font-bold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block animate-pulse" />
            SCAN PIPELINE FAILURE: {result.noTradeReason || 'TIMEOUT / DISCONNECT'}
          </span>
          {onRetry && (
            <button onClick={onRetry} className="px-3 py-1 rounded bg-rose-700 text-white font-extrabold uppercase text-[9px] hover:bg-rose-600 cursor-pointer transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30">
              Retry
            </button>
          )}
        </div>
      ) : isNoTrade ? (
        <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-4 text-[11px] text-slate-400 font-bold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
            NO TRADE — {result.noTradeReason || 'No setup detected'}
          </span>
        </div>
      ) : isWin ? (
        <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-4 text-[11px] font-bold flex items-center justify-between shadow-[0_0_15px_rgba(16,185,129,0.1)]">
          <span className="flex items-center gap-2 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            OUTCOME: WIN
          </span>
        </div>
      ) : isLoss ? (
        <div className="bg-rose-500/15 border border-rose-500/30 rounded-xl p-4 text-[11px] font-bold flex items-center justify-between shadow-[0_0_15px_rgba(244,63,94,0.1)]">
          <span className="flex items-center gap-2 text-rose-400">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            OUTCOME: LOSS
          </span>
        </div>
      ) : isRefund ? (
        <div className="bg-slate-500/15 border border-slate-800 rounded-xl p-4 text-[11px] font-bold flex items-center justify-between">
          <span className="flex items-center gap-2 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
            REFUND — ENTRY PRICE EQUAL TO EXIT PRICE
          </span>
        </div>
      ) : null}

      {!isTerminal && !isFailed && (
        <>
          {/* Decision Parameters */}
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4.5 ${decisionParamsDimmed ? 'opacity-40 select-none pointer-events-none' : ''}`}>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 text-left shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Confidence</span>
              <span className="text-sm font-extrabold text-amber-400 mt-2 block tracking-wider">{starsStr}</span>
              <span className="text-[8px] text-slate-400 font-bold mt-1.5 block">{result.confidence}% Probability</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 text-left shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Trend Strength</span>
              <span className="text-xs font-extrabold text-slate-300 mt-2 block tracking-wider">
                {(() => {
                  const score = result.trendStrength || result.qualityScore || 70;
                  const filled = Math.round(score / 10);
                  return '█'.repeat(filled) + '░'.repeat(10 - filled);
                })()}
              </span>
              <span className="text-[8px] text-slate-400 font-bold mt-1.5 block">INDEX: {result.trendStrength || result.qualityScore}%</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 text-left shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Market Bias</span>
              <span className={`text-xs font-extrabold mt-2 block uppercase tracking-wide ${isCall ? 'text-emerald-400' : isPut ? 'text-rose-400' : 'text-slate-400'
                }`}>{result.marketBias}</span>
              <span className="text-[8px] text-slate-400 font-bold mt-1.5 block">DIRECTIONS ALIGNED</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 text-left shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">{isWaitingEntry ? 'Next Candle Entry' : 'Current Trade'}</span>
              <span className={`text-xs font-extrabold mt-2 block uppercase tracking-wide ${
                isWaitingEntry
                  ? (secToEntry <= 10 ? 'text-rose-400 animate-pulse' : 'text-amber-400 animate-pulse')
                  : (diffSec > 0 && isEntryActive)
                    ? (diffSec <= 10 ? 'text-rose-400 animate-pulse' : 'text-yellow-400 animate-pulse')
                    : 'text-slate-500 font-bold'
                }`}>
                {isWaitingEntry
                  ? `Starts in ${countdownStr}`
                  : (diffSec > 0 && isEntryActive)
                    ? `Remaining ${countdownStr}`
                    : 'EXPIRED'}
              </span>
              <span className="text-[8px] text-slate-400 font-bold mt-1.5 block">NEXT CANDLE LIMIT</span>
            </div>
          </div>

          {/* Trade Times */}
          <div className={`bg-[#020617]/50 border border-slate-900 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 ${decisionParamsDimmed ? 'opacity-40 select-none pointer-events-none' : ''}`}>
            <div>
              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">ENTRY CANDLE</span>
              <span className="text-xs font-extrabold text-slate-200 mt-1.5 block">{formattedTimes.entry}</span>
            </div>
            <div>
              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">EXPIRY TIME</span>
              <span className="text-xs font-extrabold text-rose-400 mt-1.5 block">{formattedTimes.expiry}</span>
            </div>
            <div>
              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">VALID FOR</span>
              <span className="text-xs font-extrabold text-slate-200 mt-1.5 block">NEXT CANDLE ONLY</span>
            </div>
            <div>
              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">{result.officialEntryPrice ? 'OFFICIAL ENTRY' : 'SCAN PRICE'}</span>
              <span className="text-xs font-extrabold text-slate-200 mt-1.5 block">
                {result.officialEntryPrice ? result.officialEntryPrice : `${result.entryPrice} (preliminary)`}
              </span>
            </div>
          </div>

          {/* Directive */}
          <div className={`p-4 rounded-xl border text-left text-xs ${
            isCall 
              ? 'bg-emerald-500/[0.03] border-emerald-500/10 text-slate-200' 
              : isPut 
                ? 'bg-rose-500/[0.03] border-rose-500/10 text-slate-200' 
                : 'bg-slate-900/40 border-slate-800 text-slate-300'
          } ${decisionParamsDimmed ? 'opacity-40 select-none pointer-events-none' : ''}`}>
            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block mb-1.5">Recommendation Directive</span>
            <span className="text-xs leading-relaxed">{result.recommendationText}</span>
          </div>

          {/* Checklist */}
          <div className={`space-y-3.5 border-t border-glass-border/30 pt-5 text-left ${decisionParamsDimmed ? 'opacity-40 select-none pointer-events-none' : ''}`}>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-bold">Analysis Confluence Checklist</span>
            {isWait && (
              <div className="text-[11px] text-amber-400/90 font-bold leading-relaxed border border-amber-500/20 bg-amber-500/[0.02] p-3 rounded-lg">
                WAIT: Current market conditions do not satisfy the confluence requirements.
              </div>
            )}
            <div className="space-y-2 mt-3">
              {result.reasons.map((reason, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs">
                  <span className={`font-bold shrink-0 text-sm leading-none ${reason.checked ? 'text-emerald-400' : 'text-slate-600'}`}>
                    {reason.checked ? '✓' : '✗'}
                  </span>
                  <span className={reason.checked ? 'text-slate-200' : 'text-slate-500'}>
                    <span className="font-bold text-[10px] text-slate-400 mr-2">{reason.label}:</span>
                    {reason.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Indicators */}
          <div className="space-y-3 font-mono text-xs border-t border-glass-border/30 pt-4">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2.5 font-bold">Raw Indicator Values</span>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
              <div className="flex justify-between border-b border-slate-900 pb-2 hover:bg-slate-900/30 hover:px-1.5 transition-all duration-150 rounded">
                <span className="text-slate-500">RSI (14):</span>
                <span className="text-slate-200 font-semibold">{result.indicators.rsi?.toFixed(2) ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-2 hover:bg-slate-900/30 hover:px-1.5 transition-all duration-150 rounded">
                <span className="text-slate-500">Stoch %K / %D:</span>
                <span className="text-slate-200 font-semibold">{result.indicators.stochK?.toFixed(2) ?? 'N/A'} / {result.indicators.stochD?.toFixed(2) ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-2 hover:bg-slate-900/30 hover:px-1.5 transition-all duration-150 rounded">
                <span className="text-slate-500">CCI (14):</span>
                <span className="text-slate-200 font-semibold">{result.indicators.cci?.toFixed(2) ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-2 hover:bg-slate-900/30 hover:px-1.5 transition-all duration-150 rounded">
                <span className="text-slate-500">ATR (14):</span>
                <span className="text-slate-200 font-semibold">{result.indicators.atr?.toFixed(5) ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-2 hover:bg-slate-900/30 hover:px-1.5 transition-all duration-150 rounded">
                <span className="text-slate-500">SuperTrend:</span>
                <span className="text-slate-200 font-semibold">{result.indicators.supertrendDirection === 1 ? 'BULLISH' : 'BEARISH'} ({result.indicators.supertrend?.toFixed(5) ?? 'N/A'})</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-2 hover:bg-slate-900/30 hover:px-1.5 transition-all duration-150 rounded">
                <span className="text-slate-500">Wicks (U/L/B):</span>
                <span className="text-slate-200 font-semibold">U:{result.indicators.upperWick.toFixed(5)} / L:{result.indicators.lowerWick.toFixed(5)} / B:{result.indicators.bodySize.toFixed(5)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
