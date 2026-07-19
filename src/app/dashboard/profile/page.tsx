'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getMembershipRole } from '@/lib/permissions';
import { User, Award, Zap, Calendar, Mail, ShieldAlert, Key, Clipboard, Check } from 'lucide-react';

export default function UserProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        setUser(session.user);

        const { data: userProfile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (userProfile) {
          setProfile(userProfile);
        }
      } catch (err) {
        console.error('Failed to load profile details:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [supabase]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <User className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">RESOLVING SECURE USER META...</span>
      </div>
    );
  }

  const role = getMembershipRole(profile);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-2xl mx-auto animate-fadeIn text-left">
      
      {/* Title */}
      <div className="border-b border-glass-border pb-4">
        <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">identity card</span>
        <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Trader Profile</h1>
      </div>

      {/* Main details list */}
      <div className="glass-panel p-6 rounded-2xl border border-glass-border bg-slate-900/10 space-y-6 relative overflow-hidden transition-all duration-300 hover:border-glass-border/50 animate-fadeInUp">
        
        {/* Glow backdrop decoration */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-slate-800/10 rounded-full blur-3xl pointer-events-none" />

        {/* Profile Card Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-950 border border-glass-border text-slate-400 rounded-full">
            <User className="h-8 w-8 text-slate-300" />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold font-mono text-slate-200">{profile?.username}</h2>
            <div className="flex items-center gap-1.5">
              {role === 'premium' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-purple-500/35 bg-purple-500/10 text-purple-400 font-mono text-[9px] font-bold uppercase">
                  <Zap className="h-3 w-3" /> Premium Signal Pro
                </span>
              ) : role === 'vip' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-gold-vip/35 bg-gold-vip/10 text-gold-vip font-mono text-[9px] font-bold uppercase">
                  <Award className="h-3.5 w-3.5" /> VIP Journal
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-slate-700 bg-slate-800 text-slate-500 font-mono text-[9px] font-bold uppercase">
                  <User className="h-3 w-3" /> Free Trader
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Profile Grid metadata fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-glass-border/40 font-mono text-xs">
          
          {/* Email */}
          <div className="space-y-1">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest block">System Email Address</span>
            <div className="flex items-center gap-2 text-slate-300 bg-slate-950/40 border border-glass-border/30 px-3.5 py-2.5 rounded transition-all duration-200 hover:border-neon-green/20 group">
              <Mail className="h-4 w-4 text-slate-500 group-hover:text-neon-green transition-colors" />
              <span>{user?.email || 'N/A'}</span>
            </div>
          </div>

          {/* Trader ID */}
          <div className="space-y-1">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest block">Partner Broker Trader ID</span>
            <div className="flex items-center justify-between text-slate-300 bg-slate-950/40 border border-glass-border/30 px-3.5 py-2.5 rounded transition-all duration-200 hover:border-neon-green/20 group">
              <span className="font-bold">{profile?.trader_id || 'N/A'}</span>
              {profile?.trader_id && (
                <button
                  onClick={() => copyToClipboard(profile.trader_id)}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                  title="Copy ID"
                >
                  {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Clipboard className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </div>

          {/* Registration Date */}
          <div className="space-y-1">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest block">Account Activation Date</span>
            <div className="flex items-center gap-2 text-slate-300 bg-slate-950/40 border border-glass-border/30 px-3.5 py-2.5 rounded">
              <Calendar className="h-4 w-4 text-slate-500" />
              <span>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString([], { dateStyle: 'long' }) : 'N/A'}</span>
            </div>
          </div>

          {/* Secure Key */}
          <div className="space-y-1">
            <span className="text-[9px] text-slate-500 uppercase tracking-widest block">Security Authentication</span>
            <div className="flex items-center gap-2 text-slate-300 bg-slate-950/40 border border-glass-border/30 px-3.5 py-2.5 rounded">
              <Key className="h-4 w-4 text-slate-500" />
              <span>Supabase Authenticated</span>
            </div>
          </div>

        </div>

      </div>

      {/* Security Tip Box */}
      <div className="p-4 bg-slate-950/30 border border-glass-border/50 rounded-xl text-left flex items-start gap-3 transition-all duration-200 hover:border-glass-border/75 animate-fadeInUp">
        <ShieldAlert className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
        <div className="space-y-1 font-mono text-[10px] text-slate-500 leading-normal">
          <h4 className="font-bold uppercase text-slate-400">Profile Security Notice</h4>
          <p>
            This portal utilizes single sign-on mechanisms via email verification. Sensitive details and password hashing layers are isolated and managed securely by Supabase. Your credentials are never stored locally in plain text.
          </p>
        </div>
      </div>

    </div>
  );
}
