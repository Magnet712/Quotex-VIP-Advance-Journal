'use client';

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { toPng, toBlob } from 'html-to-image';
import Link from 'next/link';
import {
  Trophy, RefreshCw, Download, Share2, Loader2, AlertTriangle,
  ShieldCheck, Shield, ShieldOff, CalendarRange, Sparkles, Medal, ArrowRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';
import PerformanceCard, { CARD_SIZES } from '@/components/signals/PerformanceCard';
import { getAchievements, type AchievementsData } from '@/app/actions/achievements';

type PrivacyMode = 'public' | 'semi' | 'anon';
type PeriodMode = 'weekly' | 'monthly';

const PRIVACY_OPTIONS: { key: PrivacyMode; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'public', label: 'Public', desc: 'Full name · stats · badges', icon: <ShieldCheck className="h-4 w-4" /> },
  { key: 'semi', label: 'Semi-Private', desc: 'First name · stats · no ID', icon: <Shield className="h-4 w-4" /> },
  { key: 'anon', label: 'Anonymous', desc: 'Performance only · no name', icon: <ShieldOff className="h-4 w-4" /> },
];

const PERIOD_LABEL: Record<PeriodMode, { label: string; sub: string }> = {
  weekly: { label: 'WEEKLY PERFORMANCE', sub: 'Auto-derived every Monday from this week\'s journal' },
  monthly: { label: 'MONTHLY PERFORMANCE', sub: 'Auto-derived on the 1st from this month\'s journal' },
};

const BADGE_SHELF: { key: string; emoji: string; name: string; desc: string }[] = [
  { key: 'consistency', emoji: '🏆', name: 'Consistency Master', desc: '5+ active days in the current week' },
  { key: 'win80', emoji: '⚡', name: '80% Win Club', desc: '≥10 trades with 80%+ win rate this week' },
  { key: 'pair_specialist', emoji: '🥇', name: 'Best Pair Specialist', desc: '10+ trades on your best pair at 70%+' },
  { key: 'weekly_champion', emoji: '📈', name: 'Weekly Champion', desc: '15+ trades at 75%+ win rate this week' },
  { key: 'monthly_champion', emoji: '📈', name: 'Monthly Champion', desc: '15+ trades at 75%+ win rate this month' },
  { key: 'streak7', emoji: '🔥', name: '7-Day Streak', desc: 'Traded on 7 consecutive days ever' },
  { key: 'trades100', emoji: '🏅', name: '100 Trades', desc: '100 journaled trades all-time' },
  { key: 'trades500', emoji: '🏅', name: '500 Trades', desc: '500 journaled trades all-time' },
  { key: 'journal_master', emoji: '📔', name: 'Journal Master', desc: '80%+ of trades logged with risk + emotion' },
  { key: 'risk_master', emoji: '🛡️', name: 'Risk Master', desc: 'Average risk ≤ 1.5% of balance' },
];

export default function AchievementsPage() {
  const [data, setData] = useState<AchievementsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<boolean | null>(null);

  const [period, setPeriod] = useState<PeriodMode>('weekly');
  const [sizeIdx, setSizeIdx] = useState(0);
  const [privacy, setPrivacy] = useState<PrivacyMode>('semi');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'none' | 'download' | 'share'>('none');

  const nodeRef = useRef<HTMLDivElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const [previewW, setPreviewW] = useState(860);
  const cardSize = CARD_SIZES[sizeIdx];

  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setPreviewW(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
        const res = await getAchievements();
        if (cancelled) return;
        if (res.success && res.data) {
          setData(res.data);
          setError(null);
        } else {
          setData(null);
          setError(res.error || 'Failed to load achievements');
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setError('Failed to load achievements');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Generate QR once the site URL is known (auto-generated card = always ready)
  useEffect(() => {
    if (!data || qrDataUrl) return;
    QRCode.toDataURL(data.siteUrl, { width: 256, margin: 0 })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(null));
  }, [data, qrDataUrl]);

  const handleDownload = async () => {
    const node = nodeRef.current;
    if (!node || busy !== 'none') return;
    try {
      setBusy('download');
      const url = await toPng(node, { pixelRatio: 1 });
      const a = document.createElement('a');
      a.href = url;
      a.download = `Magnet-of-Trade-${period.toUpperCase()}-${cardSize.w}x${cardSize.h}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setError('Failed to render card image');
    } finally {
      setBusy('none');
    }
  };

  const handleShare = async () => {
    const node = nodeRef.current;
    if (!node || busy !== 'none') return;
    try {
      setBusy('share');
      const blob = await toBlob(node, { pixelRatio: 1 });
      if (!blob) throw new Error('render failed');
      const file = new File([blob], `Magnet-of-Trade-${period.toUpperCase()}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Trading Performance Card — Magnet of Trade',
          text: 'My weekly trading performance powered by MAGNET OF TRADE AI Trading Intelligence',
        });
      } else {
        await handleDownload();
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      await handleDownload();
    } finally {
      setBusy('none');
    }
  };

  if (access === false) {
    return <LockedFeature feature="journal" />;
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 w-full max-w-7xl mx-auto animate-fadeIn">
        <div className="h-24 w-full animate-pulse rounded-xl bg-slate-900/80 border border-glass-border" />
        <div className="h-[420px] w-full animate-pulse rounded-xl bg-slate-900/80 border border-glass-border" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto animate-fadeIn">
        <div className="glass-panel p-6 rounded-xl border border-rose-500/30 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-6 w-6 text-rose-400" />
          <p className="text-sm text-slate-300">{error || 'Failed to load achievements'}</p>
          <button
            onClick={() => { setLoading(true); setError(null); window.location.reload(); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-mono font-bold text-[11px] uppercase tracking-wider hover:bg-emerald-500/20 transition-colors"
          >
            <Loader2 className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const current = period === 'weekly' ? data.weekly : data.monthly;
  const earnedSet = new Set<string>([...data.lifetime.badges, ...(current?.badges ?? [])]);
  const previewScale = Math.min(1, previewW / cardSize.w);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto animate-fadeIn">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-glass-border pb-6 animate-fadeInUp">
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-gold-vip font-bold uppercase tracking-wider block">share your success</span>
          <h1 className="text-3xl font-bold font-mono tracking-tight bg-gradient-to-r from-emerald-300 via-amber-300 to-purple-300 bg-clip-text text-transparent">
            🏆 Trading Achievements
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Weekly &amp; monthly performance cards, auto-derived from your journal. Download, share, collect badges.
          </p>
        </div>
        <Link
          href="/dashboard/magnet"
          className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-purple-300 uppercase tracking-wider hover:text-purple-200 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" /> See it in Magnet AI <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

        {/* ── Studio / Preview ─────────────────────────────── */}
        <div className="space-y-4">
          {/* Controls */}
          <div className="glass-panel p-4 rounded-xl border border-glass-border space-y-4">
            {/* Period */}
            <div>
              <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-mono uppercase tracking-widest mb-2">
                <CalendarRange className="h-3.5 w-3.5 text-neon-green" /> Card Type
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['weekly', 'monthly'] as PeriodMode[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-2.5 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition-all ${
                      period === p
                        ? 'border-neon-green/40 bg-neon-green/10 text-neon-green glow-shadow-green'
                        : 'border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    {p === 'weekly' ? '📅 Weekly' : '🗓️ Monthly'}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-slate-600 font-mono mt-2 leading-relaxed">{PERIOD_LABEL[period].sub}</p>
            </div>

            {/* Size */}
            <div>
              <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-mono uppercase tracking-widest mb-2">
                <Trophy className="h-3.5 w-3.5 text-gold-vip" /> Social Size
              </div>
              <div className="flex flex-wrap gap-2">
                {CARD_SIZES.map((s, i) => (
                  <button
                    key={s.key}
                    onClick={() => setSizeIdx(i)}
                    className={`px-3 py-2 rounded-lg border text-[9px] font-mono font-bold uppercase tracking-wider transition-all ${
                      sizeIdx === i
                        ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
                        : 'border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    {s.label}<br /><span className="text-[8px] opacity-70">{s.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Privacy */}
            <div>
              <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-mono uppercase tracking-widest mb-2">
                <Shield className="h-3.5 w-3.5 text-sky-400" /> Privacy
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PRIVACY_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setPrivacy(opt.key)}
                    className={`px-2 py-2.5 rounded-lg border text-left transition-all ${
                      privacy === opt.key
                        ? 'border-sky-400/40 bg-sky-500/10'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                    }`}
                  >
                    <span className={`flex items-center gap-1 text-[10px] font-mono font-bold uppercase ${privacy === opt.key ? 'text-sky-300' : 'text-slate-400'}`}>
                      {opt.icon} {opt.label}
                    </span>
                    <span className="block text-[8px] text-slate-600 mt-1 leading-snug">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleShare}
                disabled={busy !== 'none'}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-mono font-bold text-[10px] uppercase tracking-wider hover:bg-emerald-500/20 disabled:opacity-50 transition-all"
              >
                {busy === 'share' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} Share
              </button>
              <button
                onClick={handleDownload}
                disabled={busy !== 'none'}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-purple-500/40 bg-purple-500/10 text-purple-300 font-mono font-bold text-[10px] uppercase tracking-wider hover:bg-purple-500/20 disabled:opacity-50 transition-all"
              >
                {busy === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download PNG
              </button>
            </div>
            <p className="text-[9px] text-slate-600 font-mono leading-relaxed">
              Share opens Telegram / WhatsApp / native picker where supported — otherwise it downloads the PNG.
            </p>
            <p className="text-[9px] text-slate-500 font-sans leading-relaxed border-t border-slate-800/60 pt-2">
              ⚠️ <span className="font-semibold text-slate-400">Disclaimer:</span> Performance cards are for personal sharing only and reflect past journaled trades. They do not constitute financial advice or guarantee future results. Trade responsibly.
            </p>
          </div>
        </div>

        {/* ── Card Preview ─────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">LIVE PREVIEW · {cardSize.w} × {cardSize.h}</span>
            {!current && (
              <span className="text-[9px] font-mono text-amber-400 uppercase tracking-wider">No {period} trades yet — journal to fill this card</span>
            )}
          </div>
          <div
            ref={previewBoxRef}
            className="relative w-full rounded-xl border border-glass-border bg-slate-950/40 overflow-hidden"
            style={{ height: Math.round(cardSize.h * previewScale) }}
          >
            <div
              style={{
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
                position: 'absolute',
                top: 0,
                left: 0,
              }}
            >
              <PerformanceCard
                data={data}
                period={period}
                size={cardSize}
                privacy={privacy}
                qrDataUrl={qrDataUrl}
                nodeRef={nodeRef}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── My Trading Achievements (Trophy Shelf) ─────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <Medal className="h-4 w-4 text-gold-vip" />
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-slate-300">My Trading Achievements</h2>
          <span className="text-[9px] font-mono text-slate-600">({earnedSet.size}/{BADGE_SHELF.length} earned)</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {BADGE_SHELF.map((b) => {
            const earned = earnedSet.has(b.key);
            return (
              <div
                key={b.key}
                className={`p-4 rounded-xl border transition-all duration-300 ${
                  earned
                    ? 'border-amber-500/40 bg-gradient-to-br from-amber-950/30 to-transparent shadow-glow-gold'
                    : 'border-slate-800/80 bg-slate-950/40 opacity-60 grayscale'
                }`}
              >
                <div className={`text-2xl ${earned ? '' : 'opacity-40'}`}>{b.emoji}</div>
                <div className={`text-[11px] font-mono font-extrabold mt-2 ${earned ? 'text-amber-300' : 'text-slate-500'}`}>{b.name}</div>
                <div className="text-[8px] text-slate-600 font-sans mt-1 leading-snug">{b.desc}</div>
                <div className={`mt-2 text-[8px] font-mono font-bold uppercase tracking-wider ${earned ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {earned ? '✓ Earned' : 'Locked'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Lifetime summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'ALL-TIME TRADES', value: `${data.lifetime.trades}`, sub: `${data.lifetime.activeDays} active days` },
            { label: 'ALL-TIME WIN RATE', value: `${data.lifetime.winRate}%`, sub: `${data.lifetime.wins} wins` },
            { label: 'BEST STREAK', value: `🔥 ${data.lifetime.bestStreak} days`, sub: 'consecutive trading days' },
            { label: 'JOURNAL COMPLETION', value: `${data.lifetime.completion}%`, sub: 'risk + emotion logged' },
          ].map((s) => (
            <div key={s.label} className="glass-panel p-4 rounded-xl border border-glass-border">
              <div className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">{s.label}</div>
              <div className="text-lg font-mono font-extrabold text-slate-100 mt-1">{s.value}</div>
              <div className="text-[8px] font-mono text-slate-600 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-sky-500/20 bg-sky-500/5">
          <RefreshCw className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
            Cards auto-generate from your journal every Monday (weekly) and the 1st (monthly) — just come back and download. All figures are derived from your own journaled trades; historical performance only.
          </p>
        </div>
      </section>
    </div>
  );
}