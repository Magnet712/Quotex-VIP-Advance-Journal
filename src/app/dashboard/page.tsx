'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getTrades } from '@/app/actions/trades';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess, getMembershipRole, FEATURES_LIST } from '@/lib/permissions';
import { 
  User, Award, Zap, Calendar, Activity, CheckSquare, 
  Play, Radio, History, BarChart3, AlertCircle, Bell, ArrowRight, ShieldCheck 
} from 'lucide-react';

export default function DashboardHome() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [tradesCount, setTradesCount] = useState(0);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);

  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        
        setUser(session.user);

        // Fetch profile
        const { data: userProfile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (userProfile) {
          setProfile(userProfile);
        }

        // Fetch trades count
        const tradesRes = await getTrades();
        if (tradesRes.success && tradesRes.trades) {
          setTradesCount(tradesRes.trades.length);
        }

        // Load dismissed notifications from localStorage
        const dismissed = localStorage.getItem('dismissed_notifications');
        if (dismissed) {
          setDismissedNotifications(JSON.parse(dismissed));
        }

      } catch (err) {
        console.error('Failed to load dashboard portal data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [supabase]);

  const handleDismissNotification = (id: string) => {
    const updated = [...dismissedNotifications, id];
    setDismissedNotifications(updated);
    localStorage.setItem('dismissed_notifications', JSON.stringify(updated));
  };

  const triggerUpgrade = (targetTier: 'vip' | 'premium') => {
    window.dispatchEvent(new CustomEvent('open-upgrade-modal', { 
      detail: { requestedPlan: targetTier } 
    }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Activity className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">SYNCHRONIZING MEMBER PORTAL...</span>
      </div>
    );
  }

  const role = getMembershipRole(profile);
  const isPremium = role === 'premium';
  const isVip = role === 'vip';

  // Notification items
  const systemNotifications = [
    {
      id: 'welcome-saas',
      type: 'info',
      title: 'Welcome to the Member Portal',
      message: 'Your SaaS dashboard is fully active. Manage your journals, live signals, and configuration tools here.',
    },
    {
      id: 'premium-release',
      type: 'promo',
      title: 'Premium Signal Pro Active',
      message: 'Automated 1-minute OTC & Live Forex webhook signals are now live. Upgrade to unlock the advanced execution engine.',
      showUpgrade: !isPremium,
    }
  ].filter(n => !dismissedNotifications.includes(n.id));

  // Access check mapping for local routing
  const featurePaths: Record<string, string> = {
    'journal': '/dashboard/journal',
    'analytics': '/dashboard/analytics',
    'checklist': '/dashboard/checklist',
    'risk-calculator': '/dashboard/risk-calculator',
    'premium-signals': '/dashboard/signals',
    'signal-history': '/dashboard/signal-history',
    'performance-reports': '/dashboard/performance-reports',
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto animate-fadeIn">
      
      {/* Top Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-glass-border pb-6">
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">saas member portal</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">
            Welcome back, {profile?.username || 'Trader'}
          </h1>
        </div>
        
        {/* Membership Badge */}
        <div>
          {isPremium ? (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-purple-500/50 bg-purple-950/20 text-purple-300 font-mono font-bold text-xs uppercase shadow-[0_0_15px_rgba(168,85,247,0.15)] animate-pulse">
              <Zap className="h-4 w-4 fill-current text-purple-400" /> Premium Signal Pro
            </span>
          ) : isVip ? (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-gold-vip/50 bg-gold-vip/10 text-gold-vip font-mono font-bold text-xs uppercase shadow-[0_0_15px_rgba(218,165,32,0.15)]">
              <Award className="h-4 w-4 text-gold-vip" /> VIP Journal Member
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-700 bg-slate-900 text-slate-400 font-mono font-bold text-xs uppercase">
              <User className="h-4 w-4 text-slate-500" /> Free Trader
            </span>
          )}
        </div>
      </div>

      {/* Dismissible Announcements Widget */}
      {systemNotifications.length > 0 && (
        <div className="space-y-3">
          {systemNotifications.map((notif) => (
            <div 
              key={notif.id} 
              className={`p-4 rounded-xl border flex items-start gap-3.5 relative transition-all ${
                notif.type === 'promo' 
                  ? 'bg-purple-950/15 border-purple-500/20 text-purple-300' 
                  : 'bg-[#030b17] border-glass-border text-slate-300'
              }`}
            >
              <Bell className={`h-5 w-5 mt-0.5 shrink-0 ${notif.type === 'promo' ? 'text-purple-400' : 'text-neon-green'}`} />
              <div className="space-y-1 pr-6 flex-1 text-left">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider">{notif.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">{notif.message}</p>
                {notif.showUpgrade && (
                  <button 
                    onClick={() => triggerUpgrade('premium')} 
                    className="inline-flex items-center gap-1 mt-2 text-[10px] font-mono font-bold text-purple-400 hover:text-purple-300 uppercase tracking-wider transition-colors"
                  >
                    Upgrade Now <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
              <button 
                onClick={() => handleDismissNotification(notif.id)}
                className="absolute top-3.5 right-3.5 p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-900/50 transition-all text-xs font-bold"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Account Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Current Plan */}
        <div className="glass-panel p-5 rounded-xl border border-glass-border flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider font-mono uppercase">
            <span>Current Plan</span>
            <Award className="h-4 w-4" />
          </div>
          <div>
            <div className="text-lg font-mono font-extrabold text-slate-200">
              {isPremium ? 'Premium Signal Pro' : isVip ? 'VIP Journal' : 'Free Tier'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">
              {isPremium ? 'Full automated signals + charts access' : isVip ? 'Advanced journal + checklist access' : 'Standard registration access'}
            </div>
          </div>
        </div>

        {/* Account Status / Expiry */}
        <div className="glass-panel p-5 rounded-xl border border-glass-border flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider font-mono uppercase">
            <span>Membership Status</span>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-lg font-mono font-extrabold text-emerald-400">
              Approved
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">
              Expiry: {isPremium || isVip ? 'Never Expires (Lifetime Access)' : 'N/A'}
            </div>
          </div>
        </div>

        {/* Usage Stats (Journal Count & Sign ups) */}
        <div className="glass-panel p-5 rounded-xl border border-glass-border flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider font-mono uppercase">
            <span>Account Details</span>
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <div className="text-lg font-mono font-extrabold text-slate-200">
              Joined {profile?.created_at ? new Date(profile.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">
              Logged Transactions: {tradesCount} • Partner ID: {profile?.trader_id || 'None'}
            </div>
          </div>
        </div>

      </div>

      {/* Feature Access Center */}
      <div className="space-y-4">
        <div className="space-y-1">
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">access manager</span>
          <h3 className="text-lg font-bold font-mono text-slate-200">Feature Access Center</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES_LIST.map((feature) => {
            const hasAccess = canAccess(feature.id, profile);
            const path = featurePaths[feature.id];
            
            // Set plan details
            let reqLabel = 'Free';
            let tierColor = 'text-slate-500 bg-slate-900 border-slate-800';
            if (feature.required === 'premium') {
              reqLabel = 'Premium';
              tierColor = 'text-purple-400 bg-purple-950/20 border-purple-500/30';
            } else if (feature.required === 'vip') {
              reqLabel = 'VIP';
              tierColor = 'text-blue-400 bg-blue-950/20 border-blue-500/30';
            }

            return (
              <div 
                key={feature.id} 
                className={`glass-panel border p-5 rounded-xl flex flex-col justify-between space-y-5 transition-all hover:scale-[1.01] ${
                  hasAccess 
                    ? 'border-glass-border/70 bg-slate-900/10' 
                    : 'border-glass-border bg-slate-950/50 opacity-80 hover:opacity-100'
                }`}
              >
                <div className="space-y-3.5 text-left">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${tierColor}`}>
                      {reqLabel}
                    </span>
                    
                    {hasAccess ? (
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">✓ Available</span>
                    ) : (
                      <span className="text-[10px] font-mono text-purple-400 font-bold">🔒 Locked</span>
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold font-mono text-slate-200">{feature.name}</h4>
                    <p className="text-xs text-slate-500 leading-snug">{feature.desc}</p>
                  </div>
                </div>

                <div>
                  {hasAccess ? (
                    path ? (
                      <Link 
                        href={path}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded bg-slate-900 hover:bg-slate-800 border border-glass-border text-xs font-mono font-bold text-slate-300 hover:text-slate-100 transition-colors uppercase tracking-wider"
                      >
                        Enter Terminal <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <a 
                        href={feature.id === 'community' ? 'https://t.me/Magnetoftrade' : '#'}
                        target={feature.id === 'community' ? '_blank' : undefined}
                        rel={feature.id === 'community' ? 'noopener noreferrer' : undefined}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded bg-slate-900 hover:bg-slate-800 border border-glass-border text-xs font-mono font-bold text-slate-300 hover:text-slate-100 transition-colors uppercase tracking-wider"
                      >
                        Visit Resource <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    )
                  ) : (
                    <button
                      onClick={() => triggerUpgrade(feature.required as 'vip' | 'premium')}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded bg-purple-900/10 hover:bg-purple-900/20 border border-purple-500/30 text-xs font-mono font-bold text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-wider"
                    >
                      Unlock Now
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
