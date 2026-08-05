'use client';

import React from 'react';
import type { AchievementsData, PeriodSummary } from '@/app/actions/achievements';

export interface CardSize {
  w: number;
  h: number;
}

export const CARD_SIZES: { key: string; label: string; w: number; h: number; hint: string }[] = [
  { key: 'story', label: 'Instagram Story', w: 1080, h: 1920, hint: '1080 × 1920' },
  { key: 'post', label: 'Instagram Post', w: 1080, h: 1080, hint: '1080 × 1080' },
  { key: 'telegram', label: 'Telegram', w: 1200, h: 630, hint: '1200 × 630' },
  { key: 'linkedin', label: 'LinkedIn', w: 1200, h: 627, hint: '1200 × 627' },
  { key: 'x', label: 'X (Twitter)', w: 1600, h: 900, hint: '1600 × 900' },
];

const BADGE_LABELS: Record<string, string> = {
  consistency: '🏆 Consistency Master',
  win80: '⚡ 80% Win Club',
  pair_specialist: '🥇 Best Pair Specialist',
  weekly_champion: '📈 Weekly Champion',
  monthly_champion: '📈 Monthly Champion',
  streak7: '🔥 7-Day Streak',
  trades100: '🏅 100 Trades',
  trades500: '🏅 500 Trades',
  journal_master: '📔 Journal Master',
  risk_master: '🛡️ Risk Master',
};

function badgeLabel(key: string): string {
  return BADGE_LABELS[key] ?? key;
}

interface PerformanceCardProps {
  data: AchievementsData;
  period: 'weekly' | 'monthly';
  size: CardSize;
  privacy: 'public' | 'semi' | 'anon';
  qrDataUrl: string | null;
  nodeRef: React.RefObject<HTMLDivElement | null>;
}

export default function PerformanceCard({ data, period, size, privacy, qrDataUrl, nodeRef }: PerformanceCardProps) {
  const k = size.w / 1080;
  const u = (px: number) => Math.round(px * k);
  const ratio = size.w / size.h;
  const isWide = ratio >= 1;

  const summary: PeriodSummary | null = period === 'weekly' ? data.weekly : data.monthly;
  const periodLabel = period === 'weekly' ? 'WEEKLY PERFORMANCE' : 'MONTHLY PERFORMANCE';
  const windowLabel = summary?.windowLabel ?? '—';

  const displayName =
    privacy === 'public'
      ? data.name
      : privacy === 'semi'
        ? data.name.split(' ')[0] || data.name
        : 'Private Trader';

  const badges = summary ? [...summary.badges, ...data.lifetime.badges] : data.lifetime.badges;
  const uniqueBadges = [...new Set(badges)];

  const statCells: { label: string; value: string; sub?: string; accent?: string }[] = [];

  if (summary) {
    const winRate = summary.trades > 0 ? Math.round((summary.wins / summary.trades) * 100) : null;
    statCells.push(
      { label: 'TRADES', value: `${summary.trades}`, sub: `${summary.activeDays} active days` },
      { label: 'WINS', value: `${summary.wins}`, sub: `${summary.losses} losses`, accent: '#34d399' },
      { label: 'WIN RATE', value: winRate !== null ? `${winRate}%` : '—', sub: summary.trades > 0 ? `${summary.trades} total trades` : 'no trades yet', accent: winRate !== null && winRate >= 60 ? '#34d399' : winRate !== null && winRate >= 50 ? '#fbbf24' : '#fb7185' },
      { label: 'BEST PAIR', value: summary.bestPair ?? '—', sub: summary.bestPair ? `${summary.bestPairWinRate}% · ${summary.bestPairN} trades` : 'needs ≥3 trades' },
      { label: 'AVG CONFIDENCE', value: summary.avgConfidence !== null ? `${summary.avgConfidence}%` : '—', sub: 'your OTC scans' },
      { label: 'BEST SESSION', value: summary.bestSession ?? '—', sub: summary.bestSession ? `${summary.bestSessionWinRate}% · ${summary.bestSessionN} trades` : 'IST window' },
      { label: 'RISK DISCIPLINE', value: summary.riskGrade?.grade ?? '—', sub: summary.riskGrade ? `${summary.riskGrade.avgPct.toFixed(1)}% avg risk` : 'needs ≥5 risk %' },
    );
    if (period === 'monthly') {
      statCells.push(
        { label: 'NET P/L', value: `${summary.netPL >= 0 ? '+' : ''}${summary.netPL.toFixed(2)}`, sub: 'journaled sum', accent: summary.netPL >= 0 ? '#34d399' : '#fb7185' },
        { label: 'BEST DAY', value: summary.bestDay?.label ?? '—', sub: summary.bestDay ? `${summary.bestDay.winRate}% · ${summary.bestDay.trades} trades` : 'needs ≥3 trades/day' },
        { label: 'JOURNAL COMPLETION', value: `${summary.completion}%`, sub: 'risk + emotion logged' },
      );
    }
  }

  const gridCols = isWide
    ? (statCells.length > 0 ? Math.min(statCells.length, 7) : 7)
    : 2;

  return (
    <div
      ref={nodeRef}
      style={{
        width: size.w,
        height: size.h,
        position: 'relative',
        overflow: 'hidden',
        background: 'radial-gradient(120% 90% at 15% 0%, #0b2440 0%, #061223 45%, #02050b 100%)',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        color: '#e2e8f0',
      }}
    >
      {/* Glow blobs */}
      <div
        style={{
          position: 'absolute',
          width: u(620),
          height: u(620),
          left: -u(220),
          top: -u(220),
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(52,211,153,0.28) 0%, rgba(52,211,153,0) 65%)',
          filter: 'blur(30px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: u(680),
          height: u(680),
          right: -u(240),
          bottom: -u(240),
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,85,247,0.30) 0%, rgba(168,85,247,0) 65%)',
          filter: 'blur(34px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: u(420),
          height: u(420),
          right: u(140),
          top: isWide ? -u(160) : u(90),
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(250,204,21,0.14) 0%, rgba(250,204,21,0) 60%)',
          filter: 'blur(26px)',
        }}
      />

      {/* Subtle grid texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.05,
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.4) 1px, transparent 1px)',
          backgroundSize: `${u(56)}px ${u(56)}px`,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: isWide ? u(32) : u(64),
          paddingLeft: isWide ? u(32) : u(64),
          paddingRight: isWide ? u(32) : u(64),
          paddingBottom: isWide ? u(130) : u(64),
          gap: isWide ? u(16) : u(36),
          border: `1px solid rgba(148,163,184,0.25)`,
          borderRadius: u(28),
          margin: isWide ? u(10) : u(18),
          boxShadow: `0 0 ${u(64)}px rgba(52,211,153,0.10), 0 0 ${u(120)}px rgba(168,85,247,0.12), inset 0 0 ${u(80)}px rgba(52,211,153,0.04)`,
          background: 'rgba(2,5,11,0.72)',
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: u(16) }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/magnet-logo.png"
              alt="Magnet of Trade"
              style={{
                width: isWide ? u(56) : u(80),
                height: isWide ? u(56) : u(80),
                borderRadius: u(8),
                objectFit: 'contain',
                flexShrink: 0,
                border: '1.5px solid rgba(52,211,153,0.55)',
                boxShadow: '0 0 18px rgba(52,211,153,0.40), 0 0 6px rgba(52,211,153,0.20)',
              }}
            />
            <div>
              <div style={{ fontSize: u(22), fontWeight: 900, letterSpacing: u(2), color: '#c7d2fe' }}>MAGNET OF TRADE</div>
              <div style={{ fontSize: u(14), letterSpacing: u(4), color: '#94a3b8', marginTop: u(4) }}>AI TRADING INTELLIGENCE</div>
            </div>
          </div>
          <div
            style={{
              padding: `${u(10)}px ${u(22)}px`,
              borderRadius: u(999),
              border: '1px solid rgba(52,211,153,0.45)',
              background: 'rgba(52,211,153,0.10)',
              color: '#6ee7b7',
              fontWeight: 800,
              fontSize: u(18),
              letterSpacing: u(3),
              boxShadow: '0 0 22px rgba(52,211,153,0.25)',
              whiteSpace: 'nowrap',
            }}
          >
            {periodLabel}
          </div>
        </div>

        {/* Trader identity + window */}
        <div>
          <div style={{ fontSize: u(15), letterSpacing: u(4), color: '#64748b', textTransform: 'uppercase' }}>Trader</div>
          <div
            style={{
              fontSize: isWide ? u(44) : u(58),
              fontWeight: 900,
              letterSpacing: u(2),
              marginTop: u(6),
              textShadow: '0 0 30px rgba(167,139,250,0.45)',
            }}
          >
            {displayName}
          </div>
          <div style={{ fontSize: u(20), color: windowLabel === '—' ? '#334155' : '#a5b4fc', marginTop: u(8), fontWeight: 700 }}>
            📅 {windowLabel === '—' ? 'No trades recorded yet' : windowLabel}
          </div>
        </div>

        {/* Hero: win rate — tall cards only (wide cards use stats grid to save vertical space) */}
        {!isWide && (summary ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: u(28), flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: u(22), letterSpacing: u(4), color: '#94a3b8' }}>WIN RATE</div>
              <div
                style={{
                  fontSize: u(140),
                  fontWeight: 900,
                  lineHeight: 1,
                  marginTop: u(8),
                  background: 'linear-gradient(180deg, #a7f3d0, #34d399 60%, #059669)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  textShadow: '0 0 60px rgba(52,211,153,0.35)',
                }}
              >
                {summary.winRate}%
              </div>
            </div>
            <div style={{ display: 'flex', gap: u(16), paddingBottom: u(10) }}>
              <div
                style={{
                  padding: `${u(14)}px ${u(28)}px`,
                  borderRadius: u(16),
                  border: '1px solid rgba(52,211,153,0.4)',
                  background: 'rgba(52,211,153,0.08)',
                  boxShadow: '0 0 26px rgba(52,211,153,0.18)',
                }}
              >
                <div style={{ fontSize: u(30), fontWeight: 900, color: '#6ee7b7' }}>{summary.wins}</div>
                <div style={{ fontSize: u(14), letterSpacing: u(2), color: '#64748b' }}>WINS</div>
              </div>
              <div
                style={{
                  padding: `${u(14)}px ${u(28)}px`,
                  borderRadius: u(16),
                  border: '1px solid rgba(251,113,133,0.35)',
                  background: 'rgba(251,113,133,0.06)',
                }}
              >
                <div style={{ fontSize: u(30), fontWeight: 900, color: '#fda4af' }}>{summary.losses}</div>
                <div style={{ fontSize: u(14), letterSpacing: u(2), color: '#64748b' }}>LOSSES</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: u(28), flexWrap: 'wrap', opacity: 0.35 }}>
            <div>
              <div style={{ fontSize: u(22), letterSpacing: u(4), color: '#475569' }}>WIN RATE</div>
              <div style={{ fontSize: u(140), fontWeight: 900, lineHeight: 1, marginTop: u(8), color: '#1e293b' }}>—%</div>
            </div>
            <div style={{ display: 'flex', gap: u(16), paddingBottom: u(10) }}>
              <div style={{ padding: `${u(14)}px ${u(28)}px`, borderRadius: u(16), border: '1px dashed rgba(52,211,153,0.15)', background: 'rgba(52,211,153,0.03)' }}>
                <div style={{ fontSize: u(30), fontWeight: 900, color: '#1e293b' }}>—</div>
                <div style={{ fontSize: u(14), letterSpacing: u(2), color: '#334155' }}>WINS</div>
              </div>
              <div style={{ padding: `${u(14)}px ${u(28)}px`, borderRadius: u(16), border: '1px dashed rgba(251,113,133,0.15)', background: 'rgba(251,113,133,0.02)' }}>
                <div style={{ fontSize: u(30), fontWeight: 900, color: '#1e293b' }}>—</div>
                <div style={{ fontSize: u(14), letterSpacing: u(2), color: '#334155' }}>LOSSES</div>
              </div>
            </div>
          </div>
        ))}

        {/* Stats grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: u(14),
          }}
        >
          {summary ? statCells.map((c) => (
            <div
              key={c.label}
              style={{
                padding: isWide ? `${u(10)}px ${u(14)}px` : `${u(16)}px ${u(20)}px`,
                borderRadius: u(16),
                border: '1px solid rgba(148,163,184,0.22)',
                background: 'rgba(15,23,42,0.55)',
                boxShadow: 'inset 0 0 30px rgba(52,211,153,0.03)',
              }}
            >
              <div style={{ fontSize: isWide ? u(11) : u(13), letterSpacing: u(2), color: '#64748b' }}>{c.label}</div>
              <div
                style={{
                  fontSize: isWide ? u(24) : u(34),
                  fontWeight: 900,
                  marginTop: u(4),
                  color: c.accent ?? '#e2e8f0',
                  textShadow: c.accent ? `0 0 26px ${c.accent}55` : '0 0 20px rgba(226,232,240,0.18)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.value}
              </div>
              <div style={{ fontSize: isWide ? u(11) : u(13), color: '#64748b', marginTop: u(3) }}>{c.sub}</div>
            </div>
          )) : [
            'TRADES', 'WINS', 'WIN RATE', 'BEST PAIR', 'AVG CONFIDENCE', 'BEST SESSION', 'RISK DISCIPLINE',
          ].map((label) => (
            <div
              key={label}
              style={{
                padding: isWide ? `${u(10)}px ${u(14)}px` : `${u(16)}px ${u(20)}px`,
                borderRadius: u(16),
                border: '1px dashed rgba(148,163,184,0.10)',
                background: 'rgba(15,23,42,0.30)',
                opacity: 0.5,
              }}
            >
              <div style={{ fontSize: isWide ? u(11) : u(13), letterSpacing: u(2), color: '#334155' }}>{label}</div>
              <div style={{ fontSize: isWide ? u(24) : u(34), fontWeight: 900, marginTop: u(4), color: '#1e293b' }}>—</div>
              <div style={{ fontSize: isWide ? u(11) : u(13), color: '#1e293b', marginTop: u(3) }}>journal to unlock</div>
            </div>
          ))}
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: u(12), alignItems: 'center' }}>
          <span style={{ fontSize: u(16), letterSpacing: u(3), color: '#94a3b8', marginRight: u(6) }}>BADGES</span>
          {uniqueBadges.length > 0 ? (
            uniqueBadges.slice(0, 5).map((b) => (
              <span
                key={b}
                style={{
                  padding: `${u(10)}px ${u(20)}px`,
                  borderRadius: u(999),
                  border: '1px solid rgba(250,204,21,0.35)',
                  background: 'rgba(250,204,21,0.08)',
                  color: '#fde68a',
                  fontSize: u(17),
                  fontWeight: 800,
                  boxShadow: '0 0 22px rgba(250,204,21,0.15)',
                  whiteSpace: 'nowrap',
                }}
              >
                {badgeLabel(b)}
              </span>
            ))
          ) : (
            <span style={{ fontSize: u(17), color: '#64748b', fontStyle: 'italic' }}>Keep trading — badges unlock as you build history.</span>
          )}
        </div>


        {/* Footer — absolutely pinned to bottom, always visible */}
        <div
          style={{
            position: 'absolute',
            bottom: isWide ? u(24) : u(64),
            left: isWide ? u(32) : u(64),
            right: isWide ? u(32) : u(64),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: u(20),
            paddingTop: u(18),
            borderTop: '1px solid rgba(148,163,184,0.18)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: u(12) }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/magnet-logo.png"
              alt="Magnet of Trade"
              style={{
                width: isWide ? u(36) : u(52),
                height: isWide ? u(36) : u(52),
                borderRadius: u(6),
                objectFit: 'contain',
                flexShrink: 0,
                border: '1px solid rgba(52,211,153,0.50)',
                boxShadow: '0 0 14px rgba(52,211,153,0.35)',
              }}
            />
            <div>
              <div style={{ fontSize: isWide ? u(16) : u(20), fontWeight: 900, letterSpacing: u(2), color: '#c7d2fe' }}>MAGNET OF TRADE</div>
              <div style={{ fontSize: isWide ? u(12) : u(15), letterSpacing: u(2), color: '#64748b', marginTop: u(4) }}>
                AI TRADING INTELLIGENCE · @magnetoftrade
              </div>
            </div>
          </div>
          {qrDataUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: u(12) }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: isWide ? u(12) : u(15), color: '#94a3b8', letterSpacing: u(1) }}>Scan to visit</div>
                <div style={{ fontSize: isWide ? u(11) : u(14), color: '#64748b', marginTop: u(2), maxWidth: u(220), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {data.siteUrl}
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- QR is a generated client-side data URL, not a remote image */}
              <img
                src={qrDataUrl}
                alt="QR"
                style={{
                  width: isWide ? u(64) : u(96),
                  height: isWide ? u(64) : u(96),
                  borderRadius: u(10),
                  background: '#ffffff',
                  padding: u(5),
                  boxShadow: '0 0 30px rgba(255,255,255,0.22)',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}