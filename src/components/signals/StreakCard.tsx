'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Gamepad2, RefreshCw, Flame, Trophy, ShieldCheck, BarChart3, Calendar, ArrowRight, Brain } from 'lucide-react';
import { getStreakSummary, type StreakBadge } from '@/app/actions/streaks';
import Link from 'next/link';

function BadgeChip({ badge }: { badge: StreakBadge }) {
  const progress = Math.min(100, Math.round((badge.current / badge.target) * 100));
  return (
    <div
      title={`${badge.label} — ${badge.desc} (${badge.current}/${badge.target})`}
      className={`flex flex-col items-center gap-1.5 px-2 py-2 rounded-lg border text-center transition-all duration-150 ${
        badge.earned
          ? 'border-amber-500/40 bg-amber-950/10 hover:border-amber-500/60'
          : 'border-slate-800 bg-slate-950/40 opacity-60'
      }`}
    >
      <span className={`text-xl leading-none ${badge.earned ? '' : 'grayscale opacity-70'}`}>{badge.emoji}</span>
      <span className={`text-[7px] font-mono font-bold uppercase tracking-wider w-full leading-tight ${
        badge.earned ? 'text-amber-300' : 'text-slate-500'
      }`}>
        {badge.label}
      </span>
      {badge.earned ? (
        <span className="text-[7px] font-mono font-bold text-emerald-400 uppercase tracking-wider">✓ Earned</span>
      ) : (
        <div className="w-full space-y-1">
          <div className="h-1 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500/80 to-amber-400"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[7px] font-mono text-slate-600">{badge.current}/{badge.target}</span>
        </div>
      )}
    </div>
  );
}

export default function StreakCard() {
  const [streaks, setStreaks] = useState<Awaited<ReturnType<typeof getStreakSummary>>['streaks'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getStreakSummary();
      if (res.success && res.streaks) {
        setStreaks(res.streaks);
        setError(null);
      } else {
        setStreaks(null);
        setError(res.error || 'Failed to load streak summary');
      }
    } catch {
      setStreaks(null);
      setError('Failed to load streak summary');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getStreakSummary();
        if (cancelled) return;
        if (res.success && res.streaks) {
          setStreaks(res.streaks);
          setError(null);
        } else {
          setStreaks(null);
          setError(res.error || 'Failed to load streak summary');
        }
      } catch {
        if (!cancelled) {
          setStreaks(null);
          setError('Failed to load streak summary');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    setStreaks(null);
    load().finally(() => setLoading(false));
  };

  const flameColor = streaks && streaks.currentTradeStreak >= 7
    ? 'text-purple-400'
    : streaks && streaks.currentTradeStreak >= 3
      ? 'text-amber-400'
      : 'text-slate-500';

  return (
    <div className="glass-panel rounded-2xl border border-glass-border overflow-hidden animate-fadeInUp">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-glass-border/40 bg-slate-950/40">
        <div className="flex items-center gap-2.5">
          <Gamepad2 className="h-4 w-4 text-gold-vip" />
          <div>
            <span className="text-[10px] font-mono text-gold-vip font-bold uppercase tracking-widest block">
              Trader Streak System
            </span>
            <span className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
              Discipline rewards — not volume
            </span>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1.5 rounded border border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-colors disabled:opacity-50"
          title="Refresh streak"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && streaks === null ? (
        <div className="p-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 bg-slate-900/60 rounded-lg animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      ) : error && streaks === null ? (
        <div className="p-6 flex items-center justify-between gap-4">
          <p className="text-xs font-mono text-slate-500">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded border border-glass-border text-[10px] font-mono font-bold text-slate-400 hover:text-slate-200 uppercase transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      ) : streaks ? (
        <div className="px-5 py-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Flame className={`h-10 w-10 ${flameColor}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-mono font-extrabold text-slate-100">{streaks.currentTradeStreak}</span>
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest leading-tight">
                    DAY TRADE<br />STREAK
                  </span>
                </div>
                <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
                  Best: {streaks.bestTradeStreak} day{streaks.bestTradeStreak === 1 ? '' : 's'} · Ritual: {streaks.currentRitualStreak} day{streaks.currentRitualStreak === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1.5">
              {streaks.activeToday ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-500/30 bg-emerald-500/5 text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Streak Alive Today
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-500/30 bg-amber-500/5 text-[9px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" /> Log a Trade to Extend
                </span>
              )}
              <span className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
                {streaks.totalTrades} trades logged{streaks.firstTradeDate ? ` · since ${new Date(streaks.firstTradeDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {streaks.badges.map((b) => (
              <BadgeChip key={b.id} badge={b} />
            ))}
          </div>

          {streaks.nextBadge && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  <Trophy className="h-3 w-3 text-gold-vip" /> Next Badge: <span className="text-slate-200">{streaks.nextBadge.emoji} {streaks.nextBadge.label}</span>
                </span>
                <span className="text-[9px] font-mono font-bold text-slate-500">
                  {streaks.nextBadge.current}/{streaks.nextBadge.target} · {streaks.nextProgress}%
                </span>
              </div>
              <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold-vip to-amber-400 transition-all duration-700"
                  style={{ width: `${streaks.nextProgress}%` }}
                />
              </div>
              <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
                {streaks.nextBadge.desc} · Streaks count logging & journaling — never trade count
              </p>
            </div>
          )}

          {streaks.totalTrades === 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-glass-border bg-slate-900/30 px-4 py-3">
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-gold-vip" /> Log your first trade to start your streak
              </p>
              <Link
                href="/dashboard/journal"
                className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-gold-vip hover:text-amber-300 uppercase tracking-wider transition-colors shrink-0"
              >
                Open Journal <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-glass-border/40 pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="flex items-center gap-1 text-[8px] font-mono text-slate-600 uppercase tracking-wider">
                <BarChart3 className="h-3 w-3 text-neon-green" /> {streaks.totalTrades} Analyzed
              </span>
              <span className="flex items-center gap-1 text-[8px] font-mono text-slate-600 uppercase tracking-wider">
                <ShieldCheck className="h-3 w-3 text-emerald-500" /> {streaks.disciplinedTrades} at ≤2% risk
              </span>
            </div>
            <Link
              href="/dashboard/trader-profile"
              className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-gold-vip hover:text-amber-300 uppercase tracking-wider transition-colors shrink-0"
            >
              <Brain className="h-3 w-3" /> View Trader Profile <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">Streak data unavailable.</p>
        </div>
      )}
    </div>
  );
}