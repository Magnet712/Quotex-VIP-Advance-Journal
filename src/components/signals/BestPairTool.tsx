'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Search, Loader2, TrendingUp, CheckCircle2, AlertTriangle, BookOpen } from 'lucide-react';
import { getBestPairAnalysis, type BestPairData, type BestPairEntry } from '@/app/actions/best_pair';

function sampleChip(sample: BestPairEntry['sample']) {
  if (sample === 'HIGH') return { label: 'HIGH SAMPLE', cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' };
  if (sample === 'MEDIUM') return { label: 'MEDIUM SAMPLE', cls: 'text-amber-400 border-amber-500/30 bg-amber-500/5' };
  return { label: 'LOW SAMPLE', cls: 'text-rose-400 border-rose-500/30 bg-rose-500/5' };
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

function PodiumCard({ entry, place }: { entry: BestPairEntry; place: number }) {
  const chip = sampleChip(entry.sample);
  return (
    <div
      className={`glass-panel border rounded-2xl p-6 text-center space-y-3 transition-all duration-300 ${
        place === 1 ? 'border-amber-500/40 bg-amber-950/5' : 'border-glass-border'
      }`}
    >
      <span className="text-4xl">{entry.medal}</span>
      <div className="space-y-0.5">
        <div className="text-sm font-mono font-extrabold text-slate-100">{entry.pair}</div>
        <div className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">OTC + market pairs</div>
      </div>
      <div>
        <span className={`text-3xl font-mono font-extrabold ${winRateColor(entry.winRate)}`}>{entry.winRate}%</span>
        <span className="text-[9px] font-mono text-slate-600 block mt-1 uppercase tracking-wider">
          YOUR WIN RATE
        </span>
      </div>
      <div className="space-y-2">
        <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 max-w-[140px] mx-auto">
          <div className={`h-full rounded-full bg-gradient-to-r ${barColor(entry.winRate)}`} style={{ width: `${entry.winRate}%` }} />
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className={`inline-flex px-2 py-0.5 rounded border text-[8px] font-mono font-bold uppercase tracking-wider ${chip.cls}`}>
            {chip.label}
          </span>
          <span className="text-[8px] font-mono text-slate-600">{entry.wins}W/{entry.trades - entry.wins}L</span>
        </div>
      </div>
    </div>
  );
}

export default function BestPairTool() {
  const [data, setData] = useState<BestPairData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await getBestPairAnalysis();
      if (res.success && res.data) {
        setData(res.data);
        setRevealed(true);
      } else {
        setError(res.error || 'Failed to analyze best pair');
      }
    } catch {
      setError('Failed to analyze best pair');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="glass-panel border border-glass-border rounded-2xl p-6 space-y-5 animate-fadeInUp" style={{ animationDelay: '0.05s' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-purple-400 uppercase tracking-widest">
            <Search className="h-4 w-4" /> Find My Best Pair
          </span>
          <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
            Rank the pairs in your journal by your real win rate
          </p>
        </div>
        {!revealed && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-purple-500/50 bg-purple-950/30 text-[11px] font-mono font-bold text-purple-300 hover:bg-purple-900/40 hover:text-purple-200 transition-colors uppercase tracking-wider disabled:opacity-60 self-start sm:self-auto glow-shadow-purple"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing Your Journal…
              </>
            ) : (
              <>
                <Search className="h-4 w-4" /> Find My Best Pair
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/10 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[10px] font-mono text-rose-300 uppercase tracking-wider">{error}</p>
          <button
            onClick={handleAnalyze}
            className="px-3 py-1.5 rounded border border-rose-500/30 text-[9px] font-mono font-bold text-rose-300 uppercase tracking-wider transition-colors hover:bg-rose-950/20 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {revealed && data && data.status === 'warming' && (
        <div className="text-center space-y-4 py-4">
          <BookOpen className="h-8 w-8 text-gold-vip mx-auto" />
          <div className="space-y-2">
            <p className="text-sm font-mono font-extrabold text-slate-200 uppercase tracking-wider">Best-Pair Rank Warming Up</p>
            <p className="text-[10px] font-mono text-slate-500 max-w-md mx-auto leading-relaxed">
              Log {5 - Math.min(5, data.totalTrades)} more trade{data.totalTrades === 4 ? '' : 's'} to reveal your ranked pairs.
            </p>
          </div>
          <div className="max-w-sm mx-auto space-y-2">
            <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold-vip to-amber-400 transition-all duration-700"
                style={{ width: `${Math.min(100, (data.totalTrades / 5) * 100)}%` }}
              />
            </div>
            <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">{data.totalTrades} / 5 trades logged</p>
          </div>
          <Link
            href="/dashboard/journal"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-gold-vip/40 bg-gold-vip/10 text-[10px] font-mono font-bold text-gold-vip hover:bg-gold-vip/20 transition-colors uppercase tracking-wider inline-block"
          >
            <BookOpen className="h-3.5 w-3.5" /> Open Journal
          </Link>
        </div>
      )}

      {revealed && data && data.status === 'ready' && (
        <div className="space-y-5">
          {data.podium.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {data.podium.map((p, idx) => (
                <PodiumCard key={p.pair} entry={p} place={idx + 1} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/25 bg-amber-950/10 px-5 py-4 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] font-mono text-amber-300/90 uppercase tracking-wider leading-relaxed">
                No pair has 3+ journaled trades yet — log more trades on your focus pairs to unlock the podium.
              </p>
            </div>
          )}

          {data.pairs.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[8px] font-mono text-slate-600 uppercase tracking-widest">Full Pair Ranking</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-[#030812] border-b border-glass-border text-slate-500 uppercase tracking-wider text-[8px]">
                    <tr>
                      <th className="p-3 pl-0">#</th>
                      <th className="p-3">PAIR</th>
                      <th className="p-3 text-right">TRADES</th>
                      <th className="p-3 text-right">WINS</th>
                      <th className="p-3 pr-0">WIN RATE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/30 text-slate-300">
                    {data.pairs.map((p) => (
                      <tr key={p.pair} className="hover:bg-slate-900/10 transition-all duration-150">
                        <td className="p-3 pl-0 text-center">
                          {p.medal ? (
                            <span className="text-sm">{p.medal}</span>
                          ) : (
                            <span className="text-slate-600">{p.rank}</span>
                          )}
                        </td>
                        <td className="p-3 font-bold text-slate-200">
                          {p.pair}
                          <span className={`ml-1.5 px-1.5 py-0.5 rounded border text-[7px] font-bold uppercase tracking-wider ${sampleChip(p.sample).cls}`}>
                            {sampleChip(p.sample).label.split(' ')[0]}
                          </span>
                        </td>
                        <td className="p-3 text-right text-slate-400">{p.trades}</td>
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
            </div>
          )}

          {data.focusTip && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/10 px-5 py-3.5 flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[10px] font-mono text-emerald-300/90 uppercase tracking-wider leading-relaxed">
                {data.focusTip}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
              <TrendingUp className="inline h-3 w-3 mr-1 text-neon-green" />
              Ranked from your journaled trades · Low samples are flagged — not treated as certainty
            </p>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-800 text-[9px] font-mono font-bold text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-colors uppercase tracking-wider shrink-0 disabled:opacity-60"
            >
              {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} Re-Analyze
            </button>
          </div>
        </div>
      )}
    </div>
  );
}