'use client';

/**
 * DiscountCountdown — client-side ticking countdown for pricing page.
 *
 * Rules:
 *  - Only renders when discount > 0 AND endsAt is in the future.
 *  - Silently disappears (returns null) when timer reaches 0.
 *  - Pure presentational: no DB reads, no side effects.
 */

import React, { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

interface Props {
  /** ISO timestamp string (UTC) for when the discount expires */
  endsAt: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calcTimeLeft(endsAt: string): TimeLeft | null {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return null;

  const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
}

export default function DiscountCountdown({ endsAt }: Props) {
  // Start null so server renders nothing — client fills in after hydration (no mismatch)
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    setTimeLeft(calcTimeLeft(endsAt));

    const interval = setInterval(() => {
      const t = calcTimeLeft(endsAt);
      setTimeLeft(t);
      if (!t) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [endsAt]);

  if (!timeLeft) return null;

  const pad = (n: number) => String(n).padStart(2, '0');

  const units = [
    { label: 'D', value: pad(timeLeft.days) },
    { label: 'H', value: pad(timeLeft.hours) },
    { label: 'M', value: pad(timeLeft.minutes) },
    { label: 'S', value: pad(timeLeft.seconds) },
  ];

  return (
    <div className="mt-2 rounded-lg border border-rose-500/25 bg-rose-500/5 px-3 py-2.5">
      {/* Header row */}
      <div className="flex items-center gap-1.5 mb-2">
        <Timer className="h-3 w-3 text-rose-400 shrink-0" />
        <span className="text-[9px] font-mono font-bold text-rose-400 uppercase tracking-widest">
          Offer Ends In
        </span>
      </div>

      {/* Countdown tiles */}
      <div className="flex items-center gap-1.5">
        {units.map((u, i) => (
          <React.Fragment key={u.label}>
            <div className="flex flex-col items-center min-w-[36px]">
              <span
                className="text-sm font-extrabold font-mono text-rose-300 tabular-nums leading-none"
                aria-live="polite"
                aria-label={`${u.value} ${u.label}`}
              >
                {u.value}
              </span>
              <span className="text-[7px] text-rose-500/70 font-mono tracking-wider mt-0.5">
                {u.label}
              </span>
            </div>
            {/* Separator between tiles (not after last) */}
            {i < units.length - 1 && (
              <span className="text-rose-500/50 font-bold text-xs mb-1 select-none">:</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
