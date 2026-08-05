'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Brain, RefreshCw, Sparkles, Crosshair, Clock, ShieldAlert, TrendingUp,
  AlertTriangle, BookOpen, Quote, Activity,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';
import BestPairTool from '@/components/signals/BestPairTool';
import PerformanceComparison from '@/components/signals/PerformanceComparison';
import { getTraderProfile, type TraderProfileData, type ProfileMetric } from '@/app/actions/trader_profile';

function toneColor(tone: ProfileMetric['tone']) {
  if (tone === 'good') return 'text-emerald-400';
  if (tone === 'warn') return 'text-amber-400';
  return 'text-slate-200';
}

function toneBorder(tone: ProfileMetric['tone']) {
  if (tone === 'good') return 'border-emerald-500/30';
  if (tone === 'warn') return 'border-amber-500/30';
  return 'border-slate-700/60';
}

function MetricTile({ metric }: { metric: ProfileMetric }) {
  return (
    <div className={`glass-panel p-5 rounded-xl border flex flex-col justify-between space-y-3 transition-all duration-300 hover:scale-[1.02] ${toneBorder(metric.tone)}`}>
      <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider font-mono uppercase">
        <span>{metric.label}</span>
        {metric.label === 'Weakest Area' ? (
          <ShieldAlert className={`h-4 w-4 ${metric.tone === 'warn' ? 'text-rose-400' : 'text-emerald-500'}`} />
        ) : metric.label === 'Best Session' ? (
          <Clock className="h-4 w-4 text-neon-green" />
        ) : metric.label === 'Best Pair' ? (
          <Crosshair className="h-4 w-4 text-amber-400" />
        ) : (
          <Brain className="h-4 w-4 text-purple-400" />
        )}
      </div>
      <div>
        <div className={`text-lg font-mono font-extrabold ${toneColor(metric.tone)}`}>{metric.value}</div>
        <div className="text-[9px] text-slate-500 font-mono mt-1 leading-relaxed">{metric.note}</div>
      </div>
    </div>
  );
}

export default function TraderProfilePage() {
  const [profile, setProfile] = useState<TraderProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<boolean | null>(null);

  const load = async () => {
    try {
      const res = await getTraderProfile();
      if (res.success && res.profile) {
        setProfile(res.profile);
        setError(null);
      } else {
        setProfile(null);
        setError(res.error || 'Failed to load trader profile');
      }
    } catch {
      setProfile(null);
      setError('Failed to load trader profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data } = await supabase.from('users').select('*').eq('id', session.user.id).maybeSingle();
        if (!cancelled && data) setAccess(canAccess('journal', data));
      } catch {
        // access stays null
      }
      if (cancelled) return;
      try {
        const res = await getTraderProfile();
        if (cancelled) return;
        if (res.success && res.profile) {
          setProfile(res.profile);
          setError(null);
        } else {
          setProfile(null);
          setError(res.error || 'Failed to load trader profile');
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setError('Failed to load trader profile');
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
    setProfile(null);
    load();
  };

  if (access === false) {
    return <LockedFeature feature="journal" />;
  }

  const metrics = profile && profile.status === 'ready'
    ? [profile.style, profile.bestPair, profile.bestSession, profile.avgRisk, profile.bestPerformance, profile.weakestArea].filter((m): m is ProfileMetric => Boolean(m))
    : [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-7xl mx-auto animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-glass-border pb-6 animate-fadeInUp">
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5" /> AI Trading Personality
          </span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100 flex items-center gap-3">
            Your Trader Profile
          </h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            Personal AI coach — analyzed from your journaled trades
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-glass-border bg-slate-900/50 text-[10px] font-mono font-bold text-slate-300 hover:text-slate-100 hover:border-slate-700 transition-colors uppercase tracking-wider disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Profile
        </button>
      </div>

      {/* Personal Performance vs AI — visible for warming and ready states */}
      <PerformanceComparison />

      {loading && profile === null ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-slate-900/60 rounded-lg animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      ) : error && profile === null ? (
        <div className="p-8 text-center space-y-4">
          <p className="text-xs font-mono text-slate-500">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded border border-glass-border text-[10px] font-mono font-bold text-slate-400 hover:text-slate-200 uppercase transition-colors"
          >
            Retry
          </button>
        </div>
      ) : profile && profile.status === 'warming' ? (
        <div className="glass-panel border border-glass-border rounded-2xl p-8 text-center space-y-6 animate-fadeInUp">
          <BookOpen className="h-10 w-10 text-gold-vip mx-auto" />
          <div className="space-y-2">
            <h3 className="text-base font-mono font-extrabold text-slate-200 uppercase tracking-wider">Profile Forming</h3>
            <p className="text-[10px] font-mono text-slate-500 max-w-md mx-auto leading-relaxed">
              The AI coach needs {5 - profile.totalTrades} more journaled trade{profile.totalTrades === 4 ? '' : 's'} to analyze your style. Keep logging — including emotional state and risk percentage.
            </p>
          </div>
          <div className="max-w-sm mx-auto space-y-2">
            <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 uppercase tracking-wider">
              <span>{profile.totalTrades} logged</span>
              <span>5 trades to unlock</span>
            </div>
            <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold-vip to-amber-400 transition-all duration-700"
                style={{ width: `${Math.min(100, (profile.totalTrades / 5) * 100)}%` }}
              />
            </div>
          </div>
          <LinkToJournal />
        </div>
      ) : profile && profile.status === 'ready' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fadeInUp">
            {metrics.map((m) => (
              <MetricTile key={m.label} metric={m} />
            ))}
          </div>

          {/* Find My Best Pair — interactive pair ranking tool */}
          <BestPairTool />

          <div className="glass-panel border border-purple-500/25 rounded-2xl p-6 space-y-4 animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-purple-400 uppercase tracking-widest">
                <Sparkles className="h-4 w-4" /> AI Recommendation
              </span>
              <Quote className="h-4 w-4 text-purple-400/60" />
            </div>
            <div className="space-y-2.5">
              {profile.recommendation.map((rec, idx) => (
                <p key={idx} className="text-xs text-slate-300 leading-relaxed flex items-start gap-2.5">
                  <span className="text-[10px] font-mono text-purple-400 font-bold mt-0.5">{idx + 1}.</span>
                  {rec}
                </p>
              ))}
            </div>
            <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider border-t border-glass-border/30 pt-3">
              Generated from your journaled trades — not a guarantee of future results
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 px-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-700 bg-slate-900/40 text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              <Activity className="h-3 w-3 text-neon-green" /> {profile.totalTrades} trades
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-700 bg-slate-900/40 text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              <Clock className="h-3 w-3 text-neon-green" /> {profile.activeDays} active days
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-500/20 bg-emerald-500/5 text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
              <TrendingUp className="h-3 w-3" /> {profile.wins} W
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-rose-500/20 bg-rose-500/5 text-[9px] font-mono font-bold text-rose-400 uppercase tracking-wider">
              <AlertTriangle className="h-3 w-3" /> {profile.losses} L
            </span>
          </div>
        </>
      ) : (
        <div className="p-8 text-center">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">Profile unavailable.</p>
        </div>
      )}

      <div className="px-2 pb-4">
        <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
          Trading style, best pair, best session and weaknesses are derived from your journaled trades · Historical performance only — not a promise of future results
        </p>
      </div>
    </div>
  );
}

function LinkToJournal() {
  return (
    <Link
            href="/dashboard/journal"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-gold-vip/40 bg-gold-vip/10 text-[10px] font-mono font-bold text-gold-vip hover:bg-gold-vip/20 transition-colors uppercase tracking-wider"
          >
            <BookOpen className="h-3.5 w-3.5" /> Open Journal
          </Link>
  );
}