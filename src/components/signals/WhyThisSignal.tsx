'use client';

import React from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';

export interface WhySignalInput {
  pair: string;
  direction?: string;
  confidence: number;
  risk?: string;
  strategy?: string;
  ofPattern?: { pattern?: string; icon?: string; desc?: string } | null;
  entryTime?: string | null;
  pairWinRate?: number | null;
}

export interface WhyReason {
  text: string;
  kind: 'good' | 'warn' | 'neutral';
}

const IST_PEAK = new Set([9, 10, 11, 13, 14, 15, 16, 19, 20, 21, 22]);
const IST_SHOULDER = new Set([7, 8, 12, 17, 18]);

export function buildWhyReasons(input: WhySignalInput): WhyReason[] {
  const reasons: WhyReason[] = [];
  const conf = Math.round(input.confidence || 0);
  const riskRaw = (input.risk || 'MEDIUM').toUpperCase();
  const dir = input.direction === 'PUT'
    ? 'downward'
    : input.direction === 'CALL'
      ? 'upward'
      : 'directional';

  if (input.ofPattern?.pattern && input.ofPattern.desc) {
    reasons.push({ text: `${input.ofPattern.pattern} — ${input.ofPattern.desc}`, kind: 'good' });
  } else if (input.ofPattern?.pattern) {
    reasons.push({ text: `${input.ofPattern.pattern} pressure pattern detected`, kind: 'good' });
  }

  if (conf >= 90) {
    reasons.push({ text: `Strong ${dir} momentum — engine confidence ${conf}%`, kind: 'good' });
  } else if (conf >= 85) {
    reasons.push({ text: `Favorable short-term momentum aligned with this setup (${conf}% confidence)`, kind: 'good' });
  } else if (conf >= 80) {
    reasons.push({ text: `Multiple indicators aligned — ${conf}% engine confidence`, kind: 'good' });
  } else {
    reasons.push({ text: `Moderate confluence — ${conf}% engine confidence`, kind: 'neutral' });
  }

  if (riskRaw === 'LOW') {
    reasons.push({ text: 'Low risk environment — volatility within acceptable range', kind: 'good' });
  } else if (riskRaw === 'MEDIUM') {
    reasons.push({ text: 'Medium risk environment — volatility within acceptable range', kind: 'warn' });
  } else {
    reasons.push({ text: 'Elevated volatility — trade with caution', kind: 'warn' });
  }

  if (input.pairWinRate != null && input.pairWinRate > 0) {
    if (input.pairWinRate >= 70) {
      reasons.push({ text: `Historical setup favorable on ${input.pair} (${input.pairWinRate}% past accuracy)`, kind: 'good' });
    } else if (input.pairWinRate >= 50) {
      reasons.push({ text: `${input.pair} historical performance neutral (${input.pairWinRate}%)`, kind: 'neutral' });
    } else {
      reasons.push({ text: `${input.pair} historical edge below par (${input.pairWinRate}%) — size carefully`, kind: 'warn' });
    }
  } else {
    reasons.push({ text: `First scans on ${input.pair} — baseline performance monitored`, kind: 'neutral' });
  }

  if (input.entryTime) {
    let istHour = 12;
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
    if (IST_PEAK.has(istHour)) {
      reasons.push({ text: 'Timing inside prime IST session window', kind: 'good' });
    } else if (IST_SHOULDER.has(istHour)) {
      reasons.push({ text: 'Timing inside standard IST session window', kind: 'neutral' });
    }
  }

  return reasons.slice(0, 4);
}

interface WhyThisSignalProps {
  input: WhySignalInput;
  className?: string;
}

export default function WhyThisSignal({ input, className = '' }: WhyThisSignalProps) {
  const reasons = buildWhyReasons(input);

  return (
    <div className={`rounded-2xl border border-glass-border bg-slate-950/40 p-5 space-y-4 ${className}`}>
      <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold tracking-widest text-neon-green uppercase">
        <Sparkles className="h-3.5 w-3.5" /> Why This Signal?
      </div>
      <ul className="space-y-2.5">
        {reasons.map((r, idx) => (
          <li key={idx} className="flex items-start gap-2 text-[11px] text-slate-300 leading-relaxed">
            {r.kind === 'good' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
            ) : r.kind === 'warn' ? (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <MinusCircle className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
            )}
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-[8px] font-mono text-slate-700 border-t border-glass-border/30 pt-2">
        REASONS ANALYZED IN REAL TIME FROM CURRENT MARKET DATA.
      </p>
    </div>
  );
}
