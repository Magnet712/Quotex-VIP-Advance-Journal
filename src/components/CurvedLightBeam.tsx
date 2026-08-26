'use client';

import React from 'react';

export default function CurvedLightBeam() {
  return (
    <div 
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none" 
      aria-hidden="true"
    >
      {/* ── Top-Left Delicate Ambient Glow ── */}
      <div 
        className="absolute -top-36 -left-36 w-[420px] h-[420px] rounded-full bg-emerald-400/[0.08] blur-[140px] animate-pulse-slow" 
      />

      {/* ── Primary Soft Diagonal Sheen Sweep (Top-Left -> Bottom-Right) ── */}
      <div className="absolute top-0 left-0 w-[180vw] h-[320px] -origin-top-left bg-gradient-to-b from-transparent via-white/[0.035] to-transparent blur-[55px] animate-diagonal-shine" />

      {/* ── Secondary Mint Horizon Glow Sheen ── */}
      <div className="absolute top-0 left-0 w-[180vw] h-[260px] -origin-top-left bg-gradient-to-b from-transparent via-emerald-400/[0.03] to-transparent blur-[80px] animate-diagonal-shine-delayed" />
    </div>
  );
}
