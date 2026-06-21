import React from 'react';
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
  ChevronRight, ArrowRight, Zap, Target, Star, Lock
} from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay relative">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 overflow-hidden border-b border-glass-border">
        {/* Animated canvas wave lines */}
        <HeroCanvas />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Headline & CTAs */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-gold-vip/30 bg-gold-vip/5 text-gold-vip text-xs font-mono font-semibold tracking-wider">
                <Star className="h-3.5 w-3.5 fill-gold-vip" /> VIP TRADING ACCESS
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-mono tracking-tight leading-tight">
                Advanced Trading <span className="text-neon-green glow-text-green">Journal</span> For Professional Traders
              </h1>
              <p className="text-slate-400 text-base sm:text-lg max-w-2xl leading-relaxed">
                Unlock the statistics of your binary options and financial market performance. Log trades, audit your trading psychology, visualize risk parameters, and gain VIP edge.
              </p>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
                <Link
                  href="https://broker-qx.pro/sign-up/?lid=1712337"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3.5 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-sm tracking-wider text-center transition-all shadow-lg glow-button flex items-center justify-center gap-2"
                >
                  <span>NEW USER ACCOUNT OPEN</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/register-info"
                  className="px-6 py-3.5 rounded border border-glass-border hover:border-neon-green/30 bg-slate-900/40 text-slate-300 hover:text-neon-green text-sm tracking-wider text-center transition-all flex items-center justify-center gap-1.5"
                >
                  <span>Register Account</span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* AI Style Trading Dashboard Preview (Visual 2) */}
            <div className="lg:col-span-5 w-full">
              <div className="relative">
                {/* Visual glow frame */}
                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-neon-green/20 to-gold-vip/20 blur opacity-70 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative">
                  <AIPreview />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Visual Live Terminal Widgets Grid (Visuals 3, 4, 5, 6, 9) */}
      <section id="charts" className="py-20 border-b border-glass-border bg-slate-950/60 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-2xl sm:text-4xl font-bold font-mono tracking-tight">
              Institutional Terminal <span className="text-neon-green">Visualizations</span>
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Real-time monitoring widgets built to track critical technical indices, sizing parameters, orderflows, and trader emotional biases.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Visual 3: Candlestick Market Visual */}
            <div className="h-[280px] w-full">
              <LiveCandlestick />
            </div>

            {/* Visual 4: Orderflow Visualization */}
            <div className="h-[280px] w-full">
              <OrderflowVisual />
            </div>

            {/* Visual 5: Risk Management Visual */}
            <div className="h-[280px] w-full">
              <RiskManagementVisual />
            </div>

            {/* Visual 6: Trading Psychology Visual */}
            <div className="h-[280px] w-full">
              <TradingPsychologyVisual />
            </div>
          </div>

          {/* Visual 9: Trader Statistics Card */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'AVERAGE SHARPE RATIO', value: '2.84', desc: 'Indicates high risk-adjusted consistency.', icon: Shield },
              { label: 'MAX CONSECUTIVE WINS', value: '14 Trades', desc: 'Peak performance streak recorded this month.', icon: Zap },
              { label: 'AVERAGE DRAWDOWN LIMIT', value: '3.42%', desc: 'Strict drawdown controls keeping capital safe.', icon: Target }
            ].map((stat, i) => (
              <div key={i} className="glass-panel glass-panel-hover p-5 rounded-lg flex items-start justify-between">
                <div className="space-y-2">
                  <span className="text-[10px] font-mono text-slate-500 tracking-wider block">{stat.label}</span>
                  <span className="text-2xl font-bold font-mono text-slate-100 block">{stat.value}</span>
                  <p className="text-xs text-slate-400 leading-normal">{stat.desc}</p>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-glass-border">
                  <stat.icon className="h-5 w-5 text-neon-green" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 border-b border-glass-border bg-slate-950/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-2xl sm:text-4xl font-bold font-mono tracking-tight">
              SaaS Engine <span className="text-neon-green">Features</span>
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Designed specifically for binary option and broker traders looking to transition from gambling to systemic professional trading.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                title: 'Advanced Analytics',
                desc: 'Generate 10 institutional charts showing equity curves, consistency scores, time analysis, and strategy P&L variables.',
                icon: BarChart3
              },
              {
                title: 'Trade Tracking',
                desc: 'Save and update every order. Store asset types, entry/exit price metrics, strategies used, and upload screenshots.',
                icon: BookOpen
              },
              {
                title: 'Psychology Review',
                desc: 'Assess and monitor your discipline parameters. Identify and suppress FOMO or emotional trading loops systematically.',
                icon: Shield
              },
              {
                title: 'VIP Strategy Access',
                desc: 'Connect with VIP strategies. Get optimized trading templates and exclusive indicators when signing up with our broker partner.',
                icon: Award
              }
            ].map((feature, i) => (
              <div key={i} className="glass-panel glass-panel-hover p-6 rounded-lg space-y-4">
                <div className="p-3 bg-neon-green/5 border border-neon-green/20 rounded-md w-12 h-12 flex items-center justify-center">
                  <feature.icon className="h-6 w-6 text-neon-green" />
                </div>
                <h3 className="text-lg font-mono font-bold text-slate-100">{feature.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Visual 8: VIP Membership Section */}
      <section id="vip" className="py-20 border-b border-glass-border relative overflow-hidden bg-[#050915]">
        {/* Ambient gold background light */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gold-vip/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Benefits copy */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-gold-vip/40 bg-gold-vip/10 text-gold-vip text-xs font-mono font-semibold tracking-wider">
                <Award className="h-4 w-4" /> VIP PLATINUM ACCESS
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold font-mono tracking-tight leading-tight">
                Unlock High-Consistency VIP Access
              </h2>
              <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
                By registering an account with our partner broker link, you qualify for lifetime VIP access to this advanced journal and premium signal features at no monthly cost.
              </p>

              <ul className="space-y-3 font-mono text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-vip" /> LIFETIME UNRESTRICTED ACCESS TO JOURNAL
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-vip" /> 10 INTEGRATED PERFORMANCE CHARTS
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-vip" /> EXCLUSIVE VIP BINARY STRATEGY SCRIPTS
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold-vip" /> DIRECT VIP ADMIN CHAT TELEGRAM HELP
                </li>
              </ul>

              <div className="pt-2">
                <Link
                  href="https://broker-qx.pro/sign-up/?lid=1712337"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded bg-gold-vip text-slate-950 font-bold hover:bg-gold-vip-hover text-sm tracking-wider transition-all glow-button-gold"
                >
                  <span>NEW USER ACCOUNT OPEN</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Premium Gold Card Visual */}
            <div className="lg:col-span-5">
              <div className="glass-card-gold p-8 rounded-2xl relative border border-gold-vip/25 text-left overflow-hidden">
                <div className="absolute top-0 right-0 p-4 font-mono text-[9px] text-gold-vip/55">VIP CLASS</div>
                <div className="flex justify-between items-start mb-12">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-gold-vip/70 tracking-wider">PLATFORM ACCESS CARD</span>
                    <h3 className="text-xl font-mono font-extrabold text-gold-vip glow-text-gold tracking-wide">QUOTEX ADVANCE VIP</h3>
                  </div>
                  <Award className="h-8 w-8 text-gold-vip" />
                </div>

                <div className="space-y-6">
                  <div className="font-mono text-lg text-slate-200 tracking-widest font-semibold flex items-center justify-between">
                    <span>TRADER PROFILE</span>
                    <span className="text-xs text-slate-500 font-normal">STATUS: ACTIVE</span>
                  </div>

                  <div className="border-t border-gold-vip/10 pt-4 flex justify-between items-center text-xs text-slate-400">
                    <div>
                      <div className="text-[9px] text-slate-600 font-mono">ISSUED BY</div>
                      <div className="font-bold text-gold-vip/80">SYSTEM COMPLIANCE</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-slate-600 font-mono">FEE</div>
                      <div className="font-bold text-neon-green">$0 / LIFETIME</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Visual 10: Dark futuristic trading workspace background section */}
      <section className="py-16 bg-terminal-bg border-b border-glass-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="glass-panel border border-slate-900 p-6 rounded-lg font-mono text-[10px] text-slate-500 space-y-2.5 max-w-4xl mx-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-900">
              <span className="text-slate-400 font-bold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-neon-green animate-pulse" /> JOURNAL WORKSPACE SUBSYSTEMS
              </span>
              <span className="text-[9px]">SYSTEM LOAD: 4.2%</span>
            </div>
            <div>[INFO] BOOTSTRAPPING QUOTEX ADVANCE KERNEL v2.5.42... SUCCESS</div>
            <div>[INFO] DATABASE CONNECTED. POOL SIZE: 20 CLIENTS. INITIALIZING RLS POLICIES... DONE</div>
            <div>[INFO] VIRTUAL EMAIL AUTH PROTOCOLS ACTIVATED FOR UNCOMPROMISED ID MANAGEMENT</div>
            <div>[WARNING] PENDING USER ACCOUNT DETECTED. ADMIN AUDITING PROTOCOL WAITING ON ACTION</div>
            <div className="text-neon-green flex items-center gap-1.5 font-bold pt-1.5">
              <Lock className="h-3 w-3" /> SECURE HANDSHAKE VERIFIED. INITIALIZING FINTECH GATEWAY.
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
