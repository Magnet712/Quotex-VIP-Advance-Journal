'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  User, Sparkles, Zap, RefreshCw, ArrowLeftRight, Info,
} from 'lucide-react';
import { getPerformanceVsAi, type SampleTier } from '@/app/actions/performance_vs_ai';

function sampleChip(sample: SampleTier) {
  if (sample === 'HIGH') return { label: 'HIGH SAMPLE', cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' };
  if (sample === 'MEDIUM') return { label: 'MEDIUM SAMPLE', cls: 'text-amber-400 border-amber-500/30 bg-amber-500/5' };
  return { label: 'LOW SAMPLE', cls: 'text-rose-400 border-rose-500/30 bg-rose-500/5' };
}

function rateColor(rate: number | null, fallback: string) {
  if (rate === null) return fallback;
  if (rate >= 70) return 'text-emerald-400';
  if (rate >= 50) return 'text-amber-400';
  return 'text-rose-400';
}

function barColor(rate: number | null) {
  if (rate === null) return 'from-slate-700 to-slate-600';
  if (rate >= 70) return 'from-emerald-500/80 to-emerald-400';
  if (rate >= 50) return 'from-amber-500/80 to-amber-400';
  return 'from-rose-500/80 to-rose-400';
}

interface PerfCardProps {
  title: string;
  sub: string;
  rate: number | null;
  rateFallback: string;
  nLabel: string;
  wins?: number;
  losses?: number;
  sample?: SampleTier | null;
  accentCls: string;
  icon: React.ReactNode;
}

function PerfCard({ title, sub, rate, rateFallback, nLabel, wins, losses, sample, accentCls, icon }: PerfCardProps) {
  const chip = sample ? sampleChip(sample) : null;
  return (
    <div className={`glass-panel p-5 rounded-xl border border-glass-border space-y-3 transition-all duration-300 hover:scale-[1.02]`}>
      <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider font-mono uppercase">
        <span>{title}</span>
        <span className={`inline-flex items-center justify-center h-6 w-6 rounded-md ${accentCls}`}>{icon}</span>
      </div>
      <div>
        <div className={`text-3xl font-mono font-extrabold ${rateColor(rate, rateFallback)}`}>
          {rate === null ? '—' : `${rate}%`}
        </div>
        <div className="text-[8px] font-mono text-slate-600 uppercase tracking-wider mt-0.5">{sub}</div>
      </div>
      <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
        <div className={`h-full rounded-full bg-gradient-to-r ${barColor(rate)}`} style={{ width: `${rate ?? 0}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[9px] font-mono text-slate-400">{nLabel}</span>
        {wins !== undefined && losses !== undefined && (
          <span className="text-[8px] font-mono text-slate-600">
            <span className="text-emerald-400">{wins}W</span> · <span className="text-rose-400">{losses}L</span>
          </span>
        )}
        {chip && (
          <span className={`inline-flex px-1.5 py-0.5 rounded border text-[7px] font-mono font-bold uppercase tracking-wider ${chip.cls}`}>
            {chip.label}
          </span>
        )}
      </div>
    </div>
  );
}

export default function PerformanceComparison() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getPerformanceVsAi>>['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await getPerformanceVsAi();
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setData(null);
        setError(res.error || 'Failed to load comparison');
      }
    } catch {
      setData(null);
      setError('Failed to load comparison');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getPerformanceVsAi();
        if (cancelled) return;
        if (res.success && res.data) {
          setData(res.data);
          setError(null);
        } else {
          setData(null);
          setError(res.error || 'Failed to load comparison');
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setError('Failed to load comparison');
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
    setData(null);
    fetchData().finally(() => setLoading(false));
  };

  return (
    <div className="glass-panel rounded-2xl border border-glass-border overflow-hidden animate-fadeInUp">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-glass-border/40 bg-slate-950/40">
        <div className="flex items-center gap-2.5">
          <ArrowLeftRight className="h-4 w-4 text-neon-green" />
          <div>
            <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-widest block">
              Personal Performance vs AI
            </span>
            <span className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
              Clear methodology · adequate sample sizes
            </span>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1.5 rounded border border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-colors disabled:opacity-50"
          title="Refresh comparison"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && data === null ? (
        <div className="p-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-slate-900/60 rounded-lg animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      ) : error && data === null ? (
        <div className="p-6 flex items-center justify-between gap-4">
          <p className="text-xs font-mono text-slate-500">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded border border-glass-border text-[10px] font-mono font-bold text-slate-400 hover:text-slate-200 uppercase transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      ) : data ? (
        <div className="px-5 py-5 space-y-5">
          <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PerfCard
                title="Your Performance"
                sub="All journaled trades"
                rate={data.you ? data.you.winRate : null}
                rateFallback="text-slate-500"
                nLabel={data.you ? `${data.you.n} trade${data.you.n === 1 ? '' : 's'}` : 'No journal trades yet'}
                wins={data.you ? data.you.wins : undefined}
                losses={data.you ? data.you.losses : undefined}
                sample={data.you ? data.you.sample : null}
                accentCls="bg-amber-500/15 text-amber-400"
                icon={<User className="h-3.5 w-3.5" />}
              />
              <PerfCard
                title="AI Signal Performance"
                sub="Community OTC signals · 90d"
                rate={data.ai.winRate}
                rateFallback="text-slate-500"
                nLabel={`${data.ai.n} signals`}
                wins={data.ai.wins}
                losses={data.ai.losses}
                sample={data.ai.sample}
                accentCls="bg-emerald-500/15 text-emerald-400"
                icon={<Sparkles className="h-3.5 w-3.5" />}
              />
            </div>
            <span className="hidden md:inline-flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-1 px-2.5 py-1 rounded-full border border-slate-700 bg-[#030812] text-[8px] font-mono font-bold text-slate-400 uppercase tracking-wider z-10">
              VS
            </span>
          </div>

          <div className="glass-panel border border-purple-500/25 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-purple-500/15 text-purple-400">
                  <Zap className="h-4 w-4" />
                </span>
                <div>
                  <span className="text-[9px] font-mono font-bold text-purple-400 uppercase tracking-widest block">
                    AI + Your Execution
                  </span>
                  <span className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
                    OTC signals you executed · 90d
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-3xl font-mono font-extrabold text-purple-300">
                    {data.combined ? `${data.combined.winRate}%` : '—'}
                  </span>
                  <span className="text-[8px] font-mono text-slate-600 block uppercase tracking-wider">
                    {data.combined ? `${data.combined.n} signals` : 'No AI executions yet'}
                  </span>
                </div>
                {data.combined && (
                  <span className={`inline-flex px-2 py-0.5 rounded border text-[8px] font-mono font-bold uppercase tracking-wider ${sampleChip(data.combined.sample).cls}`}>
                    {sampleChip(data.combined.sample).label}
                  </span>
                )}
              </div>
            </div>
            {data.combined && (
              <div className="mt-3">
                <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${barColor(data.combined.winRate)}`}
                    style={{ width: `${data.combined.winRate}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-neon-green/20 bg-emerald-950/10 px-5 py-3.5 flex items-start gap-3">
            <Info className="h-4 w-4 text-neon-green shrink-0 mt-0.5" />
            <p className="text-[10px] font-mono text-emerald-300/90 uppercase tracking-wider leading-relaxed">{data.insight}</p>
          </div>

          <div className="space-y-1.5 border-t border-glass-border/40 pt-3">
            {data.methodology.map((m, idx) => (
              <p key={idx} className="text-[8px] font-mono text-slate-600 uppercase tracking-wider flex items-start gap-2">
                <span className="text-neon-green">▸</span> {m}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-6 text-center">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">Comparison unavailable.</p>
        </div>
      )}
    </div>
  );
}