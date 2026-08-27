'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';

const CONSENT_KEY = 'cookie_consent_v1';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      try {
        const stored = localStorage.getItem(CONSENT_KEY);
        if (!cancelled && stored !== 'accepted') setVisible(true);
      } catch {
        if (!cancelled) setVisible(true);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'accepted');
    } catch {
      /* ignore storage errors */
    }
    setVisible(false);
  };

  const dismiss = () => setVisible(false);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-[100]">
      <div className="glass-panel p-4 rounded-xl border border-glass-border space-y-3 animate-fadeIn">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] text-slate-300 leading-relaxed">
            We use <strong>cookies and analytics (Google Analytics, Microsoft Clarity)</strong> to improve the site and
            understand how members use the tool. See our{' '}
            <Link href="/privacy-policy" className="text-neon-green underline">Privacy Policy</Link> and{' '}
            <Link href="/terms-of-service" className="text-neon-green underline">Terms of Service</Link>.
          </p>
          <button
            onClick={dismiss}
            aria-label="Dismiss cookie notice"
            className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={accept}
            className="flex-1 py-2 rounded bg-neon-green/15 border border-neon-green/40 text-neon-green text-xs font-mono font-bold uppercase tracking-wider hover:bg-neon-green/25 transition-colors"
          >
            Accept & Continue
          </button>
        </div>
      </div>
    </div>
  );
}