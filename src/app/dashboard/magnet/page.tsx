'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BrainCircuit, Sparkles, Trophy, CalendarDays, Flame, Crosshair, Activity,
  BookOpen, ShieldAlert, Loader2, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { getMagnetIntelligence, type MagnetData } from '@/app/actions/magnet';

function riskEmoji(key: string) {
  if (key === 'LOW') return '🟢';
  if (key === 'MODERATE') return '🟡';
  return '🔴';
}

function intelligenceCard(
  label: string,
  icon: React.ReactNode,
  body: React.ReactNode,
) {
  return (
    <div className="glass-panel p-5 rounded-xl border border-glass-border flex flex-col justify-between space-y-3 transition-all duration-300 hover:scale-[1.02] hover:border-slate-600/60 min-h-[128px]">
      <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider font-mono uppercase">
        <span>{label}</span>
        {icon}
      </div>
      <div>{body}</div>
    </div>
  );
}

const MODULES: { icon: React.ReactNode; name: string; blurb: string; href: string; accent: string }[] = [
  { icon: <BrainCircuit className="h-4 w-4" />, name: 'AI Scorecard', blurb: 'Confidence + win probability on every scan', href: '/dashboard/signals', accent: 'text-purple-400' },
  { icon: <Sparkles className="h-4 w-4" />, name: 'Why This Signal', blurb: 'The reason behind every CALL / PUT', href: '/dashboard/signals', accent: 'text-neon-green' },
  { icon: <Trophy className="h-4 w-4" />, name: 'Pair Leaderboard', blurb: 'Top community pairs, ranked by win rate', href: '/dashboard', accent: 'text-amber-400' },
  { icon: <CalendarDays className="h-4 w-4" />, name: 'Daily AI Market Report', blurb: 'Best window + high-risk hours today', href: '/dashboard/daily-report', accent: 'text-sky-400' },
  { icon: <Flame className="h-4 w-4" />, name: 'Trader Streak', blurb: 'Trades + ritual streaks and badges', href: '/dashboard', accent: 'text-orange-400' },
  { icon: <BrainCircuit className="h-4 w-4" />, name: 'AI Trader Profile', blurb: 'Your style, best pair, weakest habits', href: '/dashboard/trader-profile', accent: 'text-emerald-400' },
  { icon: <Crosshair className="h-4 w-4" />, name: 'Find My Best Pair', blurb: 'Personalized podium of reliable pairs', href: '/dashboard/trader-profile', accent: 'text-emerald-300' },
  { icon: <Activity className="h-4 w-4" />, name: 'Performance vs AI', blurb: 'You vs the community engine', href: '/dashboard/trader-profile', accent: 'text-teal-400' },
];

const ACTIONS: { emoji: string; title: string; blurb: string; href: string }[] = [
  { emoji: '📊', title: 'Review your last 5 trades', blurb: 'Open your journal and replay the recent flow.', href: '/dashboard/journal' },
  { emoji: '🧠', title: 'Check your psychology score', blurb: 'Surface discipline, risk and emotional patterns.', href: '/dashboard/trader-profile' },
  { emoji: '📡', title: 'View live AI signals', blurb: 'Jump to the signal dashboard for today\'s scans.', href: '/dashboard/signals' },
  { emoji: '📈', title: 'Analyze your best-performing pair', blurb: 'Run the best-pair analyzer on your journal.', href: '/dashboard/trader-profile' },
];

export default function MagnetPage() {
  const [data, setData] = useState<MagnetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await getMagnetIntelligence();
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setData(null);
        setError(res.error || 'Failed to load AI intelligence');
      }
    } catch {
      setData(null);
      setError('Failed to load AI intelligence');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMagnetIntelligence();
        if (cancelled) return;
        if (res.success && res.data) {
          setData(res.data);
          setError(null);
        } else {
          setData(null);
          setError(res.error || 'Failed to load AI intelligence');
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setError('Failed to load AI intelligence');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-7xl mx-auto animate-fadeIn">
        <div className="h-24 w-full animate-pulse rounded-xl bg-slate-900/80 border border-glass-border" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[128px] animate-pulse rounded-xl bg-slate-900/80 border border-glass-border" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-xl bg-slate-900/80 border border-glass-border" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-900/80 border border-glass-border" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto animate-fadeIn">
        <div className="glass-panel p-6 rounded-xl border border-rose-500/30 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-6 w-6 text-rose-400" />
          <p className="text-sm text-slate-300">{error || 'Failed to load AI intelligence'}</p>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-mono font-bold text-[11px] uppercase tracking-wider hover:bg-emerald-500/20 transition-colors"
          >
            <Loader2 className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const strengthPct = data.aiStrength.n > 0 ? Math.max(0, Math.min(100, data.aiStrength.winRate)) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto animate-fadeIn">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-glass-border pb-6 animate-fadeInUp">
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-purple-300 font-bold uppercase tracking-wider block">the brain of your trading day</span>
          <h1 className="text-3xl font-bold font-mono tracking-tight bg-gradient-to-r from-emerald-300 via-purple-300 to-purple-200 bg-clip-text text-transparent">
            🧠 MAGNET AI Trading Intelligence
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Market activity, signal strength, your performance and today&apos;s next move — one intelligent glance. · {data.dateLabel}
          </p>
        </div>
      </div>

      {/* TODAY'S AI INTELLIGENCE */}
      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <BrainCircuit className="h-4 w-4 text-purple-400" />
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-slate-300">Today&apos;s AI Intelligence</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Market Activity */}
          {intelligenceCard('Market Activity', <Activity className="h-4 w-4 text-neon-green" />, (
            <>
              <div className="text-2xl font-mono font-extrabold text-slate-100">{data.activity.emoji} {data.activity.label}</div>
              <div className="text-[9px] text-slate-500 font-mono mt-1 leading-relaxed">{data.activity.note}</div>
            </>
          ))}

          {/* Best Performing Pair */}
          {intelligenceCard('Best Performing Pair', <Crosshair className="h-4 w-4 text-amber-400" />, (
            data.bestPair ? (
              <>
                <div className="text-lg font-mono font-extrabold text-slate-100">{data.bestPair.pair}</div>
                <div className="text-[11px] font-mono text-emerald-400 font-bold mt-0.5">
                  {data.bestPair.winRate}% <span className="text-slate-500 font-normal">· {data.bestPair.n} scans</span>
                </div>
                <div className="text-[9px] text-slate-500 font-mono mt-1">
                  {data.bestPair.source === 'today' ? 'Today\'s picks' : '90-day history'}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-mono font-extrabold text-slate-500">—</div>
                <div className="text-[9px] text-slate-500 font-mono mt-1">Waiting for enough community scans to rank pairs.</div>
              </>
            )
          ))}

          {/* AI Signal Strength */}
          {intelligenceCard('AI Signal Strength', <Sparkles className="h-4 w-4 text-purple-400" />, (
            <>
              {data.aiStrength.n > 0 ? (
                <>
                  <div className="text-2xl font-mono font-extrabold text-slate-100">{data.aiStrength.winRate}%</div>
                  <div className="h-1.5 w-full rounded-full bg-slate-800 mt-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-purple-400"
                      style={{ width: `${strengthPct}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-slate-500 font-mono mt-1">Community win rate · {data.aiStrength.n} scans (90d)</div>
                </>
              ) : (
                <>
                  <div className="text-lg font-mono font-extrabold text-slate-500">Awaiting data</div>
                  <div className="text-[9px] text-slate-500 font-mono mt-1">Signal strength computes from community manual scans.</div>
                </>
              )}
            </>
          ))}

          {/* Trader Risk Status */}
          {intelligenceCard('Trader Risk Status', <ShieldAlert className="h-4 w-4 text-amber-400" />, (
            data.risk ? (
              <>
                <div className="text-2xl font-mono font-extrabold text-slate-100">{riskEmoji(data.risk.key)} {data.risk.label}</div>
                <div className="text-[9px] text-slate-500 font-mono mt-1 leading-relaxed">{data.risk.note}</div>
              </>
            ) : (
              <>
                <div className="text-lg font-mono font-extrabold text-slate-500">🟢 —</div>
                <div className="text-[9px] text-slate-500 font-mono mt-1 leading-relaxed">Log risk % on {5 - (data.personal?.n ?? 0) > 0 ? 5 - (data.personal?.n ?? 0) : 'more'} trades to unlock.</div>
              </>
            )
          ))}

          {/* Your Personal Performance */}
          {intelligenceCard('Your Personal Performance', <BrainCircuit className="h-4 w-4 text-emerald-400" />, (
            data.personal ? (
              <>
                <div className="text-2xl font-mono font-extrabold text-emerald-300">{data.personal.winRate}%</div>
                <div className="text-[9px] text-slate-500 font-mono mt-1">
                  {data.personal.wins} W · {data.personal.losses} L across {data.personal.n} journaled trades
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-mono font-extrabold text-slate-500">—</div>
                <div className="text-[9px] text-slate-500 font-mono mt-1">Journal your first trade to activate personal performance.</div>
              </>
            )
          ))}
        </div>
      </section>

      {/* AI Insight */}
      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-emerald-300" />
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-slate-300">AI Insight</h2>
        </div>
        <div className="glass-panel p-6 rounded-xl border border-purple-500/25 bg-gradient-to-br from-purple-950/20 via-[#030b17] to-[#030b17] space-y-3">
          {data.insight.ready ? (
            <blockquote className="text-sm text-slate-200 leading-relaxed font-sans">
              {data.insight.lines.map((line) => (
                <React.Fragment key={line}>
                  <span className="text-emerald-400 font-bold mr-1">›</span>{line}
                  <br />
                </React.Fragment>
              ))}
            </blockquote>
          ) : (
            <p className="text-sm text-slate-400 leading-relaxed font-sans">
              <span className="text-emerald-400 font-bold mr-1">›</span>
              {data.insight.warmth || 'Keep journaling your trades — personal AI insight unlocks with real data.'}
            </p>
          )}
          <p className="text-[9px] font-mono text-slate-600 leading-relaxed">
            Derivations: your best IST hour and daily-volume endurance from your journaled trades · community figures from approved users&apos; manual scans. Historical performance only — not a forecast.
          </p>
        </div>
      </section>

      {/* TODAY'S ACTION */}
      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <BookOpen className="h-4 w-4 text-neon-green" />
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-slate-300">Today&apos;s Action</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ACTIONS.map((a) => (
            <Link
              key={a.title}
              href={a.href}
              className="group glass-panel p-5 rounded-xl border border-glass-border flex flex-col justify-between gap-3 transition-all duration-300 hover:border-emerald-500/40 hover:scale-[1.02]"
            >
              <div className="flex items-start justify-between">
                <span className="text-xl">{a.emoji}</span>
                <ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-mono font-bold text-slate-200 leading-snug">{a.title}</div>
                <div className="text-[10px] text-slate-500 font-sans leading-relaxed">{a.blurb}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* THE BRAIN — Module Map */}
      <section className="space-y-3">
        <div className="flex items-center gap-2.5">
          <BrainCircuit className="h-4 w-4 text-purple-300" />
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-slate-300">Explore the Brain — Every Module</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {MODULES.map((m) => (
            <Link
              key={m.name}
              href={m.href}
              className="group flex items-center gap-3 p-3.5 rounded-xl border border-glass-border bg-[#030b17]/60 transition-all duration-300 hover:border-purple-500/40 hover:bg-purple-950/20"
            >
              <span className={`shrink-0 h-8 w-8 rounded-lg border border-glass-border bg-slate-900/80 flex items-center justify-center ${m.accent} transition-transform group-hover:scale-110`}>
                {m.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-mono font-bold text-slate-200 truncate">{m.name}</span>
                <span className="block text-[9px] text-slate-500 font-sans leading-tight truncate">{m.blurb}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-2">
        <p className="text-[9px] font-mono text-slate-600 leading-relaxed">
          MAGNET AI Trading Intelligence aggregates your journaled trades and approved users&apos; manual-scan history into one daily snapshot. Historical performance only — never a forecast or guarantee.
        </p>
      </footer>
    </div>
  );
}