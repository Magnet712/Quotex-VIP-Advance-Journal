'use client';

import React, { useState, useEffect } from 'react';
import { Flame } from 'lucide-react';

interface Props {
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
  return {
    days:    Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours:   Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };
}

export default function DiscountCountdown({ endsAt }: Props) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    setTimeLeft(calcTimeLeft(endsAt));

    const interval = setInterval(() => {
      const t = calcTimeLeft(endsAt);
      setTimeLeft(t);
      // Flash pulse on every second tick
      setPulse(p => !p);
      if (!t) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [endsAt]);

  if (!timeLeft) return null;

  const pad = (n: number) => String(n).padStart(2, '0');

  const units = [
    { label: 'DAYS',    value: pad(timeLeft.days) },
    { label: 'HOURS',   value: pad(timeLeft.hours) },
    { label: 'MINS',    value: pad(timeLeft.minutes) },
    { label: 'SECS',    value: pad(timeLeft.seconds) },
  ];

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(220,38,38,0.08) 0%, rgba(168,85,247,0.08) 100%)',
        boxShadow: '0 0 24px 2px rgba(220,38,38,0.18), 0 0 8px 1px rgba(168,85,247,0.10), inset 0 0 16px rgba(220,38,38,0.06)',
        border: '1px solid rgba(220,38,38,0.40)',
        animation: 'countdownGlow 2s ease-in-out infinite alternate',
      }}
      className="my-2 rounded-xl px-4 py-3 relative overflow-hidden"
    >
      {/* Animated glow blob behind */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 0,
          background: 'radial-gradient(ellipse at 50% 120%, rgba(220,38,38,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-1.5 mb-2.5">
        <Flame
          className="h-3.5 w-3.5 text-rose-400"
          style={{ filter: 'drop-shadow(0 0 4px rgba(248,113,113,0.9))' }}
        />
        <span
          className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-rose-300"
          style={{ textShadow: '0 0 8px rgba(248,113,113,0.7)' }}
        >
          Limited Offer Ends In
        </span>
      </div>

      {/* Countdown tiles */}
      <div className="relative z-10 flex items-center gap-2">
        {units.map((u, i) => (
          <React.Fragment key={u.label}>
            {/* Tile */}
            <div className="flex flex-col items-center">
              <div
                style={{
                  background: 'linear-gradient(160deg, rgba(220,38,38,0.22) 0%, rgba(127,29,29,0.30) 100%)',
                  border: '1px solid rgba(248,113,113,0.35)',
                  boxShadow: '0 0 10px rgba(220,38,38,0.25), inset 0 1px 0 rgba(255,255,255,0.05)',
                  minWidth: '44px',
                  transition: 'box-shadow 0.4s ease',
                }}
                className="rounded-lg px-2 py-1.5 text-center"
              >
                <span
                  className="text-xl font-black font-mono tabular-nums leading-none text-rose-200"
                  style={{
                    textShadow: '0 0 12px rgba(248,113,113,0.9), 0 0 24px rgba(220,38,38,0.5)',
                    letterSpacing: '0.04em',
                  }}
                  aria-live="polite"
                >
                  {u.value}
                </span>
              </div>
              <span
                className="text-[7px] font-mono font-bold tracking-widest mt-1 text-rose-500/70"
              >
                {u.label}
              </span>
            </div>

            {/* Separator colon (not after last) */}
            {i < units.length - 1 && (
              <span
                className="text-rose-400 font-black text-base mb-3 select-none"
                style={{
                  textShadow: '0 0 8px rgba(248,113,113,0.8)',
                  opacity: pulse ? 1 : 0.3,
                  transition: 'opacity 0.4s ease',
                }}
              >
                :
              </span>
            )}
          </React.Fragment>
        ))}

        {/* Urgency tag */}
        <div
          className="ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black font-mono uppercase tracking-wider text-rose-200"
          style={{
            background: 'rgba(220,38,38,0.25)',
            border: '1px solid rgba(248,113,113,0.30)',
            boxShadow: '0 0 8px rgba(220,38,38,0.30)',
          }}
        >
          🔥 Act Now
        </div>
      </div>

      {/* CSS keyframe injected inline (avoids Tailwind config dependency) */}
      <style>{`
        @keyframes countdownGlow {
          from { box-shadow: 0 0 18px 2px rgba(220,38,38,0.15), 0 0 6px 1px rgba(168,85,247,0.08), inset 0 0 12px rgba(220,38,38,0.04); }
          to   { box-shadow: 0 0 32px 6px rgba(220,38,38,0.30), 0 0 12px 3px rgba(168,85,247,0.14), inset 0 0 20px rgba(220,38,38,0.10); }
        }
      `}</style>
    </div>
  );
}
