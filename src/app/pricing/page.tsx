import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { createAdminClient } from '@/lib/supabase/admin';
import { 
  Check, Star, Award, Zap, HelpCircle, ArrowRight, ShieldCheck, Play 
} from 'lucide-react';
import { getFeatureFlag } from '@/app/actions/feature_flags';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pricing Plans - Quotex VIP Advance Journal',
  description: 'Choose your access tier for Quotex Advanced Journaling and AI signal engines. Free community access, VIP journal tools, and Premium Signals.',
};

async function getPricingConfig() {
  try {
    const supabase = createAdminClient();

    const { data: settingsData } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['price_premium_monthly', 'price_premium_6months', 'price_premium_lifetime']);

    const config: Record<string, string> = {
      price_premium_monthly: '$19',
      price_premium_6months: '$99',
      price_premium_lifetime: '$199'
    };

    (settingsData ?? []).forEach(row => {
      config[row.key] = row.value;
    });

    const { data: pricingData } = await supabase
      .from('pricing_settings')
      .select('id, price, discount')
      .in('id', ['premium_monthly', 'premium_6months', 'premium_lifetime']);

    const planDiscounts: Record<string, number> = {};
    const discountedPrices: Record<string, string> = {};

    if (pricingData && pricingData.length > 0) {
      pricingData.forEach(plan => {
        const d = plan.discount ?? 0;
        const key = plan.id === 'premium_monthly' ? 'monthly' : plan.id === 'premium_6months' ? 'sixMonths' : 'lifetime';
        planDiscounts[key] = d;
        const discounted = Math.max(0, plan.price - (plan.price * (d / 100)));
        discountedPrices[key] = Number.isInteger(discounted) ? `$${discounted}` : `$${discounted.toFixed(2)}`;
      });
    }

    return { ...config, planDiscounts, discountedPrices };
  } catch (err) {
    return {
      price_premium_monthly: '$19',
      price_premium_6months: '$99',
      price_premium_lifetime: '$199',
      planDiscounts: {} as Record<string, number>,
      discountedPrices: {} as Record<string, string>
    };
  }
}

export default async function PricingPage() {
  const isPricingEnabled = await getFeatureFlag('pricing_page', true);
  if (!isPricingEnabled) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay relative">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 max-w-xl mx-auto z-10">
          <div className="p-4 bg-purple-500/10 border border-purple-500/35 rounded-full animate-pulse">
            <Zap className="h-10 w-10 text-purple-400" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-slate-100 uppercase">PRICING CURRENTLY UNAVAILABLE</h1>
          <p className="text-xs text-slate-400 font-mono leading-relaxed">
            Our checkout portals and subscription processors are currently undergoing optimization. Please contact our support team on Telegram for direct enrollment details.
          </p>
          <Link
            href="https://t.me/Magnetoftrade"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-6 py-3 rounded bg-purple-500 text-slate-950 font-bold hover:bg-purple-600 text-xs font-mono uppercase tracking-wider transition-all"
          >
            Contact Admin on Telegram
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const prices = await getPricingConfig();

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay relative">
      <Navbar />

      {/* Decorative Lights */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-full blur-3xl pointer-events-none z-0" />
      <div className="absolute top-10 right-10 w-[300px] h-[300px] bg-neon-green/3 rounded-full blur-3xl pointer-events-none z-0" />

      {/* Content */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24 relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-neon-green/30 bg-neon-green/5 text-neon-green text-xs font-mono font-semibold tracking-wider uppercase">
            <Zap className="h-3.5 w-3.5" /> Pricing Options
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold font-mono tracking-tight leading-tight">
            Flexible Plans For <span className="text-neon-green glow-text-green">Professional Edge</span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Enhance your trading accuracy, manage risk parameters with institutional precision, and get VIP premium signals.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          
          {/* Plan 1: Free Trader */}
          <div className="glass-panel glass-panel-hover p-8 rounded-2xl flex flex-col justify-between relative overflow-hidden text-left">
            <div className="space-y-6">
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-slate-500 tracking-wider block uppercase">Basic Access</span>
                <h3 className="text-xl font-mono font-bold text-slate-200">Free Trader</h3>
                <p className="text-xs text-slate-400">Join the trading circle and monitor simple indicators.</p>
              </div>

              <div className="py-4 border-y border-glass-border">
                <span className="text-4xl font-extrabold font-mono text-slate-100">$0</span>
                <span className="text-xs text-slate-500 font-mono ml-2">/ LIFETIME</span>
              </div>

              <ul className="space-y-3.5 text-xs text-slate-300">
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-neon-green shrink-0 mt-0.5" />
                  <span>Free Telegram Channel Access</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-neon-green shrink-0 mt-0.5" />
                  <span>Basic Learning Resources</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-neon-green shrink-0 mt-0.5" />
                  <span>Periodic Market Review</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-neon-green shrink-0 mt-0.5" />
                  <span>Limited Sample Signals</span>
                </li>
              </ul>
            </div>

            <div className="pt-8">
              <Link
                href="https://t.me/Magnetoftrade" 
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded border border-glass-border hover:border-neon-green/30 bg-slate-900/40 text-slate-300 hover:text-neon-green text-xs font-bold font-mono tracking-wider text-center uppercase transition-all"
              >
                Join Free Community
              </Link>
            </div>
          </div>

          {/* Plan 2: VIP Journal */}
          <div className="glass-panel glass-panel-hover p-8 rounded-2xl flex flex-col justify-between relative overflow-hidden border-gold-vip/20 text-left">
            {/* Ribbon */}
            <div className="absolute top-0 right-0 p-4 font-mono text-[9px] text-gold-vip/60 font-semibold tracking-wider flex items-center gap-1">
              <Award className="h-3 w-3 fill-gold-vip" /> PARTNER LINK
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-gold-vip tracking-wider block uppercase font-semibold">Referral Required</span>
                <h3 className="text-xl font-mono font-bold text-gold-vip glow-text-gold">VIP Journal</h3>
                <p className="text-xs text-slate-400">Unlock the advanced analytics engine by joining our partner broker.</p>
              </div>

              <div className="py-4 border-y border-glass-border">
                <span className="text-4xl font-extrabold font-mono text-gold-vip glow-text-gold">FREE</span>
                <span className="text-xs text-slate-500 font-mono ml-2">WITH REFERRAL</span>
              </div>

              <ul className="space-y-3.5 text-xs text-slate-300">
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-gold-vip shrink-0 mt-0.5" />
                  <span><strong>Advanced Trading Journal</strong></span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-gold-vip shrink-0 mt-0.5" />
                  <span>10 Integrated Performance Charts</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-gold-vip shrink-0 mt-0.5" />
                  <span>Trading Checklist Subsystem</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-gold-vip shrink-0 mt-0.5" />
                  <span>Risk Management Calculator</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-gold-vip shrink-0 mt-0.5" />
                  <span>Full Trade History Statistics</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-gold-vip shrink-0 mt-0.5" />
                  <span>No Monthly Subscription Fees</span>
                </li>
              </ul>
            </div>

            <div className="pt-8">
              <Link
                href="/register-info"
                className="block w-full py-3 rounded bg-slate-900 border border-gold-vip/35 hover:border-gold-vip text-gold-vip font-bold text-xs font-mono tracking-wider text-center uppercase transition-all glow-button-gold"
              >
                Get VIP Access
              </Link>
            </div>
          </div>

          {/* Plan 3: Premium Signal Pro */}
          <div className="glass-panel glow-halo p-8 rounded-2xl flex flex-col justify-between relative overflow-hidden border-purple-500/35 bg-[#0a071d]/60 glow-shadow-purple text-left">
            {/* Popular Badge */}
            <div className="absolute top-0 right-0 p-3 rounded-bl bg-purple-500 text-slate-950 font-bold font-mono text-[9px] tracking-widest uppercase">
              RECOMMENDED
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-purple-400 tracking-wider block uppercase font-bold">Premium SaaS</span>
                <h3 className="text-xl font-mono font-bold text-purple-300">Premium Signal Pro</h3>
                <p className="text-xs text-slate-400">Unlock the complete AI-Based signal engine and direct alerts.</p>
              </div>

              {/* Multiple Plan Options */}
              <div className="py-4 border-y border-glass-border space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-mono text-slate-400 uppercase">Monthly:</span>
                  <div className="flex items-center gap-2">
                    {(prices.planDiscounts?.monthly ?? 0) > 0 && prices.discountedPrices?.monthly ? (
                      <>
                        <span className="text-[9px] text-rose-400 font-bold border border-rose-500/30 px-1.5 py-0.5 rounded bg-rose-500/10 mr-1">{prices.planDiscounts.monthly}% OFF</span>
                        <span className="text-xs text-slate-600 line-through">{prices.price_premium_monthly}</span>
                        <span className="text-2xl font-extrabold font-mono text-rose-300">{prices.discountedPrices.monthly}</span>
                      </>
                    ) : (
                      <span className="text-2xl font-extrabold font-mono text-purple-300">{prices.price_premium_monthly}</span>
                    )}
                    <span className="text-[10px] text-slate-500 font-mono"> / MO</span>
                  </div>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-mono text-slate-400 uppercase">6 Months:</span>
                  <div className="flex items-center gap-2">
                    {(prices.planDiscounts?.sixMonths ?? 0) > 0 && prices.discountedPrices?.sixMonths ? (
                      <>
                        <span className="text-[9px] text-rose-400 font-bold border border-rose-500/30 px-1.5 py-0.5 rounded bg-rose-500/10 mr-1">{prices.planDiscounts.sixMonths}% OFF</span>
                        <span className="text-xs text-slate-600 line-through">{prices.price_premium_6months}</span>
                        <span className="text-2xl font-extrabold font-mono text-rose-300">{prices.discountedPrices.sixMonths}</span>
                      </>
                    ) : (
                      <span className="text-2xl font-extrabold font-mono text-purple-300">{prices.price_premium_6months}</span>
                    )}
                    <span className="text-[10px] text-slate-500 font-mono"> / 6-MO</span>
                  </div>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-mono text-slate-400 uppercase">Lifetime:</span>
                  <div className="flex items-center gap-2">
                    {(prices.planDiscounts?.lifetime ?? 0) > 0 && prices.discountedPrices?.lifetime ? (
                      <>
                        <span className="text-[9px] text-rose-400 font-bold border border-rose-500/30 px-1.5 py-0.5 rounded bg-rose-500/10 mr-1">{prices.planDiscounts.lifetime}% OFF</span>
                        <span className="text-xs text-slate-600 line-through">{prices.price_premium_lifetime}</span>
                        <span className="text-2xl font-extrabold font-mono text-rose-300">{prices.discountedPrices.lifetime}</span>
                      </>
                    ) : (
                      <span className="text-2xl font-extrabold font-mono text-purple-300">{prices.price_premium_lifetime}</span>
                    )}
                    <span className="text-[10px] text-slate-500 font-mono"> / LIFETIME</span>
                  </div>
                </div>
              </div>

              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-start gap-2.5 font-semibold text-purple-200">
                  <Zap className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                  <span>Real-Time Premium Signals</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4.5 w-4 text-purple-400 shrink-0" />
                  <span>Signal History & Audit Log</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4.5 w-4 text-purple-400 shrink-0" />
                  <span>Entry Prices + Expiry Target Levels</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4.5 w-4 text-purple-400 shrink-0" />
                  <span>Indicator Confluence Conformation</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4.5 w-4 text-purple-400 shrink-0" />
                  <span>Real-Time Performance Dashboard</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4.5 w-4 text-purple-400 shrink-0" />
                  <span>High-Priority Instant Live Alerts</span>
                </li>
              </ul>
            </div>

            <div className="pt-8">
              <Link
                href="/register-info"
                className="block w-full py-3.5 rounded bg-purple-500 hover:bg-purple-600 text-slate-950 font-extrabold text-xs font-mono tracking-widest text-center uppercase transition-all glow-shadow-purple"
              >
                Subscribe Now
              </Link>
            </div>
          </div>

        </div>

        {/* FAQ Section */}
        <div className="mt-24 max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h3 className="text-xl sm:text-2xl font-bold font-mono tracking-tight">Frequently Asked Questions</h3>
            <p className="text-slate-500 text-xs sm:text-sm">Find answers to the most common inquiries regarding plan accesses.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            {[
              {
                q: "How does the VIP Journal plan work?",
                a: "By registering an account with our partner broker through our referral link and making a minimum deposit, you qualify for lifetime VIP access to the advanced trading journal and analytics dashboard for free."
              },
              {
                q: "What is the difference between VIP and Premium?",
                a: "VIP includes the Advanced Journal, risk calculators, checklist, and statistics. Premium Signal Pro adds the complete live automated signals engine, signal execution dashboards, history audit, and immediate live alert popups."
              },
              {
                q: "How are premium signal prices updated?",
                a: "Premium pricing plans are updated dynamically in real-time based on current network configuration settings in the admin panel. There are no surprise increases."
              },
              {
                q: "Can I upgrade from VIP to Premium Signal Pro?",
                a: "Yes! At any time, you can purchase a Premium Signal Pro subscription (Monthly, 6-Month, or Lifetime) to append the signal subsystem directly onto your journal dashboard."
              }
            ].map((faq, idx) => (
              <div key={idx} className="glass-panel p-5 rounded-lg space-y-2 border border-glass-border">
                <h4 className="text-sm font-mono font-bold text-slate-200 flex items-center gap-1.5">
                  <HelpCircle className="h-4 w-4 text-neon-green" /> {faq.q}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed pl-5">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

      </main>

      <Footer />
    </div>
  );
}
