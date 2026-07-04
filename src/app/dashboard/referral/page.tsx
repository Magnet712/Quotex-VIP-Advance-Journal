'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Award, Copy, Check, Users, MousePointerClick, 
  Wallet, ExternalLink, ShieldAlert, FileText, CheckCircle,
  TrendingUp, HelpCircle
} from 'lucide-react';

export default function ReferralPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data: userProfile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (userProfile) {
          setProfile(userProfile);
        }
      } catch (err) {
        console.error('Failed to load profile for referral page:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Users className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">RETRIEVING PARTNER RELATIONSHIPS...</span>
      </div>
    );
  }

  // Fallback to anonymous ID if not logged in / profile missing during local preview
  const referralId = profile?.trader_id || profile?.id?.substring(0, 8) || 'partner';
  const referralLink = `https://quotex-vip.com/join?ref=${referralId}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Mocked statistics tracking for MVP demonstration
  const stats = {
    clicks: 142,
    registrations: 14,
    conversions: 3,
    earnings: 45.00
  };

  // Mocked referred users list
  const referredUsers = [
    { id: 'trader_9481', date: '2026-07-02', status: 'Approved', commission: '$15.00', tier: 'VIP Journal' },
    { id: 'trader_3821', date: '2026-06-28', status: 'Approved', commission: '$15.00', tier: 'VIP Journal' },
    { id: 'trader_1049', date: '2026-06-25', status: 'Approved', commission: '$15.00', tier: 'VIP Journal' },
    { id: 'trader_8754', date: '2026-06-22', status: 'Pending Deposit', commission: '$0.00', tier: 'Free Plan' },
    { id: 'trader_6201', date: '2026-06-19', status: 'Pending Review', commission: '$0.00', tier: 'Free Plan' }
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-5xl mx-auto animate-fadeIn text-left">
      
      {/* Title */}
      <div className="border-b border-glass-border pb-4">
        <span className="text-[10px] font-mono text-gold-vip font-bold uppercase tracking-wider block">partner terminal</span>
        <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Referral Program</h1>
      </div>

      {/* Main Grid: Info & Copy Link */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Copy Link Card */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-glass-border flex flex-col justify-between space-y-6 relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-gold-vip/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="space-y-2">
            <span className="text-[9px] font-mono text-gold-vip uppercase tracking-widest block font-bold">your unique invitation url</span>
            <h2 className="text-lg font-bold font-mono text-slate-200">Share & Earn VIP Rewards</h2>
            <p className="text-xs text-slate-400 leading-relaxed font-sans max-w-xl">
              Invite other traders to join the Quotex VIP Advance Journal. When they register an account under your link and deposit or upgrade, you will receive recurring premium commissions, and they unlock journal metrics instantly.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 bg-slate-950/80 border border-glass-border rounded px-3 py-2.5 font-mono text-xs text-slate-300 select-all overflow-x-auto whitespace-nowrap">
                {referralLink}
              </div>
              <button
                onClick={copyToClipboard}
                className="px-5 py-2.5 rounded bg-gold-vip text-slate-950 font-mono font-bold text-xs uppercase tracking-wider transition-all hover:bg-yellow-400 active:scale-95 flex items-center justify-center gap-2 shrink-0 shadow-md shadow-gold-vip/10"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy URL
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Guidelines Card */}
        <div className="glass-panel p-6 rounded-2xl border border-glass-border space-y-4 text-xs font-sans">
          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block font-bold">how it works</span>
          <div className="space-y-4">
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-mono font-bold text-slate-400 shrink-0">1</span>
              <div>
                <strong className="text-slate-200 block font-mono">Invite Traders</strong>
                <span className="text-slate-400">Share your custom link on forums, Telegram channels, or blogs.</span>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-mono font-bold text-slate-400 shrink-0">2</span>
              <div>
                <strong className="text-slate-200 block font-mono">User Onboarding</strong>
                <span className="text-slate-400">Referred user completes verification with our partner broker link.</span>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-mono font-bold text-slate-400 shrink-0">3</span>
              <div>
                <strong className="text-slate-200 block font-mono">Collect Payouts</strong>
                <span className="text-slate-400">Earn up to 15% revenue share commission on premium journal packages.</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Statistics Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Metric 1 */}
        <div className="glass-panel p-4 rounded-xl border border-glass-border space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[9px] font-mono uppercase tracking-wider block font-bold">link clicks</span>
            <MousePointerClick className="h-4 w-4 text-slate-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-mono text-slate-100">{stats.clicks}</h3>
            <span className="text-[10px] text-slate-500 font-mono">Unique visitors</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="glass-panel p-4 rounded-xl border border-glass-border space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-400">
            <span className="text-[9px] font-mono uppercase tracking-wider block font-bold">signups</span>
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-mono text-slate-100">{stats.registrations}</h3>
            <span className="text-[10px] text-slate-500 font-mono">Trader ID registrations</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="glass-panel p-4 rounded-xl border border-glass-border space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[9px] font-mono uppercase tracking-wider block font-bold">conversions</span>
            <Award className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-mono text-slate-100">{stats.conversions}</h3>
            <span className="text-[10px] text-slate-500 font-mono">VIP upgrades verified</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="glass-panel p-4 rounded-xl border border-glass-border space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gold-vip">
            <span className="text-[9px] font-mono uppercase tracking-wider block font-bold">commissions</span>
            <Wallet className="h-4 w-4 text-gold-vip" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-mono text-slate-100">${stats.earnings.toFixed(2)}</h3>
            <span className="text-[10px] text-slate-500 font-mono">Unpaid partner balance</span>
          </div>
        </div>

      </div>

      {/* Tabs Layout: Referred Users & T&C */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Referred Users Table */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-glass-border space-y-4">
          <div className="flex items-center justify-between border-b border-glass-border pb-3">
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block font-bold font-mono">conversions logs</span>
              <h2 className="text-sm font-bold font-mono text-slate-200">Referred Accounts List</h2>
            </div>
            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-mono uppercase font-bold">
              Real-time
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-slate-300">
              <thead>
                <tr className="border-b border-slate-900 text-slate-500 text-left">
                  <th className="py-2.5 font-bold">Trader ID</th>
                  <th className="py-2.5 font-bold">Registration Date</th>
                  <th className="py-2.5 font-bold">Active Tier</th>
                  <th className="py-2.5 font-bold text-center">Commission</th>
                  <th className="py-2.5 font-bold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40">
                {referredUsers.map((user, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/20 transition-colors">
                    <td className="py-3 text-slate-200 font-bold">{user.id}</td>
                    <td className="py-3 text-slate-400">{user.date}</td>
                    <td className="py-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${user.tier === 'VIP Journal' ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                        {user.tier}
                      </span>
                    </td>
                    <td className="py-3 text-center text-gold-vip font-bold">{user.commission}</td>
                    <td className="py-3 text-right">
                      <span className={`text-[10px] uppercase font-bold ${user.status === 'Approved' ? 'text-emerald-400' : user.status === 'Pending Deposit' ? 'text-gold-vip' : 'text-slate-500'}`}>
                        {user.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Terms & Conditions Box */}
        <div className="glass-panel p-6 rounded-2xl border border-glass-border space-y-4">
          <div className="flex items-center gap-2 border-b border-glass-border pb-3">
            <FileText className="h-4 w-4 text-gold-vip" />
            <h2 className="text-xs font-bold font-mono uppercase tracking-widest text-slate-200">
              Terms & Conditions
            </h2>
          </div>

          <div className="space-y-4 text-left font-sans text-xs text-slate-400 leading-normal max-h-[300px] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <h3 className="text-slate-300 font-semibold font-mono text-[11px] uppercase">1. Revenue Sharing</h3>
              <p>
                Partners receive up to 15% revenue share on direct VIP advance upgrades made by users signed up under their custom referral link.
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-slate-300 font-semibold font-mono text-[11px] uppercase">2. Verification Rule</h3>
              <p>
                Referred users must pass standard Broker Trader ID validations to count toward premium commission conversions. Self-referrals are strictly checked and banned.
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-slate-300 font-semibold font-mono text-[11px] uppercase">3. Minimum Withdrawal</h3>
              <p>
                The minimum withdrawal balance is **$50.00**. Earnings payouts are processed on the 1st of every calendar month via crypto (Tether TRC-20/ERC-20) or direct wallet transfers.
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-slate-300 font-semibold font-mono text-[11px] uppercase">4. Prohibited Ads</h3>
              <p>
                Promoting your link using paid advertisements bidding on our trademark keywords (e.g. "Quotex VIP", "Quotex Advance Journal") is prohibited and will result in commission forfeiture.
              </p>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-900/60 rounded p-3 flex gap-2 items-start text-[10px] text-slate-500 font-sans">
            <ShieldAlert className="h-4 w-4 text-gold-vip mt-0.5 shrink-0" />
            <span>
              Quotex VIP reserves the right to suspend partner credentials in cases of click-spamming or duplicate account fraud.
            </span>
          </div>
        </div>

      </div>

    </div>
  );
}
