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
    statCells.push(
      { label: 'TRADES', value: `${summary.trades}`, sub: `${summary.activeDays} active days` },
      { label: 'WINS', value: `${summary.wins}`, sub: `${summary.losses} losses`, accent: '#34d399' },
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

  const gridCols = isWide ? (statCells.length >= 9 ? 5 : 4) : 2;

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
          padding: isWide ? u(56) : u(64),
          gap: isWide ? u(28) : u(36),
          border: `1px solid rgba(148,163,184,0.25)`,
          borderRadius: u(28),
          margin: isWide ? u(14) : u(18),
          boxShadow: `0 0 ${u(64)}px rgba(52,211,153,0.10), 0 0 ${u(120)}px rgba(168,85,247,0.12), inset 0 0 ${u(80)}px rgba(52,211,153,0.04)`,
          background: 'rgba(2,5,11,0.72)',
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: u(16) }}>
            <div
              style={{
                width: u(56),
                height: u(56),
                borderRadius: u(16),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: u(30),
                background: 'linear-gradient(135deg, rgba(52,211,153,0.25), rgba(168,85,247,0.25))',
                border: '1px solid rgba(52,211,153,0.4)',
                boxShadow: '0 0 24px rgba(52,211,153,0.35)',
              }}
            >
              🧲
            </div>
            <div>
              <div style={{ fontSize: u(26), fontWeight: 900, letterSpacing: u(3), background: 'linear-gradient(90deg, #34d399, #a78bfa)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                MAGNET OF TRADE
              </div>
              <div style={{ fontSize: u(16), letterSpacing: u(4), color: '#94a3b8', marginTop: u(4) }}>AI TRADING INTELLIGENCE</div>
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
          <div style={{ fontSize: u(20), color: '#a5b4fc', marginTop: u(8), fontWeight: 700 }}>
            📅 {windowLabel}
          </div>
        </div>

        {/* Hero: win rate */}
        {summary && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: u(28), flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: isWide ? u(20) : u(22), letterSpacing: u(4), color: '#94a3b8' }}>WIN RATE</div>
              <div
                style={{
                  fontSize: isWide ? u(110) : u(140),
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
        )}

        {/* Stats grid */}
        {summary && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gap: u(14),
            }}
          >
            {statCells.map((c) => (
              <div
                key={c.label}
                style={{
                  padding: `${u(16)}px ${u(20)}px`,
                  borderRadius: u(16),
                  border: '1px solid rgba(148,163,184,0.22)',
                  background: 'rgba(15,23,42,0.55)',
                  boxShadow: 'inset 0 0 30px rgba(52,211,153,0.03)',
                }}
              >
                <div style={{ fontSize: u(13), letterSpacing: u(2), color: '#64748b' }}>{c.label}</div>
                <div
                  style={{
                    fontSize: isWide ? u(30) : u(34),
                    fontWeight: 900,
                    marginTop: u(6),
                    color: c.accent ?? '#e2e8f0',
                    textShadow: c.accent ? `0 0 26px ${c.accent}55` : '0 0 20px rgba(226,232,240,0.18)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.value}
                </div>
                <div style={{ fontSize: u(13), color: '#64748b', marginTop: u(4) }}>{c.sub}</div>
              </div>
            ))}
          </div>
        )}

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

        <div style={{ flex: 1 }} />

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: u(20),
            paddingTop: u(24),
            borderTop: '1px solid rgba(148,163,184,0.18)',
          }}
        >
          <div>
            <div style={{ fontSize: u(20), fontWeight: 900, letterSpacing: u(2), color: '#c7d2fe' }}>🧲 MAGNET OF TRADE</div>
            <div style={{ fontSize: u(15), letterSpacing: u(2), color: '#64748b', marginTop: u(4) }}>
              AI TRADING INTELLIGENCE · @magnetoftrade
            </div>
          </div>
          {qrDataUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: u(16) }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: u(15), color: '#94a3b8', letterSpacing: u(1) }}>Scan to visit</div>
                <div style={{ fontSize: u(14), color: '#64748b', marginTop: u(2), maxWidth: u(260), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {data.siteUrl}
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- QR is a generated client-side data URL, not a remote image */}
              <img
                src={qrDataUrl}
                alt="QR"
                style={{
                  width: u(96),
                  height: u(96),
                  borderRadius: u(12),
                  background: '#ffffff',
                  padding: u(6),
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