'use client';

import React, { useId } from 'react';
import {
  ShieldCheck, TrendingUp, Timer, BarChart3, AlertTriangle, Sparkles
} from 'lucide-react';

export interface AIScoreInput {
  pair: string;
  confidence: number;
  risk?: string;
  strategy?: string;
  entryTime?: string | null;
  pairWinRate?: number | null;
  qualityScore?: number | null;
  result?: string;
}

export interface AIScoreBreakdown {
  overall: number;
  signalStrength: number;
  marketConditions: number;
  timingQuality: number;
  pairPerformance: number;
  riskScore: number;
  riskLabel: string;
  pairHasHistory: boolean;
  hourLabel: string;
}

const IST_PEAK = new Set([9, 10, 11, 13, 14, 15, 16, 19, 20, 21, 22]);
const IST_SHOULDER = new Set([7, 8, 12, 17, 18]);

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function round(v: number) {
  return Math.round(v);
}

export function computeAIScore(input: AIScoreInput): AIScoreBreakdown {
  const conf = clamp(Math.round(input.confidence || 0), 1, 99);
  const riskRaw = (input.risk || 'MEDIUM').toUpperCase();
  const riskScore = riskRaw === 'LOW' ? 95 : riskRaw === 'HIGH' ? 62 : 80;
  const riskLabel = riskRaw === 'LOW' ? 'Low' : riskRaw === 'HIGH' ? 'High' : 'Medium';

  let istHour = 12;
  if (input.entryTime) {
    try {
      istHour = parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false })
          .format(new Date(input.entryTime)),
        10
      );
      if (istHour === 24) istHour = 0;
    } catch {
      istHour = 12;
    }
  }

  const hourAdj = IST_PEAK.has(istHour) ? 3 : IST_SHOULDER.has(istHour) ? 0 : -5;
  const hourLabel = IST_PEAK.has(istHour)
    ? 'PRIME IST SESSION'
    : IST_SHOULDER.has(istHour)
      ? 'SESSION WINDOW'
      : 'OFF-HOUR WINDOW';

  const quality = input.qualityScore != null ? clamp(Math.round(input.qualityScore), 1, 99) : conf;

  const signalStrength = conf;
  const marketConditions = clamp(
    round(0.75 * conf + 0.25 * quality + (riskRaw === 'LOW' ? 3 : riskRaw === 'HIGH' ? -4 : 0) + hourAdj),
    30, 99
  );
  const timingQuality = clamp(
    round(conf - 3 + hourAdj + (riskRaw === 'LOW' ? 1 : 0)),
    30, 99
  );

  const pairHasHistory = input.pairWinRate != null && input.pairWinRate > 0;
  const pairPerformance = pairHasHistory ? clamp(round(input.pairWinRate!), 30, 99) : 70;

  const overall = clamp(
    round(signalStrength * 0.3 + marketConditions * 0.25 + timingQuality * 0.2 + pairPerformance * 0.25),
    1, 99
  );

  return {
    overall,
    signalStrength,
    marketConditions,
    timingQuality,
    pairPerformance,
    riskScore,
    riskLabel,
    pairHasHistory,
    hourLabel,
  };
}

function scoreColor(score: number) {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 70) return 'text-amber-400';
  return 'text-rose-400';
}

function barColor(score: number) {
  if (score >= 85) return 'from-emerald-500/80 to-emerald-400';
  if (score >= 70) return 'from-amber-500/80 to-amber-400';
  return 'from-rose-500/80 to-rose-400';
}

interface AIScorecardProps {
  input: AIScoreInput;
  className?: string;
}

export default function AIScorecard({ input, className = '' }: AIScorecardProps) {
  const b = computeAIScore(input);
  const gradId = `aiScoreGrad-${useId().replace(/:/g, '')}`;
  const R = 34;
  const C = 2 * Math.PI * R;
  const dash = (b.overall / 100) * C;

  const rows: { label: string; icon: React.ReactNode; value: number; note: string }[] = [
    {
      label: 'Market Conditions',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      value: b.marketConditions,
      note: b.hourLabel,
    },
    {
      label: 'Signal Strength',
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      value: b.signalStrength,
      note: input.strategy ? input.strategy.toUpperCase() : 'ENGINE CONFIDENCE',
    },
    {
      label: 'Timing Quality',
      icon: <Timer className="h-3.5 w-3.5" />,
      value: b.timingQuality,
      note: b.hourLabel,
    },
    {
      label: 'Historical Pair Performance',
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
      value: b.pairPerformance,
      note: b.pairHasHistory
        ? `${input.pair} PRIOR RESULTS`
        : 'NO PRIOR HISTORY — BASELINE',
    },
    {
      label: 'Risk Level',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      value: b.riskScore,
      note: b.riskLabel.toUpperCase(),
    },
  ];

  return (
    <div className={`rounded-2xl border border-glass-border bg-slate-950/40 p-5 space-y-5 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[9px] font-mono font-bold tracking-widest text-purple-400 uppercase">
          <Sparkles className="h-3.5 w-3.5" /> AI Trade Score
        </span>
        <span className="text-[8px] font-mono text-slate-600 uppercase font-bold">{input.pair}</span>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
            <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="7" />
            <circle
              cx="40" cy="40" r={R} fill="none"
              stroke={`url(#${gradId})`} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${dash} ${C - dash}`}
              className="transition-all duration-700"
            />
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={b.overall >= 85 ? '#10b981' : b.overall >= 70 ? '#f59e0b' : '#f43f5e'} />
                <stop offset="100%" stopColor={b.overall >= 85 ? '#34d399' : b.overall >= 70 ? '#fbbf24' : '#fb7185'} />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-extrabold font-mono ${scoreColor(b.overall)}`}>{b.overall}</span>
            <span className="text-[7px] font-mono text-slate-600 tracking-widest">/ 100</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold">AI TRADE SCORE</div>
          <div className={`text-sm font-mono font-extrabold tracking-wide ${scoreColor(b.overall)}`}>
            {b.overall >= 85 ? 'HIGH PROBABILITY SETUP' : b.overall >= 70 ? 'MODERATE SETUP' : 'CAUTION SETUP'}
          </div>
          <p className="text-[9px] text-slate-500 leading-relaxed max-w-[240px]">
            Why AI selected this {input.pair} trade — derived from stored signal metrics.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                {row.icon} {row.label}
              </span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-[7px] font-mono text-slate-600 tracking-wider truncate hidden sm:inline">
                  {row.note}
                </span>
                <span className={`text-[10px] font-mono font-extrabold ${scoreColor(row.value)}`}>{row.value}</span>
              </span>
            </div>
            <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${barColor(row.value)} transition-all duration-700`}
                style={{ width: `${row.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-[8px] font-mono text-slate-700 leading-relaxed border-t border-glass-border/30 pt-3">
        COMPOSITE WEIGHTING: STRENGTH 30% · MARKET 25% · TIMING 20% · PAIR HISTORY 25%. RISK FROM STORED METRICS.
      </p>
    </div>
  );
}
