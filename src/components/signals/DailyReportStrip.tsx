'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Sparkles, RefreshCw, ArrowRight, Flame, BarChart3, Activity, AlertTriangle, Zap,
} from 'lucide-react';
import { getDailyMarketReport, type DailyReportData } from '@/app/actions/daily_report';

function confidenceChip(conf: DailyReportData['today']['confidence']) {
  if (conf === 'STRONG') return { icon: <Zap className="h-3 w-3" />, label: 'STRONG', cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' };
  if (conf === 'MODERATE') return { icon: <BarChart3 className="h-3 w-3" />, label: 'MODERATE', cls: 'text-amber-400 border-amber-500/30 bg-amber-500/5' };
  return { icon: <AlertTriangle className="h-3 w-3" />, label: 'WEAK', cls: 'text-rose-400 border-rose-500/30 bg-rose-500/5' };
}

export default function DailyReportStrip() {
  const [report, setReport] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      const res = await getDailyMarketReport();
      if (res.success && res.report) {
        setReport(res.report);
        setError(null);
      } else {
        setReport(null);
        setError(res.error || 'Failed to load market report');
      }
    } catch {
      setReport(null);
      setError('Failed to load market report');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getDailyMarketReport();
        if (cancelled) return;
        if (res.success && res.report) {
          setReport(res.report);
          setError(null);
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
    fetchReport().finally(() => setLoading(false));
  };

  const t = report?.today;

  return (
    <div className="glass-panel rounded-2xl border border-glass-border overflow-hidden animate-fadeInUp">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-glass-border/40 bg-slate-950/40">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <div>
            <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-widest block">
              AI Daily Market Report
            </span>
            <span className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
              {report ? report.dateLabel : "Loading today's pulse…"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded border border-purple-500/30 bg-purple-950/20 text-[8px] font-mono font-bold text-purple-300 uppercase tracking-wider">
            Community OTC · Live
          </span>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded border border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-colors disabled:opacity-50"
            title="Refresh report"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && report === null ? (
        <div className="p-5">
          <div className="h-9 bg-slate-900/60 rounded-lg animate-pulse" />
        </div>
      ) : error && report === null ? (
        <div className="p-5 flex items-center justify-between gap-4">
          <p className="text-xs font-mono text-slate-500">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded border border-glass-border text-[10px] font-mono font-bold text-slate-400 hover:text-slate-200 uppercase transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      ) : !report || !t ? (
        <div className="p-5 text-center">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">
            Report warming up — community OTC activity will appear here daily.
          </p>
        </div>
      ) : (
        <div className="px-5 py-4">
          {t.signals === 0 ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4 text-slate-500 shrink-0" />
                <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  No OTC activity yet today — check back after the evening session.
                </p>
              </div>
              <Link
                href="/dashboard/daily-report"
                className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-purple-400 hover:text-purple-300 uppercase tracking-wider transition-colors shrink-0"
              >
                View Full Report <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
                <div>
                  <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Flame className="h-3 w-3 text-amber-400" /> Best Performing Pair
                  </span>
                  <span className="block text-sm font-mono font-extrabold text-slate-200 mt-1">
                    {t.bestPair ? (
                      <>
                        {t.bestPair} <span className="text-[9px] font-bold text-emerald-400">OTC</span>{' '}
                        <span className="text-[10px] font-mono text-emerald-400 font-extrabold">{t.bestPairWinRate}%</span>
                      </>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <BarChart3 className="h-3 w-3 text-neon-green" /> Strongest Session
                  </span>
                  <span className="block text-sm font-mono font-extrabold text-slate-200 mt-1">
                    {t.strongestSession ? (
                      <>
                        {t.strongestSession.label}
                        <span className="text-[9px] text-slate-600"> · {t.strongestSession.range}</span>
                      </>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Activity className="h-3 w-3 text-neon-green" /> Today&apos;s Signal Activity
                  </span>
                  <span className="block text-sm font-mono font-extrabold text-slate-200 mt-1">
                    {t.signals} <span className="text-[9px] font-mono text-slate-600 font-bold">SIGNALS</span>{' '}
                    <span className="text-[9px] font-mono text-slate-600 font-bold">·</span>{' '}
                    <span className="text-[9px] font-mono text-emerald-400 font-extrabold">{t.winRate}% WIN RATE</span>
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Zap className="h-3 w-3 text-purple-400" /> AI Confidence
                  </span>
                  {t.confidence ? (
                    <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded border text-[9px] font-mono font-bold uppercase tracking-wider ${confidenceChip(t.confidence).cls}`}>
                      {confidenceChip(t.confidence).icon} {confidenceChip(t.confidence).label}
                    </span>
                  ) : (
                    <span className="block text-sm font-mono font-extrabold text-slate-600 mt-1">—</span>
                  )}
                </div>
              </div>
              <Link
                href="/dashboard/daily-report"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-purple-500/30 bg-purple-950/20 text-[10px] font-mono font-bold text-purple-300 hover:text-purple-200 hover:border-purple-500/50 transition-colors uppercase tracking-wider shrink-0"
              >
                View Full Report <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-glass-border/40 bg-slate-950/40">
        <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
          Aggregated from community OTC signal results · Historical performance only — not a promise of future results
        </p>
      </div>
    </div>
  );
}