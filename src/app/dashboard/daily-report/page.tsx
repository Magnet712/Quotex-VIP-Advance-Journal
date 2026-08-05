'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles, RefreshCw, Flame, BarChart3, AlertTriangle, Activity, Zap, Lock,
  TrendingUp, Clock, ShieldCheck, ArrowRight, Calendar,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getMembershipRole } from '@/lib/permissions';
import { getDailyMarketReport, type DailyReportData, type DailyHourStat, type DailySessionStat } from '@/app/actions/daily_report';

interface ProfileLike {
  vip_access?: boolean;
  premium_access?: boolean;
  [key: string]: unknown;
}

function winRateColor(rate: number) {
  if (rate >= 80) return 'text-emerald-400';
  if (rate >= 70) return 'text-amber-400';
  return 'text-rose-400';
}

function barColor(rate: number) {
  if (rate >= 80) return 'from-emerald-500/80 to-emerald-400';
  if (rate >= 70) return 'from-amber-500/80 to-amber-400';
  return 'from-rose-500/80 to-rose-400';
}

function HourBar({ hour, compact = false }: { hour: DailyHourStat; compact?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className={`font-mono font-bold ${compact ? 'text-[9px]' : 'text-[10px]'} text-slate-300`}>
          {hour.label}
        </span>
        <span className="flex items-center gap-2">
          <span className={`text-[8px] font-mono text-slate-600 ${compact ? '' : 'hidden sm:inline'}`}>
            {hour.signals} SIG
          </span>
          <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-mono font-extrabold ${winRateColor(hour.winRate)}`}>
            {hour.winRate}%
          </span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor(hour.winRate)}`}
          style={{ width: `${hour.winRate}%` }}
        />
      </div>
    </div>
  );
}

function SessionChip({ session }: { session: DailySessionStat }) {
  return (
    <div className="glass-panel border border-glass-border rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">{session.label}</span>
        <span className={`text-sm font-mono font-extrabold ${winRateColor(session.winRate)}`}>{session.winRate}%</span>
      </div>
      <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">{session.range}</p>
      <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor(session.winRate)}`}
          style={{ width: `${session.winRate}%` }}
        />
      </div>
      <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
        {session.wins} W · {session.signals - session.wins} L
      </p>
    </div>
  );
}

function confidenceChip(conf: DailyReportData['today']['confidence']) {
  if (conf === 'STRONG') return { icon: <Zap className="h-3 w-3" />, label: 'STRONG', cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' };
  if (conf === 'MODERATE') return { icon: <BarChart3 className="h-3 w-3" />, label: 'MODERATE', cls: 'text-amber-400 border-amber-500/30 bg-amber-500/5' };
  return { icon: <AlertTriangle className="h-3 w-3" />, label: 'WEAK', cls: 'text-rose-400 border-rose-500/30 bg-rose-500/5' };
}

function SectionTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5">{icon}</div>
      <div>
        <h4 className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest">{title}</h4>
        <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

export default function DailyReportPage() {
  const [report, setReport] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileLike | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadReport = async () => {
    try {
      const res = await getDailyMarketReport();
      if (res.success && res.report) {
        setReport(res.report);
        setError(null);
        setUpdatedAt(new Date());
      } else {
        setReport(null);
        setError(res.error || 'Failed to load market report');
      }
    } catch {
      setReport(null);
      setError('Failed to load market report');
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
        if (!cancelled && data) setProfile(data as ProfileLike);
      } catch {
        // profile optional — premium stays locked
      }
      if (cancelled) return;
      try {
        const res = await getDailyMarketReport();
        if (cancelled) return;
        if (res.success && res.report) {
          setReport(res.report);
          setError(null);
          setUpdatedAt(new Date());
        } else {
          setReport(null);
          setError(res.error || 'Failed to load market report');
        }
      } catch {
        if (!cancelled) {
          setReport(null);
          setError('Failed to load market report');
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
    setReport(null);
    loadReport();
  };

  const isPremium = profile ? getMembershipRole(profile) === 'premium' : false;

  const t = report?.today;
  const heroTiles: { icon: React.ReactNode; label: string; value: React.ReactNode; note: string }[] = t
    ? [
        {
          icon: <Flame className="h-4 w-4 text-amber-400" />,
          label: 'Best Performing Pair',
          value: t.bestPair ? (
            <>
              {t.bestPair} <span className="text-[9px] text-emerald-400 font-bold">OTC</span>
            </>
          ) : (
            <span className="text-slate-600">—</span>
          ),
          note: t.bestPair
            ? `${t.bestPairWinRate}% win rate${t.bestPairSource === '90d' ? ' · 90-day window' : ''} · ${t.bestPairSignals} signals`
            : 'No qualifying data yet',
        },
        {
          icon: <BarChart3 className="h-4 w-4 text-neon-green" />,
          label: 'Strongest Session',
          value: t.strongestSession ? t.strongestSession.label : <span className="text-slate-600">—</span>,
          note: t.strongestSession
            ? `${t.strongestSession.range}${t.strongestSessionSource === '90d' ? ' · 90-day window' : ''}`
            : 'Morning / Evening sessions tracked',
        },
        {
          icon: <AlertTriangle className="h-4 w-4 text-rose-400" />,
          label: 'High-Risk Period',
          value: report?.periods.highRisk ? (
            report.periods.highRisk.label
          ) : (
            <span className="text-slate-600">—</span>
          ),
          note: report?.periods.highRisk
            ? `${report.periods.highRisk.winRate}% win rate · ${report.periods.highRisk.signals} signals`
            : report?.periods.source === 'today'
              ? 'No losing window today'
              : 'No clearly risky window',
        },
        {
          icon: <Activity className="h-4 w-4 text-neon-green" />,
          label: "Today's Signal Activity",
          value: t.signals > 0 ? t.signals : <span className="text-slate-600">0</span>,
          note: t.signals > 0 ? `${t.wins} wins · ${t.signals - t.wins} losses today` : 'No OTC scans resolved yet today',
        },
        {
          icon: <Zap className="h-4 w-4 text-purple-400" />,
          label: 'AI Confidence',
          value: t.confidence ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-mono font-bold uppercase tracking-wider ${confidenceChip(t.confidence).cls}`}>
              {confidenceChip(t.confidence).icon} {confidenceChip(t.confidence).label}
            </span>
          ) : (
            <span className="text-slate-600">—</span>
          ),
          note: t.signals > 0 ? `${t.winRate}% win rate today` : "Waiting for today's signals",
        },
      ]
    : [];

  const premiumBody = report ? (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel border border-glass-border rounded-2xl p-5 space-y-4">
          <SectionTitle
            icon={<Clock className="h-4 w-4 text-purple-400" />}
            title="Best Trading Windows"
            sub={report.periods.source === 'today' ? "Today's strongest IST hours" : '90-day window (insufficient today data)'}
          />
          {report.periods.bestWindows.length > 0 ? (
            <div className="space-y-3.5">
              {report.periods.bestWindows.map((h) => (
                <HourBar key={h.hour} hour={h} />
              ))}
            </div>
          ) : (
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              Warming up — enough resolved signals will unlock window analysis.
            </p>
          )}
        </div>

        <div className="glass-panel border border-glass-border rounded-2xl p-5 space-y-4">
          <SectionTitle
            icon={<AlertTriangle className="h-4 w-4 text-rose-400" />}
            title="High-Risk Period Detail"
            sub="Lowest win-rate IST hour — avoid discretionary entries"
          />
          {report.periods.highRisk ? (
            <HourBar hour={report.periods.highRisk} />
          ) : (
            <p className="text-[10px] font-mono text-emerald-400/80 uppercase tracking-wider">
              No high-risk window detected — {report.periods.source === 'today' ? 'today' : '90-day'} hour coverage looks healthy.
            </p>
          )}
        </div>
      </div>

      <div className="glass-panel border border-glass-border rounded-2xl p-5 space-y-4">
        <SectionTitle
          icon={<Flame className="h-4 w-4 text-amber-400" />}
          title="Pair-By-Pair Breakdown"
          sub="Today's per-pair OTC performance (IST)"
        />
        {report.pairs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="bg-[#030812] border-b border-glass-border text-slate-500 uppercase tracking-wider text-[8px]">
                <tr>
                  <th className="p-3 pl-0">#</th>
                  <th className="p-3">PAIR</th>
                  <th className="p-3 text-right">SIGNALS</th>
                  <th className="p-3 text-right">WINS</th>
                  <th className="p-3 pr-0">WIN RATE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border/30 text-slate-300">
                {report.pairs.map((p) => (
                  <tr key={p.pair} className="hover:bg-slate-900/10 transition-all duration-150">
                    <td className="p-3 pl-0">
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
                    <td className="p-3 font-bold text-slate-200">
                      {p.pair} <span className="ml-1.5 text-[7px] text-slate-600 font-mono">OTC</span>
                    </td>
                    <td className="p-3 text-right text-slate-400">{p.signals}</td>
                    <td className="p-3 text-right text-emerald-400">{p.wins}</td>
                    <td className="p-3 pr-0 min-w-[130px]">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${barColor(p.winRate)}`}
                            style={{ width: `${p.winRate}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-extrabold ${winRateColor(p.winRate)}`}>{p.winRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            No resolved OTC pairs today yet.
          </p>
        )}
      </div>

      <div className="glass-panel border border-glass-border rounded-2xl p-5 space-y-4">
        <SectionTitle
          icon={<TrendingUp className="h-4 w-4 text-neon-green" />}
          title="90-Day Historical Performance"
          sub="Community OTC — session, hour and pair trends"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-500/20 bg-emerald-500/5 text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
            <TrendingUp className="h-3 w-3" /> {report.historical.winRate}% overall
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-700 bg-slate-900/40 text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">
            <Activity className="h-3 w-3" /> {report.historical.signals} signals
          </span>
        </div>

        {report.historical.sessions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {report.historical.sessions.map((s) => (
              <SessionChip key={s.key} session={s} />
            ))}
          </div>
        )}

        {report.historical.hours.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {report.historical.hours.map((h) => (
              <HourBar key={h.hour} hour={h} compact />
            ))}
          </div>
        )}

        {report.historical.topPairs.length > 0 && (
          <div>
            <p className="text-[8px] font-mono text-slate-600 uppercase tracking-widest mb-2.5">Top Pairs · 90 days</p>
            <div className="flex flex-wrap gap-2">
              {report.historical.topPairs.map((p) => (
                <span
                  key={p.pair}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-glass-border bg-slate-900/40 text-[9px] font-mono font-bold text-slate-300"
                >
                  <Flame className={`h-3 w-3 ${p.winRate >= 80 ? 'text-amber-400' : 'text-slate-500'}`} />
                  {p.pair}
                  <span className={`${winRateColor(p.winRate)}`}>{p.winRate}%</span>
                  <span className="text-slate-600">· {p.signals}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-7xl mx-auto animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-glass-border pb-6 animate-fadeInUp">
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> AI Daily Market Report
          </span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-slate-600" />
            {report ? report.dateLabel : "Loading today's pulse…"}
          </h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            Live community OTC pulse — regenerated every visit
            {updatedAt ? ` · Last refreshed ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} IST` : ''}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-glass-border bg-slate-900/50 text-[10px] font-mono font-bold text-slate-300 hover:text-slate-100 hover:border-slate-700 transition-colors uppercase tracking-wider disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Report
        </button>
      </div>

      {loading && report === null ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-slate-900/60 rounded-lg animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      ) : error && report === null ? (
        <div className="p-8 text-center space-y-4">
          <p className="text-xs font-mono text-slate-500">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded border border-glass-border text-[10px] font-mono font-bold text-slate-400 hover:text-slate-200 uppercase transition-colors"
          >
            Retry
          </button>
        </div>
      ) : report && t ? (
        <>
          {t.signals === 0 && !report.historical.signals ? (
            <div className="p-8 text-center space-y-3">
              <Activity className="h-8 w-8 text-slate-600 mx-auto" />
              <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">
                Report warming up — enough community OTC signal history will power this page.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 animate-fadeInUp">
                {heroTiles.map((tile) => (
                  <div
                    key={tile.label}
                    className="glass-panel p-5 rounded-xl border border-glass-border flex flex-col justify-between space-y-3 transition-all duration-300 hover:scale-[1.02] hover:border-glass-border/50"
                  >
                    <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider font-mono uppercase">
                      <span>{tile.label}</span>
                      {tile.icon}
                    </div>
                    <div>
                      <div className="text-lg font-mono font-extrabold text-slate-200">{tile.value}</div>
                      <div className="text-[9px] text-slate-500 font-mono mt-1 leading-relaxed">{tile.note}</div>
                    </div>
                  </div>
                ))}
              </div>

              {t.signals === 0 && (
                <div className="glass-panel border border-amber-500/20 bg-amber-950/10 rounded-xl px-5 py-3.5 flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <p className="text-[10px] font-mono text-amber-300/90 uppercase tracking-wider">
                    No community OTC activity yet today — the free summary above falls back to the 90-day window until scans resolve.
                  </p>
                </div>
              )}

              <div className="relative">
                <div className={`rounded-2xl transition-all duration-300 ${isPremium ? '' : 'blur-[3px] opacity-40 pointer-events-none select-none'}`}>
                  <div className="space-y-6 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-purple-400 uppercase tracking-widest">
                        <Sparkles className="h-4 w-4" /> Full AI Analysis
                      </span>
                      {isPremium ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-purple-500/30 bg-purple-950/20 text-[8px] font-mono font-bold text-purple-300 uppercase tracking-wider">
                          <ShieldCheck className="h-3 w-3" /> Premium Unlocked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700 bg-slate-900/40 text-[8px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                          <Lock className="h-3 w-3" /> Premium
                        </span>
                      )}
                    </div>
                    {premiumBody}
                  </div>
                </div>
                {!isPremium && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center space-y-4 p-6">
                      <Lock className="h-8 w-8 text-purple-400 mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-mono font-extrabold text-slate-200 uppercase tracking-wider">
                          Unlock Full AI Analysis
                        </p>
                        <p className="text-[10px] font-mono text-slate-500 max-w-sm mx-auto leading-relaxed">
                          Pair-by-pair breakdown, best trading windows and 90-day historical performance — live from the community signal pool.
                        </p>
                      </div>
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { requestedPlan: 'premium' } }))}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-purple-500/50 bg-purple-950/30 text-[10px] font-mono font-bold text-purple-300 hover:bg-purple-900/40 hover:text-purple-200 transition-colors uppercase tracking-wider"
                      >
                        Unlock Now <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="p-8 text-center">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">Report unavailable.</p>
        </div>
      )}

      <div className="px-2 pb-4">
        <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
          Aggregated from community OTC signal results (90-day window) · Effective results honor admin overrides · Historical performance only — not a promise of future results
        </p>
      </div>
    </div>
  );
}