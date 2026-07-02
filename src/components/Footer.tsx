import React from 'react';
import Link from 'next/link';
import { TrendingUp, ShieldCheck, Mail, HelpCircle } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-glass-border bg-slate-950 text-slate-400 py-12 px-4 sm:px-6 lg:px-8 mt-auto">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Brand column */}
        <div className="space-y-4 col-span-1 md:col-span-2">
          <Link href="/" className="flex items-center space-x-2 text-neon-green glow-text-green font-mono font-bold tracking-wider text-base">
            <TrendingUp className="h-5 w-5 text-neon-green" />
            <span>QUOTEX ADVANCE JOURNAL</span>
          </Link>
          <p className="text-slate-500 text-sm max-w-md leading-relaxed">
            The ultimate companion for binary options and financial traders. Journal your trades, study performance analytics with institutional-grade tools, and scale your consistency with mathematical discipline.
          </p>
          <div className="flex items-center space-x-4 text-xs text-slate-500 pt-2">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-neon-green" /> Secure 256-bit encryption
            </span>
          </div>
        </div>

        {/* Links Column */}
        <div className="space-y-3">
          <h4 className="text-slate-200 font-mono text-sm font-semibold tracking-wider uppercase">Platform</h4>
          <ul className="space-y-2 text-sm text-slate-500">
            <li>
              <Link href="/#features" className="hover:text-neon-green transition-colors">Features</Link>
            </li>
            <li>
              <Link href="/#vip" className="hover:text-gold-vip transition-colors">VIP Membership</Link>
            </li>
            <li>
              <Link href="/#charts" className="hover:text-neon-green transition-colors">Analytical Charts</Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-neon-green transition-colors">Pricing & Membership</Link>
            </li>
            <li>
              <Link href="/register-info" className="hover:text-neon-green transition-colors">How it Works</Link>
            </li>
          </ul>
        </div>

        {/* Contact/Support */}
        <div className="space-y-3">
          <h4 className="text-slate-200 font-mono text-sm font-semibold tracking-wider uppercase">Support</h4>
          <ul className="space-y-2 text-sm text-slate-500">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-500" />
              <span className="text-slate-400">{process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'vip-support@quotex.journal'}</span>
            </li>
            <li className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-slate-500" />
              <Link href="/register-info" className="hover:text-neon-green transition-colors">Activation Guide</Link>
            </li>
            <li className="pt-2">
              <Link
                href="https://broker-qx.pro/sign-up/?lid=1712337"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-3 py-1.5 rounded border border-gold-vip/30 hover:border-gold-vip text-gold-vip text-xs font-semibold tracking-wider transition-colors"
              >
                CREATE BROKER ACCOUNT
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <hr className="border-slate-900 my-8 max-w-7xl mx-auto" />

      {/* Disclaimers & Copyright */}
      <div className="max-w-7xl mx-auto text-xs text-slate-600 space-y-4">
        <p className="leading-relaxed">
          <strong className="text-slate-500">Risk Warning:</strong> Trading binary options, Forex, and other financial instruments involves significant risk of loss and is not suitable for all investors. The high degree of leverage can work against you as well as for you. Before deciding to trade, you should carefully consider your investment objectives, level of experience, and risk appetite. Under no circumstances shall Quotex Advance Journal have any liability to any person or entity for any loss or damage in whole or part caused by, resulting from, or relating to any transactions.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-between pt-2">
          <span>&copy; {new Date().getFullYear()} Quotex Advance Journal. All rights reserved.</span>
          <span className="mt-2 sm:mt-0">Bloomberg Terminal Layout Inspired &bull; Institutional FinTech Platform</span>
        </div>
      </div>
    </footer>
  );
}
