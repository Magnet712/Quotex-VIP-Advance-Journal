'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getMembershipRole, canAccess, FEATURES_LIST } from '@/lib/permissions';
import { ShieldCheck, ShieldAlert, ArrowRight, Activity, Award, Zap, User } from 'lucide-react';
import Link from 'next/link';

export default function AccessMatrixPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

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
        console.error('Failed to load profile for access matrix page:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [supabase]);

  const triggerUpgrade = (requiredTier: 'vip' | 'premium') => {
    window.dispatchEvent(new CustomEvent('open-upgrade-modal', { 
      detail: { requestedPlan: requiredTier } 
    }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Activity className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">RETRIEVING SECURITY KEYRING...</span>
      </div>
    );
  }

  const userRole = getMembershipRole(profile);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-4xl mx-auto animate-fadeIn text-left">
      
      {/* Title */}
      <div className="border-b border-glass-border pb-4">
        <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">security control</span>
        <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Access Control Matrix</h1>
      </div>

      {/* Overview Status Banner */}
      <div className="glass-panel p-5 rounded-xl border border-glass-border bg-[#030812]/50 flex items-center justify-between transition-all duration-300 hover:border-glass-border/50 animate-fadeInUp">
        <div className="space-y-0.5">
          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Authorization Level</span>
          <div className="text-sm font-mono font-bold text-slate-200">
            Active Identity Tier: <span className="text-neon-green">{userRole.toUpperCase()}</span>
          </div>
        </div>
        <div>
          {userRole === 'premium' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-purple-500/10 border border-purple-500/30 text-purple-400 font-mono text-xs font-bold uppercase">
              <Zap className="h-3.5 w-3.5" /> Full Access
            </span>
          ) : userRole === 'vip' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-xs font-bold uppercase">
              <Award className="h-3.5 w-3.5" /> VIP Status
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-slate-900 border border-slate-700 text-slate-400 font-mono text-xs font-bold uppercase">
              <User className="h-3.5 w-3.5 text-slate-500" /> Standard
            </span>
          )}
        </div>
      </div>

      {/* Feature Access Matrix Table */}
      <div className="space-y-4">
        <div className="glass-panel border border-glass-border rounded-xl overflow-hidden">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-[#030812] border-b border-glass-border text-slate-500">
              <tr>
                <th className="p-4">MODULE/FEATURE</th>
                <th className="p-4">REQUIRED PLAN</th>
                <th className="p-4">ACCESS STATUS</th>
                <th className="p-4 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass-border/30 text-slate-300">
              {FEATURES_LIST.map((feature) => {
                const hasAccess = canAccess(feature.id, profile);
                
                // Color formatting based on required level
                let planColor = 'text-slate-500 bg-slate-900/50 border-slate-800';
                if (feature.required === 'premium') {
                  planColor = 'text-purple-400 bg-purple-950/20 border-purple-500/25';
                } else if (feature.required === 'vip') {
                  planColor = 'text-blue-400 bg-blue-950/20 border-blue-500/25';
                }

                return (
                  <tr key={feature.id} className="hover:bg-slate-900/10 transition-all duration-150 hover:scale-[1.001]">
                    <td className="p-4 space-y-1">
                      <div className="font-bold text-slate-200">{feature.name}</div>
                      <div className="text-[10px] text-slate-500 font-sans">{feature.desc}</div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded text-[9px] font-bold border uppercase ${planColor}`}>
                        {feature.required.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4">
                      {hasAccess ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                          <ShieldCheck className="h-4.5 w-4.5" /> ALLOWED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-purple-400 font-bold">
                          <ShieldAlert className="h-4.5 w-4.5" /> GATED
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {hasAccess ? (
                        <span className="text-[10px] text-slate-600">No Action Required</span>
                      ) : (
                        <button
                          onClick={() => triggerUpgrade(feature.required as 'vip' | 'premium')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-purple-500/30 hover:border-purple-400 bg-purple-500/5 text-[10px] font-bold uppercase tracking-wider text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          Unlock Now <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
