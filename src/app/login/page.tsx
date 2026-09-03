'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginTrader, resetPasswordWithPin } from '@/app/actions/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Lock, TrendingUp, AlertCircle, ArrowRight, Loader, KeyRound, X, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const [traderId, setTraderId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Forgot password modal states
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTraderId, setResetTraderId] = useState('');
  const [resetPin, setResetPin] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!traderId || !password) {
      setError('Please fill in all fields.');
      setLoading(false);
      return;
    }

    try {
      const res = await loginTrader(traderId, password);
      if (!res.success) {
        setError(res.error || 'Login failed.');
        setLoading(false);
        return;
      }

      // Check status
      if (res.status === 'approved') {
        router.push('/dashboard');
        router.refresh();
      } else {
        // Pending or rejected
        router.push('/register-info?pending=true');
        router.refresh();
      }
    } catch (err: any) {
      setError('An unexpected error occurred.');
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(null);

    if (!resetTraderId || !resetPin || !resetNewPassword || !resetConfirmPassword) {
      setResetError('Please fill in all fields.');
      return;
    }

    if (!/^\d{4,6}$/.test(resetPin.trim())) {
      setResetError('Recovery PIN must be 4 to 6 numeric digits.');
      return;
    }

    if (resetNewPassword.length < 8) {
      setResetError('New password must be at least 8 characters.');
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }

    setResetLoading(true);
    try {
      const res = await resetPasswordWithPin(resetTraderId, resetPin, resetNewPassword);
      if (res.success) {
        setResetSuccess(res.message || 'Password reset successfully!');
        setTraderId(resetTraderId);
        setPassword(resetNewPassword);
        setTimeout(() => {
          setShowResetModal(false);
          setResetSuccess(null);
          setResetPin('');
          setResetNewPassword('');
          setResetConfirmPassword('');
        }, 2000);
      } else {
        setResetError(res.error || 'Failed to reset password.');
      }
    } catch (err: any) {
      setResetError('An unexpected error occurred during password reset.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
      <Navbar />

      <main className="flex-1 flex items-center justify-center py-16 px-4">
        <div className="w-full max-w-md glass-panel p-8 rounded-xl border border-glass-border space-y-6 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-neon-green/5 rounded-full blur-3xl pointer-events-none" />

          {/* Logo / Title */}
          <div className="text-center space-y-2">
            <Link href="/" className="inline-flex items-center space-x-2 text-neon-green glow-text-green font-mono font-bold tracking-wider text-base">
              <TrendingUp className="h-5 w-5 text-neon-green" />
              <span>QUOTEX ADVANCE</span>
            </Link>
            <h2 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-slate-100">
              TRADER TERMINAL LOGIN
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              ENTER YOUR TRADER ID AND CRYPTOGRAPHIC PASSWORD
            </p>
          </div>

          {error && (
            <div className="bg-rose-950/20 border border-rose-500/20 text-rose-400 p-3.5 rounded text-xs leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Trader ID field */}
            <div className="space-y-1.5">
              <label htmlFor="trader-id" className="block text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                Trader ID
              </label>
              <input
                id="trader-id"
                type="text"
                required
                disabled={loading}
                value={traderId}
                onChange={(e) => setTraderId(e.target.value)}
                placeholder="e.g. 5283401"
                className="w-full bg-[#030812] border border-glass-border px-3.5 py-2.5 rounded font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/40 transition-colors"
              />
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password-field" className="block text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetModal(true);
                    setResetError(null);
                    setResetSuccess(null);
                    setResetTraderId(traderId);
                  }}
                  className="text-[10px] text-neon-green hover:underline font-mono"
                >
                  Forgot Password?
                </button>
              </div>
              <input
                id="password-field"
                type="password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#030812] border border-glass-border px-3.5 py-2.5 rounded font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/40 transition-colors"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover transition-colors tracking-wider text-xs font-mono uppercase glow-button flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="h-4 w-4 animate-spin text-slate-950" />
                  <span>AUTHENTICATING USER...</span>
                </>
              ) : (
                <>
                  <span>LOGIN TERMINAL</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Links for new account */}
          <div className="border-t border-glass-border pt-4 text-center space-y-3">
            <div className="text-xs text-slate-500">
              New to the platform?{' '}
              <Link href="/register-info" className="text-neon-green hover:underline">
                Create Account & Request Activation
              </Link>
            </div>
            {/* Activation status check link */}
            <div>
              <Link
                href="/register-info?pending=true"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 text-[10px] font-mono font-bold tracking-wider uppercase hover:bg-sky-500/20 hover:border-sky-500/50 transition-all"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                Check Your Activation Approval Status →
              </Link>
            </div>
            <div>
              <a
                href="https://broker-qx.pro/sign-up/?lid=1712337"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-[10px] font-mono font-bold text-gold-vip hover:underline uppercase tracking-wide"
              >
                Open Partner Broker Account &rarr;
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* Forgot Password Self-Service Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn font-mono">
          <div className="w-full max-w-md glass-panel p-6 rounded-xl border border-glass-border space-y-4 relative text-left">
            <button
              onClick={() => setShowResetModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
              <KeyRound className="h-5 w-5 text-neon-green" />
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase">Self-Service Password Reset</h3>
                <p className="text-[9px] text-slate-500 uppercase">Enter your Trader ID and Security Recovery PIN</p>
              </div>
            </div>

            {resetError && (
              <div className="bg-rose-950/20 border border-rose-500/20 text-rose-400 p-3 rounded text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            {resetSuccess && (
              <div className="bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 p-3 rounded text-xs flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
                <span>{resetSuccess}</span>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase block">Trader ID</label>
                <input
                  type="text"
                  required
                  disabled={resetLoading}
                  value={resetTraderId}
                  onChange={(e) => setResetTraderId(e.target.value)}
                  placeholder="e.g. 5283401"
                  className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/40 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase block">
                  Security Recovery PIN (4-6 Digits)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  disabled={resetLoading}
                  value={resetPin}
                  onChange={(e) => setResetPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/40 text-xs tracking-widest"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase block">New Password (Min 8 Chars)</label>
                <input
                  type="password"
                  required
                  disabled={resetLoading}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/40 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase block">Confirm New Password</label>
                <input
                  type="password"
                  required
                  disabled={resetLoading}
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/40 text-xs"
                />
              </div>

              <div className="pt-2 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  disabled={resetLoading}
                  className="flex-1 py-2.5 rounded bg-slate-900 border border-glass-border text-slate-400 hover:text-slate-200 text-xs font-bold uppercase transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex-1 py-2.5 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                >
                  {resetLoading ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                  <span>{resetLoading ? 'UPDATING...' : 'RESET PASSWORD'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
