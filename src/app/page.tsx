'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import HeroCanvas from '@/components/HeroCanvas';
import AIPreview from '@/components/AIPreview';
import LiveCandlestick from '@/components/LiveCandlestick';
import OrderflowVisual from '@/components/OrderflowVisual';
import RiskManagementVisual from '@/components/RiskManagementVisual';
import TradingPsychologyVisual from '@/components/TradingPsychologyVisual';
import { 
  TrendingUp, Award, BarChart3, Shield, BookOpen, Clock, 
  ChevronRight, ArrowRight, Zap, Target, Star, Lock,
  Users, Send, CheckCircle, HelpCircle,
  Sparkles, Calculator, ListTodo, Brain, ArrowDownUp
} from 'lucide-react';
import { 
  getPublicSignalPerformance, 
  getPublicRecentSignals, 
  getPublicCommunityStats 
} from '@/app/actions/signals';
import { getAllFeatureFlags } from '@/app/actions/feature_flags';
import { getAverageRating } from '@/app/actions/ratings';

export default function Home() {
  // Stats states
  const [stats, setStats] = useState<any>(null);
  const [recentSignals, setRecentSignals] = useState<any[]>([]);
  const [community, setCommunity] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Feature flag states
  const [flags, setFlags] = useState<Record<string, boolean>>({
    pricing_page: true,
    premium_signals: true,
    ai_review: true,
    checklists: true
  });

  // Preview Tabs state
  const [activePreviewTab, setActivePreviewTab] = useState<'journal' | 'analytics' | 'checklist' | 'signals' | 'winrate'>('journal');

  const [ratingData, setRatingData] = useState<{ average: number; count: number }>({ average: 4.8, count: 0 });

  useEffect(() => {
    async function loadHomepageData() {
      try {
        const [perfRes, signalsRes, commRes, flagsRes, ratingRes] = await Promise.all([
          getPublicSignalPerformance(),
          getPublicRecentSignals(3),
          getPublicCommunityStats(),
          getAllFeatureFlags(),
          getAverageRating()
        ]);

        if (perfRes.success) setStats(perfRes.stats);
        if (signalsRes.success) setRecentSignals(signalsRes.signals || []);
        if (commRes.success) setCommunity(commRes.stats);
        if (flagsRes.success) setFlags(flagsRes.flags);
        if (ratingRes.success && ratingRes.count > 0) {
          setRatingData({ average: ratingRes.average, count: ratingRes.count });
        }
      } catch (err) {
        console.error('Failed to load public landing page data:', err);
      } finally {
        setLoadingStats(false);
      }
    }
    loadHomepageData();
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay relative">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-24 pb-28 overflow-hidden border-b border-glass-border">
        {/* Animated canvas wave lines */}
        <HeroCanvas />

        {/* Ambient Lights */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none z-0" />
        <div className="absolute top-1/3 right-1/4 translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none z-0" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Headline & CTAs */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-gold-vip/30 bg-gold-vip/5 text-gold-vip text-xs font-mono font-semibold tracking-wider">
                <Star className="h-3.5 w-3.5 fill-gold-vip animate-pulse" /> VIP TRADING ACCESS
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-mono tracking-tight leading-tight">
                Master Your Quotex Trading With <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-neon-green glow-text-green">Advanced Journal</span> + AI Signal System
              </h1>
              <p className="text-slate-400 text-base sm:text-lg max-w-2xl leading-relaxed">
                Track every trade, analyze your performance, and access professional-grade trading tools designed for serious Quotex traders.
              </p>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
                <Link
                  href="/register-info"
                  className="px-6 py-3.5 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-sm tracking-wider text-center transition-all shadow-lg glow-button flex items-center justify-center gap-2"
                >
                  <span>🔥 Get Free VIP Journal</span>
                  <ArrowRight className="h-4 w-4 text-slate-950" />
                </Link>
                {flags.pricing_page && (
                  <Link
                    href="/pricing"
                    className="px-6 py-3.5 rounded border border-purple-500/35 hover:border-purple-500 bg-purple-500/5 hover:bg-purple-500/10 text-purple-300 hover:text-purple-200 text-sm tracking-wider text-center transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>⚡ Try Premium Signals</span>
                    <Zap className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>

            {/* AI Style Trading Dashboard Preview */}
            <div className="lg:col-span-5 w-full">
              <div className="relative">
                {/* Visual glow frame */}
                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-neon-green/20 blur opacity-75 transition duration-1000"></div>
                <div className="relative">
                  <AIPreview />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Part 2: Interactive Dashboard Preview */}
      <section className="py-24 border-b border-glass-border bg-slate-950/40 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 space-y-4">
            <h2 className="text-2xl sm:text-4xl font-bold font-mono tracking-tight">
              Interactive <span className="text-neon-green">Dashboard Preview</span>
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Explore the professional trading cockpit interface designed for continuous execution refinement.
            </p>
          </div>

          {/* Selector Tabs */}
          <div className="flex flex-wrap justify-center gap-2.5 mb-8">
            {[
              { id: 'journal', label: 'Trading Journal', icon: BookOpen },
              { id: 'analytics', label: 'Analytics Dashboard', icon: BarChart3 },
              { id: 'checklist', label: 'Trading Checklist', icon: ListTodo },
              { id: 'signals', label: 'Signal Dashboard', icon: Zap, premium: true },
              { id: 'winrate', label: 'Win Rate Analytics', icon: Target, premium: true }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActivePreviewTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg border text-xs font-mono font-bold tracking-wider uppercase transition-all ${
                  activePreviewTab === tab.id
                    ? tab.premium
                      ? 'bg-purple-950/20 border-purple-500/50 text-purple-300 glow-shadow-purple'
                      : 'bg-neon-green/10 border-neon-green/30 text-neon-green'
                    : 'bg-slate-900/30 border-glass-border text-slate-400 hover:text-slate-200'
                }`}
              >
                <tab.icon className="h-4.5 w-4.5" />
                <span>{tab.label}</span>
                {tab.premium && <span className="text-[8px] border border-purple-500/30 px-1 rounded text-purple-400 bg-purple-950/30">PRO</span>}
              </button>
            ))}
          </div>

          {/* Interactive Screen Preview Container */}
          <div className="glass-panel rounded-2xl border border-glass-border/60 bg-slate-900/10 p-6 min-h-[400px] flex flex-col justify-between relative overflow-hidden transition-all duration-500">
            {activePreviewTab === 'journal' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center pb-2 border-b border-glass-border">
                  <span className="text-xs font-mono font-semibold text-slate-300">LEDGER ENTRIES (SIMULATED PREVIEW)</span>
                  <span className="text-[10px] font-mono text-neon-green">3 ACTIVE TRADES TODAY</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-900">
                        <th className="py-2.5">DATE/TIME</th>
                        <th className="py-2.5">ASSET</th>
                        <th className="py-2.5">STRATEGY</th>
                        <th className="py-2.5">DIR</th>
                        <th className="py-2.5 text-right">P&L</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300 divide-y divide-slate-900/50">
                      <tr>
                        <td className="py-3 text-slate-500">2026-07-02 12:30</td>
                        <td className="py-3 font-semibold">EUR/USD OTC</td>
                        <td className="py-3">RSI Reversal + EMA50</td>
                        <td className="py-3 text-emerald-400">CALL</td>
                        <td className="py-3 text-right text-emerald-400 font-bold">+$85.00</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-slate-500">2026-07-02 12:15</td>
                        <td className="py-3 font-semibold">GBP/USD OTC</td>
                        <td className="py-3">Wick Rejection</td>
                        <td className="py-3 text-rose-400">PUT</td>
                        <td className="py-3 text-right text-rose-400 font-bold">-$100.00</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-slate-500">2026-07-02 11:45</td>
                        <td className="py-3 font-semibold">USD/JPY OTC</td>
                        <td className="py-3">Orderflow Confluence</td>
                        <td className="py-3 text-emerald-400">CALL</td>
                        <td className="py-3 text-right text-emerald-400 font-bold">+$82.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activePreviewTab === 'analytics' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex justify-between items-center pb-2 border-b border-glass-border">
                  <span className="text-xs font-mono font-semibold text-slate-300">PERFORMANCE INDEX METRICS</span>
                  <span className="text-[10px] font-mono text-gold-vip font-bold">WIN RATE: 74.5%</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'PROFIT FACTOR', val: '2.14', color: 'text-neon-green' },
                    { label: 'CONSISTENCY SCORE', val: '86%', color: 'text-neon-green' },
                    { label: 'AVG DRAWDOWN', val: '2.84%', color: 'text-slate-300' },
                    { label: 'SHARPE RATIO', val: '2.45', color: 'text-gold-vip' }
                  ].map((metric, i) => (
                    <div key={i} className="bg-slate-950/80 border border-glass-border/40 p-4 rounded-lg space-y-1">
                      <span className="text-[8px] font-mono text-slate-500 block tracking-wider">{metric.label}</span>
                      <span className={`text-xl font-mono font-extrabold ${metric.color}`}>{metric.val}</span>
                    </div>
                  ))}
                </div>
                {/* Mock Area Chart */}
                <div className="h-28 w-full border border-glass-border/20 rounded bg-slate-950/40 p-2 relative flex items-end">
                  <div className="absolute inset-0 p-2 text-[8px] font-mono text-slate-600">VIRTUAL EQUITY LEDGER CURVE</div>
                  <div className="w-full h-16 flex items-end gap-1 px-2">
                    {[30, 45, 38, 55, 62, 58, 75, 84, 80, 92].map((height, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-gradient-to-t from-neon-green/10 to-neon-green/40 border-t border-neon-green/50 rounded-sm"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activePreviewTab === 'checklist' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center pb-2 border-b border-glass-border">
                  <span className="text-xs font-mono font-semibold text-slate-300">DISCIPLINE CHECKLIST</span>
                  <span className="text-[10px] font-mono text-slate-500">PRE-TRADE AUDITING RULES</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  {[
                    { rule: 'EMA50 Trend Confirmation', check: true },
                    { rule: 'RSI Reversal Point Check', check: true },
                    { rule: 'ATR Price Band Volatility Check', check: false },
                    { rule: 'Emotional State Verified (No FOMO)', check: true },
                    { rule: 'Maximum Trade Size Sizing Limit', check: true },
                    { rule: 'Exotic OTC Market Spread Margin Check', check: false }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-slate-950/50 border border-glass-border/30 rounded-lg text-xs font-mono">
                      <span className={`h-4.5 w-4.5 rounded flex items-center justify-center font-bold text-[10px] border ${
                        item.check 
                          ? 'border-neon-green/30 bg-neon-green/5 text-neon-green' 
                          : 'border-slate-800 text-slate-600'
                      }`}>
                        {item.check ? '✓' : ' '}
                      </span>
                      <span className={item.check ? 'text-slate-200' : 'text-slate-500 line-through'}>{item.rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activePreviewTab === 'signals' && (
              <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-5 animate-fadeIn">
                {/* Glow Background */}
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-10 flex flex-col items-center justify-center p-6 space-y-4">
                  <div className="h-14 w-14 rounded-full border border-purple-500/40 bg-purple-500/5 text-purple-400 flex items-center justify-center glow-shadow-purple animate-pulse">
                    <Lock className="h-6 w-6" />
                  </div>
                  <div className="space-y-1.5 max-w-sm">
                    <h3 className="text-base font-bold font-mono text-purple-300 uppercase tracking-widest">🔒 Premium Only</h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Upgrade to Premium Signal Pro to access the real-time AI automated signal engine, entry levels, indicators confluence, and instant live browser notifications.
                    </p>
                  </div>
                  <Link
                    href="/pricing"
                    className="px-5 py-2.5 rounded bg-purple-500 hover:bg-purple-600 text-slate-950 font-extrabold text-xs font-mono tracking-widest uppercase transition-colors"
                  >
                    Upgrade to Premium
                  </Link>
                </div>

                {/* Dummy Blurred content underneath */}
                <div className="w-full space-y-4 blur-[3px] select-none pointer-events-none opacity-20">
                  <div className="flex justify-between pb-2 border-b border-slate-900">
                    <span className="text-xs font-mono">LIVE PREVIEW</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="h-20 bg-slate-950 border rounded-lg" />
                    <div className="h-20 bg-slate-950 border rounded-lg" />
                    <div className="h-20 bg-slate-950 border rounded-lg" />
                  </div>
                </div>
              </div>
            )}

            {activePreviewTab === 'winrate' && (
              <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-5 animate-fadeIn">
                {/* Glow Background */}
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-10 flex flex-col items-center justify-center p-6 space-y-4">
                  <div className="h-14 w-14 rounded-full border border-purple-500/40 bg-purple-500/5 text-purple-400 flex items-center justify-center glow-shadow-purple animate-pulse">
                    <Lock className="h-6 w-6" />
                  </div>
                  <div className="space-y-1.5 max-w-sm">
                    <h3 className="text-base font-bold font-mono text-purple-300 uppercase tracking-widest">🔒 Premium Only</h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Strategy performance metrics, asset-specific win rate grids, and optimized hours analytics maps require an active Premium Signal Pro subscription.
                    </p>
                  </div>
                  <Link
                    href="/pricing"
                    className="px-5 py-2.5 rounded bg-purple-500 hover:bg-purple-600 text-slate-950 font-extrabold text-xs font-mono tracking-widest uppercase transition-colors"
                  >
                    Upgrade to Premium
                  </Link>
                </div>

                {/* Dummy Blurred content underneath */}
                <div className="w-full space-y-4 blur-[3px] select-none pointer-events-none opacity-20">
                  <div className="h-28 bg-slate-950 border rounded-lg" />
                  <div className="h-28 bg-slate-950 border rounded-lg" />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Part 3: How It Works Timeline */}
      <section className="py-24 border-b border-glass-border bg-[#030611] relative overflow-hidden">
        {/* Glow Light */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-neon-green/30 bg-neon-green/5 text-neon-green text-[10px] font-mono font-bold tracking-widest uppercase">
              Onboarding Path
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold font-mono tracking-tight leading-tight">
              Three-Step <span className="text-neon-green">Conversion Funnel</span>
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Seamlessly scale your access level from free community analysis to professional premium signals execution.
            </p>
          </div>

          {/* Timeline Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            
            {/* Step 1 */}
            <div className="glass-panel glass-panel-hover p-6 rounded-2xl relative space-y-4 text-left">
              <div className="h-10 w-10 bg-slate-900 border border-glass-border text-neon-green font-mono font-bold text-sm flex items-center justify-center rounded-lg">
                01
              </div>
              <h3 className="text-base font-mono font-bold text-slate-100 flex items-center gap-1.5">
                Join Free Community <Send className="h-4 w-4 text-slate-400" />
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Start by entering our Telegram channel. Access fundamental educational resources, select mock indicators, and review sample signal reports.
              </p>
              <div className="pt-2">
                <Link
                  href="https://t.me/Magnetoftrade" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-neon-green hover:underline uppercase"
                >
                  Join Channel <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Step 2 */}
            <div className="glass-panel glass-panel-hover p-6 rounded-2xl relative space-y-4 text-left border-gold-vip/25">
              <div className="h-10 w-10 bg-slate-900 border border-gold-vip/20 text-gold-vip font-mono font-bold text-sm flex items-center justify-center rounded-lg">
                02
              </div>
              <h3 className="text-base font-mono font-bold text-gold-vip flex items-center gap-1.5 glow-text-gold">
                Unlock VIP Journal <Award className="h-4.5 w-4.5 text-gold-vip fill-gold-vip/10" />
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Register a broker profile using our partner referral link. Unlock the Advanced Journal, the metrics dashboard, and full pre-trade checklist rules with zero fee.
              </p>
              <div className="pt-2">
                <Link
                  href="/register-info"
                  className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-gold-vip hover:underline uppercase"
                >
                  Get VIP Free (No Card Needed) <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Step 3 */}
            <div className="glass-panel glass-panel-hover p-6 rounded-2xl relative space-y-4 text-left border-purple-500/25 bg-[#0b071c]/30">
              <div className="h-10 w-10 bg-slate-900 border border-purple-500/20 text-purple-400 font-mono font-bold text-sm flex items-center justify-center rounded-lg">
                03
              </div>
              <h3 className="text-base font-mono font-bold text-purple-300 flex items-center gap-1.5">
                Upgrade to Premium <Zap className="h-4.5 w-4.5 text-purple-400" />
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Subscribe to Premium Signal Pro. Gain unrestricted immediate entry/expiry alerts, full signal logs, indicators confluence, and priority alert delivery.
              </p>
              <div className="pt-2">
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-purple-400 hover:underline uppercase"
                >
                  Unlock Premium Signals Now <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Part 4: SaaS Feature Cards */}
      <section id="features" className="py-24 border-b border-glass-border bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-2xl sm:text-4xl font-bold font-mono tracking-tight animate-pulseSlow">
              SaaS Engine <span className="text-neon-green">System Abstractions</span>
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Designed specifically to transition binary options and Forex traders from emotional bias to systemic mathematical discipline.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'Advanced Trading Journal',
                desc: 'Record and update trade entries, track direction, store asset details, capture screenshot parameters, and write comprehensive logs.',
                icon: BookOpen,
                color: 'text-neon-green',
                bg: 'bg-neon-green/5'
              },
              {
                title: 'Trade Analytics Ledger',
                desc: 'Generate 10 professional charts detailing virtual equity lines, strategy margins, consistency scores, and drawdown statistics.',
                icon: BarChart3,
                color: 'text-neon-green',
                bg: 'bg-neon-green/5'
              },
              {
                title: 'Discipline Checklist',
                desc: 'Create pre-trade rules and checklists to enforce strategy guidelines and strictly manage capital before executing any trade.',
                icon: ListTodo,
                color: 'text-neon-green',
                bg: 'bg-neon-green/5'
              },
              {
                title: 'Risk Calculator',
                desc: 'Determine optimum trade sizing dynamically based on current account capital rules and session drawdown controls.',
                icon: Calculator,
                color: 'text-neon-green',
                bg: 'bg-neon-green/5'
              },
              {
                title: 'AI Performance Review',
                desc: 'Leverage mathematical scoring to evaluate trading patterns, entry consistency, emotional states, and execution metrics.',
                icon: Brain,
                color: 'text-gold-vip',
                bg: 'bg-gold-vip/5',
                pro: true
              },
              {
                title: 'Premium Signal Engine',
                desc: 'Access live high-probability signal streams (OTC Forex assets) computed via automated technical indicator matrices.',
                icon: Zap,
                color: 'text-purple-400',
                bg: 'bg-purple-500/5',
                pro: true
              },
              {
                title: 'Psychology Tracker',
                desc: 'Log and review trader emotional state, identify FOMO triggers, analyze win/loss cycles, and suppress psychological biases.',
                icon: Shield,
                color: 'text-neon-green',
                bg: 'bg-neon-green/5'
              },
              {
                title: 'Signal History Ledger',
                desc: 'Examine complete historically resolved signals logs with verified WIN/LOSS outcomes determined by real candle close price feeds.',
                icon: Clock,
                color: 'text-purple-400',
                bg: 'bg-purple-500/5',
                pro: true
              }
            ].map((feature, i) => (
              <div key={i} className="glass-panel glass-panel-hover p-6 rounded-xl flex flex-col justify-between text-left space-y-4 border-glass-border">
                <div className="space-y-3">
                  <div className={`p-3 border border-glass-border/30 rounded-md w-12 h-12 flex items-center justify-center ${feature.bg}`}>
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <h3 className="text-sm font-mono font-bold text-slate-100 flex items-center justify-between">
                    <span>{feature.title}</span>
                    {feature.pro && <span className="text-[8px] font-mono border border-purple-500/35 px-1.5 py-0.5 rounded text-purple-300 bg-purple-950/20 uppercase">PRO</span>}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Part 5: Signal Preview Card Grid */}
      <section className="py-24 border-b border-glass-border bg-[#050915] relative overflow-hidden">
        {/* Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/5 text-purple-300 text-[10px] font-mono font-bold tracking-widest uppercase">
              Live Feed Demo
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold font-mono tracking-tight leading-tight">
              Real-Time <span className="text-purple-300">Signals Stream</span>
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Examine the live metrics computed by our indicator models. Premium metrics are blurred to safeguard active subscribers.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {loadingStats ? (
              // Loading Skeletons
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass-panel p-6 rounded-2xl border border-glass-border space-y-6 h-56 animate-pulse">
                  <div className="h-4 bg-slate-800 rounded w-1/3" />
                  <div className="h-8 bg-slate-800 rounded w-1/2" />
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-800 rounded w-3/4" />
                    <div className="h-3 bg-slate-800 rounded w-1/2" />
                  </div>
                </div>
              ))
            ) : recentSignals.length > 0 ? (
              recentSignals.map((sig, idx) => (
                <div key={sig.id || idx} className="glass-panel p-6 rounded-2xl relative border border-purple-500/20 bg-slate-950 text-left overflow-hidden flex flex-col justify-between min-h-[260px]">
                  
                  {/* Top Bar */}
                  <div className="flex justify-between items-center border-b border-glass-border pb-3">
                    <span className="text-xs font-mono font-bold text-purple-300">{sig.pair}</span>
                    <span className="text-[9px] font-mono border border-purple-500/30 px-2 py-0.5 rounded text-purple-300 uppercase tracking-widest">{sig.timeframe}</span>
                  </div>

                  {/* Signal Call */}
                  <div className="py-4 space-y-1 relative">
                    <span className="text-[8px] font-mono text-slate-500 tracking-wider uppercase block">Signal Direction</span>
                    {/* Blurred Area */}
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-mono font-extrabold text-purple-300 blur-[4px] select-none uppercase">
                        {sig.direction || 'CALL'}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-500">CONFIDENCE: <span className="blur-[4px] select-none text-purple-300">{sig.confidence || '92'}%</span></span>
                    </div>

                    {/* Blur Cover */}
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[3.5px] z-10 flex flex-col items-center justify-center p-2 rounded text-center border border-glass-border/30">
                      <Lock className="h-4.5 w-4.5 text-purple-400 animate-pulse mb-1.5" />
                      <span className="text-[9px] font-mono text-purple-300 font-bold tracking-wider uppercase block mb-1">🔒 Premium Member Only</span>
                      <Link 
                        href="/pricing"
                        className="text-[8px] font-mono font-bold bg-purple-500 hover:bg-purple-600 text-slate-950 px-2.5 py-1 rounded transition-colors uppercase tracking-wider"
                      >
                        Upgrade Now
                      </Link>
                    </div>
                  </div>

                  {/* Details block */}
                  <div className="border-t border-glass-border pt-3 flex justify-between items-center text-[10px] font-mono text-slate-500">
                    <div>
                      <div>ENTRY TIME</div>
                      <div className="font-semibold text-slate-400">{new Date(sig.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className="text-right">
                      <div>RESULT</div>
                      <div className="font-bold text-slate-400">PENDING</div>
                    </div>
                  </div>

                </div>
              ))
            ) : (
              // Hardcoded placeholder blur cards in case of completely empty database
              [
                { pair: 'EUR/USD OTC', dir: 'CALL', conf: '94%' },
                { pair: 'GBP/USD OTC', dir: 'PUT', conf: '88%' },
                { pair: 'USD/JPY OTC', dir: 'CALL', conf: '91%' }
              ].map((mock, idx) => (
                <div key={idx} className="glass-panel p-6 rounded-2xl relative border border-purple-500/20 bg-slate-950 text-left overflow-hidden flex flex-col justify-between min-h-[260px]">
                  
                  {/* Top Bar */}
                  <div className="flex justify-between items-center border-b border-glass-border pb-3">
                    <span className="text-xs font-mono font-bold text-purple-300">{mock.pair}</span>
                    <span className="text-[9px] font-mono border border-purple-500/30 px-2 py-0.5 rounded text-purple-300 uppercase tracking-widest">1M</span>
                  </div>

                  {/* Signal Call */}
                  <div className="py-4 space-y-1 relative">
                    <span className="text-[8px] font-mono text-slate-500 tracking-wider uppercase block">Signal Direction</span>
                    {/* Blurred Area */}
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-mono font-extrabold text-purple-300 blur-[4px] select-none uppercase">
                        {mock.dir}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-500">CONFIDENCE: <span className="blur-[4px] select-none text-purple-300">{mock.conf}</span></span>
                    </div>

                    {/* Blur Cover */}
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[3.5px] z-10 flex flex-col items-center justify-center p-2 rounded text-center border border-glass-border/30">
                      <Lock className="h-4.5 w-4.5 text-purple-400 animate-pulse mb-1.5" />
                      <span className="text-[9px] font-mono text-purple-300 font-bold tracking-wider uppercase block mb-1">🔒 Premium Member Only</span>
                      <Link 
                        href="/pricing"
                        className="text-[8px] font-mono font-bold bg-purple-500 hover:bg-purple-600 text-slate-950 px-2.5 py-1 rounded transition-colors uppercase tracking-wider"
                      >
                        Upgrade Now
                      </Link>
                    </div>
                  </div>

                  {/* Details block */}
                  <div className="border-t border-glass-border pt-3 flex justify-between items-center text-[10px] font-mono text-slate-500">
                    <div>
                      <div>ENTRY TIME</div>
                      <div className="font-semibold text-slate-400">12:35 PM</div>
                    </div>
                    <div className="text-right">
                      <div>RESULT</div>
                      <div className="font-bold text-slate-400">RESOLVED</div>
                    </div>
                  </div>

                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Part 6: Performance Preview Section (Hidden as requested)
      <section className="py-24 border-b border-glass-border bg-slate-950/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-2xl sm:text-4xl font-bold font-mono tracking-tight">
              Verified <span className="text-neon-green">Live Market Performance</span>
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Consolidated real-time execution statistics derived directly from database logs recorded over the last 30 days.
            </p>
          </div>

          {loadingStats ? (
            <div className="max-w-3xl mx-auto h-24 bg-slate-900 border border-glass-border rounded-lg animate-pulse" />
          ) : stats && stats.total > 0 ? (
            <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-6">
              {[
                { label: 'TOTAL SIGNALS', val: stats.total, color: 'text-slate-200' },
                { label: 'TOTAL WINS', val: stats.wins, color: 'text-emerald-400' },
                { label: 'TOTAL LOSSES', val: stats.losses, color: 'text-rose-400' },
                { label: 'ACCURACY RATE', val: `${stats.accuracy}%`, color: 'text-gold-vip font-extrabold text-2xl' },
                { label: 'DAILY AVERAGE', val: stats.dailyAverage, color: 'text-blue-400' }
              ].map((item, idx) => (
                <div key={idx} className="glass-panel border border-glass-border/60 p-5 rounded-xl space-y-1.5 text-center flex flex-col justify-center">
                  <span className="text-[8px] font-mono text-slate-500 tracking-wider uppercase block">{item.label}</span>
                  <span className={`text-xl font-mono font-extrabold ${item.color}`}>{item.val}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto p-12 glass-panel border border-glass-border/40 text-center rounded-xl font-mono space-y-3">
              <Shield className="h-10 w-10 text-slate-600 animate-bounce mx-auto" />
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">No Historical Data Available Yet</h3>
              <p className="text-xs text-slate-500 font-sans max-w-sm mx-auto leading-relaxed">
                The signal processing ledger is currently compiling records. Check back shortly to audit verified win rates.
              </p>
            </div>
          )}
        </div>
      </section>
      */}

      {/* Part 7: Community Section */}
      <section className="py-24 border-b border-glass-border bg-[#030611] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center text-left">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-neon-green/30 bg-neon-green/5 text-neon-green text-[10px] font-mono font-bold tracking-widest uppercase">
                Global Network
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold font-mono tracking-tight leading-tight">
                Scale Your Sizing With Our <span className="text-neon-green">Global Network</span>
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed font-sans">
                Join thousands of active trading members using our institutional advanced logs, strategies scripts, and AI signals indicators to transition into professional consistency.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <Link
                  href="https://t.me/Magnetoftrade" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded border border-glass-border hover:border-blue-500/35 bg-blue-500/5 text-xs font-mono font-bold uppercase transition-all tracking-wider text-slate-300 hover:text-blue-400"
                >
                  <Send className="h-4 w-4" /> Join Telegram Community
                </Link>
                <Link
                  href="https://youtube.com/@magnetoftrade7751?si=Un1BlRIvS8z2Nd7W"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded border border-glass-border hover:border-rose-500/35 bg-rose-500/5 text-xs font-mono font-bold uppercase transition-all tracking-wider text-slate-300 hover:text-rose-400"
                >
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.516 3.5 12 3.5 12 3.5s-7.516 0-9.387.555A3.003 3.003 0 0 0 .502 6.163C0 8.07 0 12 0 12s0 3.93.502 5.837a3.003 3.003 0 0 0 2.11 2.108C4.483 20.5 12 20.5 12 20.5s7.516 0 9.387-.555a3.003 3.003 0 0 0 2.11-2.108C24 15.93 24 12 24 12s0-3.93-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  <span>Subscribe On YouTube</span>
                </Link>
              </div>
            </div>

            {/* Counts Grid */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Telegram Community', value: '34+', detail: 'Active Members' },
                { label: 'YouTube Channel', value: '27+', detail: 'Subscribers' },
                { label: 'Trading Members', value: community ? `${community.tradingMembers}` : '240+', detail: 'Verified Profiles' },
                { label: 'Journal Users', value: community ? `${community.journalUsers}` : '180+', detail: 'Active Ledgers' },
                { label: 'Premium Members', value: community ? `${community.premiumMembers}` : '45+', detail: 'Signal Subscribers' }
              ].slice(0, 4).map((cnt, i) => (
                <div key={i} className="glass-panel p-5 rounded-xl border border-glass-border text-left space-y-1">
                  <span className="text-[8px] font-mono text-slate-500 tracking-wider uppercase block">{cnt.label}</span>
                  <span className="text-xl sm:text-2xl font-mono font-extrabold text-slate-200 block">{cnt.value}</span>
                  <span className="text-[10px] text-slate-400 font-sans block">{cnt.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Part 8: Testimonials (Dynamic Carousel - Hides gracefully if empty) */}
      {/* We do not have any seeded testimonials inside the database. So this section is hidden gracefully. */}

      {/* Part 9: Final CTA */}
      <section className="py-24 relative overflow-hidden bg-[#040815]">
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-r from-blue-500/10 to-neon-green/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10 space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-5xl font-extrabold font-mono tracking-tight leading-tight">
              Stop Guessing. Start Winning.
            </h2>
            {ratingData.count > 0 && (
              <div className="flex items-center justify-center gap-2 font-mono">
                <span className="text-gold-vip text-lg">★★★★★</span>
                <span className="text-gold-vip font-bold text-base">{ratingData.average}</span>
                <span className="text-slate-500 text-base">/ 5</span>
                <span className="text-slate-600 text-[9px] uppercase tracking-widest ml-1">{ratingData.count} Member{ratingData.count !== 1 ? 's' : ''} Rated</span>
              </div>
            )}
            <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              Unlock the advanced statistical ledger dashboard or subscribe to receive premium live signal entries.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register-info"
              className="w-full sm:w-auto px-8 py-4 rounded bg-gold-vip text-slate-950 font-bold hover:bg-gold-vip-hover text-sm tracking-wider uppercase transition-all glow-button-gold flex items-center justify-center gap-2"
            >
              <span>Get Free VIP Journal</span>
              <ArrowRight className="h-4 w-4 text-slate-950" />
            </Link>
            <Link
              href="/pricing"
              className="w-full sm:w-auto px-8 py-4 rounded border border-glass-border hover:border-neon-green/30 bg-slate-900/40 text-slate-300 hover:text-neon-green text-sm tracking-wider uppercase transition-all flex items-center justify-center gap-1.5"
            >
              <span>View Membership Plans</span>
              <ChevronRight className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Institutional Bloomberg terminal config audit logs */}
      <section className="py-12 bg-terminal-bg border-t border-glass-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="glass-panel border border-slate-900 p-6 rounded-lg font-mono text-[10px] text-slate-500 space-y-2 max-w-4xl mx-auto text-left">
            <div className="flex items-center justify-between pb-2 border-b border-slate-900 mb-2">
              <span className="text-slate-400 font-bold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-neon-green animate-pulse" /> JOURNAL WORKSPACE SUBSYSTEMS
              </span>
              <span className="text-[9px]">SYSTEM LOAD: 2.1%</span>
            </div>
            <div>[INFO] BOOTSTRAPPING QUOTEX ADVANCE KERNEL v2.5.42... SUCCESS</div>
            <div>[INFO] SAAS REGISTRATION HANDSHAKES PROTOCOLS... ACTIVE</div>
            <div>[INFO] PREMIUM SIGNALS WEBHOOKS LISTENER... WAITING FOR INCOMING TRIGGERS</div>
            <div className="text-neon-green flex items-center gap-1.5 font-bold pt-1">
              <Lock className="h-3 w-3" /> SECURE HANDSHAKE VERIFIED. SYSTEM STATUS STABLE.
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
