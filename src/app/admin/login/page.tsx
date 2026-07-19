'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminLogin, verifyAdminMfa } from '@/app/actions/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { ShieldCheck, AlertCircle, ArrowRight, Loader, KeyRound } from 'lucide-react';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfaState, setMfaState] = useState<{
    factorId: string;
    challengeId: string;
  } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const totpRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (mfaState && totpRef.current) {
      totpRef.current.focus();
    }
  }, [mfaState]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email || !password) {
      setError('Please fill in all fields.');
      setLoading(false);
      return;
    }

    try {
      const res = await adminLogin(email, password);

      if ('mfaRequired' in res && res.mfaRequired) {
        setMfaState({
          factorId: res.factorId,
          challengeId: res.challengeId,
        });
        setPassword('');
        setLoading(false);
        return;
      }

      if (!res.success) {
        setError(res.error || 'Admin login failed.');
        setLoading(false);
        return;
      }

      router.push('/admin');
      router.refresh();
    } catch (err: any) {
      setError('An unexpected error occurred.');
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!totpCode || totpCode.length < 6) {
      setError('Please enter a valid 6-digit code.');
      setLoading(false);
      return;
    }

    try {
      const res = await verifyAdminMfa(
        mfaState!.factorId,
        mfaState!.challengeId,
        totpCode
      );

      if (!res.success) {
        setError(res.error || 'Invalid verification code.');
        setLoading(false);
        return;
      }

      router.push('/admin');
      router.refresh();
    } catch (err: any) {
      setError('An unexpected error occurred.');
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setMfaState(null);
    setTotpCode('');
    setError(null);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
      <Navbar />

      <main className="flex-1 flex items-center justify-center py-16 px-4">
        <div className="w-full max-w-md glass-panel p-8 rounded-xl border border-glass-border space-y-6 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Logo / Title */}
          <div className="text-center space-y-2">
            <div className="inline-flex p-2 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 mb-1">
              {mfaState ? <KeyRound className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-slate-100 uppercase">
              {mfaState ? 'TWO-FACTOR AUTH' : 'ADMIN CONTROL PANEL'}
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              {mfaState
                ? 'ENTER AUTHENTICATOR CODE TO CONTINUE'
                : 'AUTHENTICATE TO ACCESS SYSTEM CONFIGURATION'}
            </p>
          </div>

          {error && (
            <div className="bg-rose-950/20 border border-rose-500/20 text-rose-400 p-3.5 rounded text-xs leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mfaState ? (
            /* MFA verification step */
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="totp-code" className="block text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                  Authenticator Code
                </label>
                <input
                  id="totp-code"
                  ref={totpRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  disabled={loading}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full bg-[#030812] border border-glass-border px-3.5 py-2.5 rounded font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500/30 transition-colors text-center text-2xl tracking-[0.5em]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] tracking-wider text-xs font-mono uppercase flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin text-white" />
                    <span>VERIFYING...</span>
                  </>
                ) : (
                  <>
                    <span>VERIFY & ENTER</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  &larr; Back to login
                </button>
              </div>
            </form>
          ) : (
            /* Password login step */
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="admin-email" className="block text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                  System Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  disabled={loading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@quotex.journal"
                  className="w-full bg-[#030812] border border-glass-border px-3.5 py-2.5 rounded font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500/30 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="admin-password" className="block text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                  System Passcode
                </label>
                <input
                  id="admin-password"
                  type="password"
                  required
                  disabled={loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#030812] border border-glass-border px-3.5 py-2.5 rounded font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500/30 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] tracking-wider text-xs font-mono uppercase flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin text-white" />
                    <span>INITIALIZING KEY EXCHANGE...</span>
                  </>
                ) : (
                  <>
                    <span>DECRYPT KEYS & ENTER</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Help link */}
          <div className="border-t border-glass-border pt-4 text-center">
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
              &larr; Return to main platform
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
