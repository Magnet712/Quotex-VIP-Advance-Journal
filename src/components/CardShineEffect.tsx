'use client';

import React from 'react';

export default function CardShineEffect() {
  return (
    <div 
      className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none rounded-[inherit]" 
      aria-hidden="true"
    >
      {/* ── Single Layer Hard Glass Reflection Band (Top-Left -> Bottom-Right) ── */}
      <div className="absolute top-0 left-0 w-[240%] h-[130px] -origin-top-left bg-gradient-to-b from-transparent via-white/[0.085] to-transparent blur-[32px] animate-card-shine" />
    </div>
  );
}
