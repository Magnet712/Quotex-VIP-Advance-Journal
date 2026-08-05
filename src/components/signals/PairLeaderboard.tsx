'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Trophy, RefreshCw, ArrowRight, Lock, TrendingUp, Flame, Star, Eye } from 'lucide-react';
import { getPairLeaderboard, type PairLeaderboardEntry } from '@/app/actions/leaderboard';

interface PairLeaderboardProps {
  isPremium?: boolean;
}

function statusBadge(status: PairLeaderboardEntry['status']) {
  if (status === 'HOT') {
    return { icon: <Flame className="h-3 w-3 fill-amber-400 text-amber-400" />, label: 'HOT', cls: 'text-amber-400 border-amber-500/30 bg-amber-500/5' };
  }
  if (status === 'STABLE') {
    return { icon: <Star className="h-3 w-3 fill-gold-vip text-gold-vip" />, label: 'STABLE', cls: 'text-gold-vip border-gold-vip/30 bg-gold-vip/5' };
  }
  return { icon: <Eye className="h-3 w-3 text-slate-400" />, label: 'WATCH', cls: 'text-slate-400 border-slate-700 bg-slate-900/30' };
}

function barColor(rate: number) {
  if (rate >= 80) return 'from-emerald-500/80 to-emerald-400';
  if (rate >= 70) return 'from-amber-500/80 to-amber-400';
  return 'from-rose-500/80 to-rose-400';
}

export default function PairLeaderboard({ isPremium = false }: PairLeaderboardProps) {
  const [pairs, setPairs] = useState<PairLeaderboardEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await getPairLeaderboard();
      if (res.success && res.pairs) {
        setPairs(res.pairs);
      } else {
        setPairs([]);
        setError(res.error || 'Failed to load leaderboard');
      }
    } catch {
      setPairs([]);
      setError('Failed to load leaderboard');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getPairLeaderboard();
        if (cancelled) return;
        if (res.success && res.pairs) {
          setPairs(res.pairs);
        } else {
          setPairs([]);
          setError(res.error || 'Failed to load leaderboard');
        }
      } catch {
        if (!cancelled) {
          setPairs([]);
          setError('Failed to load leaderboard');
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
    setPairs(null);
    fetchLeaderboard().finally(() => setLoading(false));
  };

  return (
    <div className="glass-panel rounded-2xl border border-glass-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-glass-border/40 bg-slate-950/40">
        <div className="flex items-center gap-2.5">
          <Trophy className="h-4 w-4 text-gold-vip" />
          <div>
            <span className="text-[10px] font-mono text-gold-vip font-bold uppercase tracking-widest block">
              AI Signal Leaderboard
            </span>
            <span className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
              Top performing OTC pairs · 90 day window
            </span>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded border border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-colors"
          title="Refresh leaderboard"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && pairs === null ? (
        <div className="p-6 space-y-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-9 bg-slate-900/60 rounded-lg animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      ) : error ? (
        <div className="p-6 text-center space-y-3">
          <p className="text-xs font-mono text-slate-500">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded border border-glass-border text-[10px] font-mono font-bold text-slate-400 hover:text-slate-200 uppercase transition-colors"
          >
            Retry
          </button>
        </div>
      ) : pairs && pairs.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">
            Leaderboard warming up — enough OTC signal history will appear here.
          </p>
        </div>
      ) : pairs && pairs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[11px]">
            <thead className="bg-[#030812] border-b border-glass-border text-slate-500 uppercase tracking-wider text-[8px]">
              <tr>
                <th className="p-3.5 pl-5">RANK</th>
                <th className="p-3.5">PAIR</th>
                <th className="p-3.5 text-right">SIGNALS</th>
                <th className="p-3.5">WIN RATE</th>
                <th className="p-3.5 text-right">TODAY</th>
                <th className="p-3.5 pr-5 text-center">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border/30 text-slate-300">
              {pairs.map((p) => {
                const badge = statusBadge(p.status);
                return (
                  <tr key={p.pair} className="hover:bg-slate-900/10 transition-all duration-150">
                    <td className="p-3.5 pl-5">
                      <span className={`inline-flex items-center justify-center h-5 w-5 rounded text-[9px] font-extrabold ${
                        p.rank === 1
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : p.rank === 2
                            ? 'bg-slate-400/10 text-slate-300 border border-slate-500/30'
                            : p.rank === 3
                              ? 'bg-amber-800/15 text-amber-500 border border-amber-700/30'
                              : 'text-slate-600'
                      }`}>
                        {p.rank}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-200">
                      {p.pair}
                      <span className="ml-1.5 text-[7px] text-slate-600 font-mono">OTC</span>
                    </td>
                    <td className="p-3.5 text-right text-slate-400">{p.signals}</td>
                    <td className="p-3.5 min-w-[130px]">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${barColor(p.winRate)}`}
                            style={{ width: `${p.winRate}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-extrabold ${p.winRate >= 80 ? 'text-emerald-400' : p.winRate >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {p.winRate}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5 text-right">
                      {p.todaySignals > 0 ? (
                        <span className="text-[10px]">
                          <span className={`font-extrabold ${p.todayWinRate >= 70 ? 'text-emerald-400' : p.todayWinRate >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {p.todayWinRate}%
                          </span>
                          <span className="text-slate-600"> · {p.todaySignals}</span>
                        </span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="p-3.5 pr-5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[8px] font-bold uppercase tracking-wider ${badge.cls}`}>
                        {badge.icon} {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 text-center">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">
            Leaderboard warming up — enough OTC signal history will appear here.
          </p>
        </div>
      )}

      <div className="px-5 py-3 border-t border-glass-border/40 bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider text-center sm:text-left">
          Historical performance only — not a promise of future results
        </p>
        {isPremium ? (
          <Link
            href="/dashboard/signal-history"
            className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-neon-green hover:text-emerald-300 uppercase tracking-wider transition-colors"
          >
            <TrendingUp className="h-3 w-3" /> View Full Signal History <ArrowRight className="h-3 w-3" />
          </Link>
        ) : (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { requestedPlan: 'premium' } }))}
            className="inline-flex items-center gap-1.5 text-[9px] font-mono font-bold text-purple-400 hover:text-purple-300 uppercase tracking-wider transition-colors"
          >
            <Lock className="h-3 w-3" /> Unlock Live OTC Signals <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
