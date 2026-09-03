'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { registerTrader, logoutUser } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { 
  TrendingUp, AlertCircle, CheckCircle, ArrowRight, Lock,
  HelpCircle, ExternalLink, ShieldCheck, Loader, LogOut, Sparkles
} from 'lucide-react';

function RegisterInfoContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const [isPendingView, setIsPendingView] = useState(false);
  const [isApprovedView, setIsApprovedView] = useState(false);
  const [isNoSessionView, setIsNoSessionView] = useState(false);
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Form states
  const [traderId, setTraderId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryPin, setRecoveryPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [referredBy, setReferredBy] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is logged in
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setSessionUser(session.user);
        // Fetch status
        const { data: profile } = await supabase
          .from('users')
          .select('status, trader_id, rejection_reason')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          setProfileStatus(profile.status);
          setTraderId(profile.trader_id);
          setRejectionReason(profile.rejection_reason);
          if (profile.status === 'pending' || profile.status === 'rejected') {
            setIsPendingView(true);
          } else if (profile.status === 'approved') {
            // If arriving via status-check link, show approved card (one-time only)
            if (searchParams.get('pending') === 'true') {
              const celebrationKey = `magnet_vip_celebrated_${session.user.id}`;
              const alreadySeen = localStorage.getItem(celebrationKey);
              if (!alreadySeen) {
                // First time after approval — show green card, set flag, then redirect
                localStorage.setItem(celebrationKey, '1');
                setIsApprovedView(true);
                setTimeout(() => {
                  router.push('/dashboard');
                  router.refresh();
                }, 2500);
              } else {
                // Already seen the celebration — redirect immediately
                router.push('/dashboard');
                router.refresh();
              }
            } else {
              // Normal login flow — redirect immediately
              router.push('/dashboard');
              router.refresh();
            }
          }
        }
      }
      // No session — if user arrived via status-check link, show login-required card
      if (!session?.user && searchParams.get('pending') === 'true') {
        setIsNoSessionView(true);
      }
    }

    checkSession();

    // Parse ref or trader parameters from URL query params
    const refVal = searchParams.get('ref') || searchParams.get('trader');
    if (refVal) {
      setReferredBy(refVal);
    }
    // NOTE: ?pending=true is intentionally NOT handled here unconditionally.
    // Status is derived from the actual session inside checkSession() above.
    // If no session exists and ?pending=true is in URL, isNoSessionView is shown.
  }, [searchParams, supabase, router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!traderId || !username || !password || !recoveryPin) {
      setError('Please fill in all fields including the Security Recovery PIN.');
      setLoading(false);
      return;
    }

    if (!/^\d{4,6}$/.test(recoveryPin.trim())) {
      setError('Recovery PIN must be 4 to 6 numeric digits (e.g. 849201).');
      setLoading(false);
      return;
    }

    try {
      const res = await registerTrader(traderId, username, password, referredBy || undefined, recoveryPin.trim());
      if (!res.success) {
        setError(res.error || 'Registration failed.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
      // Wait a moment and redirect to log in / check status
      setTimeout(() => {
        setIsPendingView(true);
      }, 1000);
    } catch (err: any) {
      setError('An unexpected error occurred during registration.');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const executeLogout = async () => {
    setShowLogoutConfirm(false);
    await logoutUser();
    setIsPendingView(false);
    setSessionUser(null);
    setProfileStatus(null);
    router.push('/');
    router.refresh();
  };

  if (isNoSessionView) {
    return (
      <div className="w-full max-w-md glass-panel p-8 rounded-xl border border-gold-vip/25 space-y-6 relative text-center overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl pointer-events-none bg-gold-vip/5" />

        <div className="inline-flex items-center justify-center p-4 rounded-full border bg-gold-vip/10 border-gold-vip/30 text-gold-vip">
          <Lock className="h-8 w-8 text-gold-vip" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold font-mono tracking-tight text-slate-100">LOGIN REQUIRED</h2>
          <p className="text-xs font-mono text-slate-500">TO CHECK YOUR ACTIVATION STATUS</p>
        </div>

        <div className="bg-slate-950/60 border border-glass-border p-4 rounded-lg text-xs font-sans text-slate-400 leading-relaxed">
          You need to be logged in to check your activation approval status. Please login with your Trader ID and password.
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Link
            href="/login"
            className="w-full py-3 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover transition-colors tracking-wider text-xs font-mono uppercase glow-button flex items-center justify-center gap-2"
          >
            <span>GO TO LOGIN</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/"
            className="w-full py-2.5 rounded bg-slate-900 border border-glass-border hover:border-neon-green/30 text-slate-400 font-semibold text-xs tracking-wider uppercase transition-colors"
          >
            Go Back Home
          </Link>
        </div>
      </div>
    );
  }

  if (isApprovedView) {
    return (
      <div className="w-full max-w-md glass-panel p-8 rounded-xl border border-emerald-500/30 space-y-6 relative text-center overflow-hidden">
        <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full blur-3xl pointer-events-none bg-emerald-500/10" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full blur-3xl pointer-events-none bg-neon-green/10" />

        <div className="inline-flex items-center justify-center p-4 rounded-full border bg-emerald-950/30 border-emerald-500/40 text-emerald-400 animate-pulse">
          <CheckCircle className="h-10 w-10 text-emerald-400" />
        </div>

        <div className="space-y-1">
          <h2 className="text-2xl font-bold font-mono tracking-tight text-emerald-400 glow-text-green">✅ APPROVED</h2>
          <p className="text-xs font-mono text-slate-400">YOUR VIP ACCESS IS ACTIVE</p>
        </div>

        <div className="bg-emerald-950/20 border border-emerald-500/20 p-4 rounded-lg text-xs font-mono text-emerald-300 leading-relaxed">
          Your Trader ID has been verified. VIP Journal access is fully activated.
          <br />
          <span className="text-slate-500">Redirecting to your dashboard...</span>
        </div>

        <div className="flex justify-center">
          <div className="flex gap-1">
            {[0,1,2].map(i => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isPendingView || success) {
    const isRejected = profileStatus === 'rejected';
    return (
      <>
        <div className="w-full max-w-lg glass-panel p-8 rounded-xl border border-glass-border space-y-6 relative text-center">
        <div className={`absolute -top-24 -left-24 w-48 h-48 rounded-full blur-3xl pointer-events-none ${isRejected ? 'bg-rose-500/10' : 'bg-gold-vip/5'}`} />
        
        <div className={`inline-flex items-center justify-center p-3 rounded-full border mb-2 ${isRejected ? 'bg-rose-950/20 border-rose-500/40 text-rose-500' : 'bg-gold-vip/10 border-gold-vip/30 text-gold-vip animate-pulse'}`}>
          {isRejected ? (
            <AlertCircle className="h-8 w-8 text-rose-500" />
          ) : (
            <HelpCircle className="h-8 w-8 text-gold-vip" />
          )}
        </div>

        <h2 className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${isRejected ? 'text-rose-400' : 'text-slate-100'}`}>
          {isRejected ? 'REQUEST REJECTED' : 'ACCOUNT PENDING VERIFICATION'}
        </h2>
        
        <div className={`bg-slate-950/60 border p-5 rounded-lg text-left text-xs space-y-3 font-mono ${isRejected ? 'border-rose-500/30' : 'border-glass-border'}`}>
          <div className="flex justify-between border-b border-slate-900 pb-2">
            <span className="text-slate-500">TRADER ID:</span>
            <span className="text-slate-200 font-bold">{traderId || 'SUBMITTED'}</span>
          </div>
          <div className="flex justify-between border-b border-slate-900 pb-2">
            <span className="text-slate-500">STATUS:</span>
            <span className={`font-bold uppercase ${isRejected ? 'text-rose-500 glow-text-red' : 'text-gold-vip glow-text-gold'}`}>{profileStatus || 'PENDING'}</span>
          </div>
          {isRejected && (
            <div className="bg-rose-950/20 border border-rose-500/25 p-3 rounded">
              <span className="text-rose-400 font-bold tracking-wider block text-[10px]">REASON FOR REJECTION:</span>
              <span className="text-slate-200 leading-relaxed block mt-1">{rejectionReason || 'No reason provided by the administrator. Please contact VIP support.'}</span>
            </div>
          )}
          {!isRejected && (
            <div className="text-[11px] text-slate-400 leading-relaxed font-sans pt-1">
              Your account request has been successfully registered. The system administrator manually verifies each Trader ID registration against our partner link to grant exclusive VIP access.
            </div>
          )}
        </div>

        {isRejected ? (
          <div className="text-left space-y-3">
            <div className="bg-slate-950/60 border border-glass-border p-4 rounded-lg space-y-2 text-left">
              <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase block">HOW TO GET ACTIVATED</span>
              <ol className="space-y-2 text-[11px] font-sans text-slate-300 list-decimal list-inside">
                <li>
                  Open a new broker account through our compliance link:&nbsp;
                  <a
                    href="https://broker-qx.pro/sign-up/?lid=1712337"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold-vip hover:underline"
                  >
                    OPEN BROKER REGISTRATION
                  </a>
                </li>
                <li>Sign out below and register again with your new Broker Trader ID.</li>
                <li>Your request will be verified against the partner link for activation.</li>
              </ol>
            </div>
            <div className="text-sm text-slate-400 max-w-sm mx-auto leading-normal">
              Need help? Contact VIP support at <span className="text-gold-vip font-mono text-xs">{process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'vip-support@quotex.journal'}</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-400 max-w-sm mx-auto leading-normal">
            Verification typically completes in <strong className="text-neon-green">1 to 12 hours</strong>. Please contact VIP support at <span className="text-gold-vip font-mono text-xs">{process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'vip-support@quotex.journal'}</span> for rapid activation.
          </div>
        )}

        <div className="pt-4 flex flex-col gap-3">
          <Link
            href="/"
            className="w-full py-2.5 rounded bg-slate-900 border border-glass-border hover:border-neon-green/30 text-slate-300 font-semibold text-xs tracking-wider uppercase transition-colors"
          >
            Go Back Home
          </Link>
          
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5 w-full py-2 text-slate-500 hover:text-rose-500 text-xs transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>{isRejected ? 'Sign Out / Register with a new Trader ID' : 'Sign Out / Log in different ID'}</span>
          </button>
        </div>
      </div>
      
      {/* Custom Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-sm glass-panel p-6 rounded-xl border border-glass-border space-y-4 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-500">
              <LogOut className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-mono font-bold text-slate-200">CONFIRM LOGOUT</h3>
              <p className="text-[10px] text-slate-500 font-mono">
                Are you sure you want to end your current session?
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={executeLogout}
                className="flex-1 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono uppercase tracking-wider transition-colors"
              >
                Yes, Logout
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2 rounded bg-slate-900 border border-glass-border hover:bg-slate-800 text-slate-400 text-xs font-mono font-bold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    );
  }

  return (
    <>
      <div className="w-full max-w-3xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
      {/* Instructions Pane */}
      <div className="lg:col-span-5 glass-panel p-6 rounded-xl border border-glass-border flex flex-col justify-between space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-neon-green" /> ACTIVATION STEPS
          </h3>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Quotex Advance Journal operates an exclusive, partner-funded model. You get advanced features completely free by trading through our compliance link.
          </p>

          {referredBy && (
            <div className="bg-gold-vip/5 border border-gold-vip/20 p-3 rounded text-[11px] font-mono text-gold-vip flex items-center gap-2 animate-fadeIn">
              <Sparkles className="h-4 w-4 text-gold-vip shrink-0" />
              <span>Invited by: <strong className="text-slate-200">{referredBy}</strong></span>
            </div>
          )}

          <ol className="space-y-4 text-xs font-sans text-slate-300">
            <li className="space-y-1">
              <strong className="text-neon-green font-mono text-[10px] block">STEP 01: CREATE BROKER ACCOUNT</strong>
              <span className="text-slate-400 text-[11px] leading-normal block">
                Click the broker sign-up link below to register your new account.
              </span>
              <a
                href="https://broker-qx.pro/sign-up/?lid=1712337"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-mono text-gold-vip hover:underline pt-0.5"
              >
                OPEN BROKER REGISTRATION <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li className="space-y-1">
              <strong className="text-neon-green font-mono text-[10px] block">STEP 02: ENTER TRADER ID BELOW</strong>
              <span className="text-slate-400 text-[11px] leading-normal block">
                Return to this page and complete the form using your new Broker Trader ID.
              </span>
            </li>
            <li className="space-y-1">
              <strong className="text-neon-green font-mono text-[10px] block">STEP 03: COMPLIANCE AUDIT</strong>
              <span className="text-slate-400 text-[11px] leading-normal block">
                The administrator verifies your Trader ID registration. Once approved, your VIP access is activated.
              </span>
            </li>
          </ol>
        </div>

        <div className="bg-slate-950/80 p-3 rounded border border-glass-border text-[9px] font-mono text-slate-500 leading-normal">
          SYSTEM AUDITING PROTOCOLS STIPULATED BY EXCLUSIVE BROKER VIP CHARTER. ZERO MONTHLY SUBSCRIPTIONS CHARGED.
        </div>
      </div>

      {/* Registration Form Pane */}
      <div className="lg:col-span-7 glass-panel p-8 rounded-xl border border-glass-border space-y-6 relative overflow-hidden flex flex-col justify-center">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-neon-green/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-2">
          {referredBy && (
            <span className="text-[9px] font-mono text-gold-vip border border-gold-vip/25 bg-gold-vip/5 px-2 py-0.5 rounded inline-block font-bold">
              Referral Sponsor: {referredBy}
            </span>
          )}
          <h2 className="text-lg sm:text-xl font-bold font-mono tracking-tight text-slate-100 uppercase">
            REGISTRATION FOR ACTIVATION
          </h2>
          <p className="text-xs text-slate-500 font-mono">
            INPUT USERNAME, TRADER ID, AND PASSWORD
          </p>
        </div>

        {error && (
          <div className="bg-rose-950/20 border border-rose-500/20 text-rose-400 p-3.5 rounded text-xs leading-relaxed flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          {/* Username */}
          <div className="space-y-1.5">
            <label htmlFor="reg-username" className="block text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
              Username
            </label>
            <input
              id="reg-username"
              type="text"
              required
              disabled={loading}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full bg-[#030812] border border-glass-border px-3.5 py-2.5 rounded font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/40 transition-colors"
            />
          </div>

          {/* Trader ID */}
          <div className="space-y-1.5">
            <label htmlFor="reg-trader-id" className="block text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
              Trader ID
            </label>
            <input
              id="reg-trader-id"
              type="text"
              required
              disabled={loading}
              value={traderId}
              onChange={(e) => setTraderId(e.target.value)}
              placeholder="e.g. 5283401"
              className="w-full bg-[#030812] border border-glass-border px-3.5 py-2.5 rounded font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/40 transition-colors"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="reg-password" className="block text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
              Password
            </label>
            <input
              id="reg-password"
              type="password"
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#030812] border border-glass-border px-3.5 py-2.5 rounded font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/40 transition-colors"
            />
          </div>

          {/* Security Recovery PIN */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="reg-recovery-pin" className="block text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                Security Recovery PIN (4-6 Digits)
              </label>
              <span className="text-[9px] text-neon-green font-mono">For Password Reset</span>
            </div>
            <input
              id="reg-recovery-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              required
              disabled={loading}
              value={recoveryPin}
              onChange={(e) => setRecoveryPin(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 849201"
              className="w-full bg-[#030812] border border-glass-border px-3.5 py-2.5 rounded font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/40 transition-colors tracking-widest"
            />
            <p className="text-[9px] text-slate-500 font-sans leading-tight">
              🔐 Save this secret numeric PIN. You will use it to reset your password if you ever forget it.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover transition-colors tracking-wider text-xs font-mono uppercase glow-button flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader className="h-4 w-4 animate-spin text-slate-950" />
                <span>SAVING TO AUDITING STAGE...</span>
              </>
            ) : (
              <>
                <span>SUBMIT FOR VERIFICATION</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-2 text-xs text-slate-500">
          Already submitted a request?{' '}
          <Link href="/login" className="text-neon-green hover:underline font-semibold">
            Log in Trader Terminal
          </Link>
        </div>
      </div>
    </div>
    
    {/* Custom Logout Confirmation Modal */}
    {showLogoutConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
        <div className="w-full max-w-sm glass-panel p-6 rounded-xl border border-glass-border space-y-4 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-500">
            <LogOut className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-mono font-bold text-slate-200">CONFIRM LOGOUT</h3>
            <p className="text-[10px] text-slate-500 font-mono">
              Are you sure you want to end your current session?
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={executeLogout}
              className="flex-1 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono uppercase tracking-wider transition-colors"
            >
              Yes, Logout
            </button>
            <button
              onClick={() => setShowLogoutConfirm(false)}
              className="flex-1 py-2 rounded bg-slate-900 border border-glass-border hover:bg-slate-800 text-slate-400 text-xs font-mono font-bold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
  </>
);
}

export default function RegisterInfoPage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
      <Navbar />

      <main className="flex-1 flex items-center justify-center py-16 px-4">
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader className="h-8 w-8 animate-spin text-neon-green" />
            <span className="text-xs font-mono text-slate-500">LOADING REGISTRATION GATEWAY...</span>
          </div>
        }>
          <RegisterInfoContent />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
