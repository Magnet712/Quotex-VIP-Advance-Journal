'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { ShieldCheck, ShieldOff, AlertCircle, Loader, Check, Copy, ArrowLeft, Smartphone, KeyRound } from 'lucide-react';
import Link from 'next/link';

export default function Admin2FAPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setLoading(true);
    setAuthError(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/admin/login');
        return;
      }

      const { data: mfaData, error: mfaError } = await supabase.auth.mfa.listFactors();
      if (mfaError) {
        setAuthError(true);
        return;
      }

      const verified = mfaData?.all?.filter(f => f.status === 'verified') || [];
      if (verified.length > 0) {
        setFactorId(verified[0].id);
        setEnrolled(true);
      }
    } catch {
      setAuthError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async () => {
    setError(null);
    setEnrolling(true);

    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
      });

      if (enrollError) {
        setError(enrollError.message || 'Failed to start enrollment.');
        setEnrolling(false);
        return;
      }

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);

      const { error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: data.id,
      });

      if (challengeError) {
        setError('Failed to create verification challenge.');
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setEnrolling(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!verifyCode || verifyCode.length < 6) {
      setError('Please enter a valid 6-digit code.');
      setSubmitting(false);
      return;
    }

    try {
      const { data: mfaData } = await supabase.auth.mfa.listFactors();
      const unverified = mfaData?.all?.filter(f => f.status === 'unverified') || [];
      const factor = unverified[0];

      if (!factor) {
        setError('No pending enrollment found. Please start over.');
        setSubmitting(false);
        return;
      }

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });

      if (challengeError) {
        setError('Verification failed. Please try again.');
        setSubmitting(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challengeData.id,
        code: verifyCode,
      });

      if (verifyError) {
        setError('Invalid code. Please try again.');
        setSubmitting(false);
        return;
      }

      setSuccess('Two-factor authentication has been enabled successfully.');
      setEnrolled(true);
      setFactorId(factor.id);
      setQrCode(null);
      setSecret(null);
      setVerifyCode('');
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisable = async () => {
    setError(null);
    setSubmitting(true);

    try {
      if (!factorId) {
        const { data: mfaData } = await supabase.auth.mfa.listFactors();
        const verified = mfaData?.all?.filter(f => f.status === 'verified') || [];
        if (verified.length === 0) {
          setError('No active two-factor authentication found.');
          setSubmitting(false);
          return;
        }
        setFactorId(verified[0].id);
      }

      const id = factorId;
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: id!,
      });

      if (unenrollError) {
        setError(unenrollError.message || 'Failed to disable two-factor authentication.');
        setSubmitting(false);
        return;
      }

      setSuccess('Two-factor authentication has been disabled.');
      setEnrolled(false);
      setFactorId(null);
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Loader className="h-8 w-8 animate-spin text-rose-500" />
        </main>
        <Footer />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
        <Navbar />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full glass-panel p-8 rounded-xl border border-glass-border text-center space-y-4">
            <ShieldOff className="h-12 w-12 text-rose-500 mx-auto" />
            <h2 className="text-lg font-mono font-bold uppercase">Access Denied</h2>
            <p className="text-sm text-slate-400">You do not have permission to access this page.</p>
            <Link href="/admin" className="inline-block text-xs text-rose-500 hover:text-rose-400">
              &larr; Return to Admin Dashboard
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 py-12 px-4">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-slate-500 hover:text-slate-300">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold font-mono uppercase tracking-tight flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-rose-500" />
                Two-Factor Authentication
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-1">
                {enrolled
                  ? 'Two-factor authentication is active on your account.'
                  : 'Add an extra layer of security to your admin account.'}
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-rose-950/20 border border-rose-500/20 text-rose-400 p-3.5 rounded text-xs leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 p-3.5 rounded text-xs leading-relaxed flex items-start gap-2.5">
              <Check className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* Enrolled state */}
          {enrolled && !qrCode && (
            <div className="glass-panel p-8 rounded-xl border border-glass-border space-y-6">
              <div className="text-center space-y-3">
                <div className="inline-flex p-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <h2 className="text-lg font-bold font-mono text-emerald-400 uppercase">
                  Two-Factor Active
                </h2>
                <p className="text-sm text-slate-400">
                  Your admin account is secured with authenticator app verification.
                </p>
              </div>

              <button
                onClick={handleDisable}
                disabled={submitting}
                className="w-full py-3 px-4 rounded bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/20 font-bold transition-all text-xs font-mono uppercase flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader className="h-4 w-4 animate-spin" /> Disabling...</>
                ) : (
                  <><ShieldOff className="h-4 w-4" /> Disable Two-Factor Authentication</>
                )}
              </button>
            </div>
          )}

          {/* Not enrolled — enrollment flow */}
          {!enrolled && !qrCode && (
            <div className="glass-panel p-8 rounded-xl border border-glass-border space-y-6">
              <div className="space-y-3">
                <h2 className="text-lg font-bold font-mono uppercase">How It Works</h2>
                <ol className="space-y-3 text-sm text-slate-400">
                  <li className="flex gap-3">
                    <span className="text-rose-500 font-bold shrink-0">1.</span>
                    <span>Click <strong className="text-slate-200">Enable 2FA</strong> below to generate a secret key.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-rose-500 font-bold shrink-0">2.</span>
                    <span>Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.).</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-rose-500 font-bold shrink-0">3.</span>
                    <span>Enter the 6-digit code from the app to confirm.</span>
                  </li>
                </ol>
              </div>

              <button
                onClick={handleEnroll}
                disabled={enrolling}
                className="w-full py-3 px-4 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] text-xs font-mono uppercase flex items-center justify-center gap-2"
              >
                {enrolling ? (
                  <><Loader className="h-4 w-4 animate-spin" /> Generating...</>
                ) : (
                  <><Smartphone className="h-4 w-4" /> Enable Two-Factor Authentication</>
                )}
              </button>
            </div>
          )}

          {/* QR Code step */}
          {qrCode && (
            <div className="glass-panel p-8 rounded-xl border border-glass-border space-y-6">
              <div className="text-center space-y-3">
                <KeyRound className="h-8 w-8 text-rose-500 mx-auto" />
                <h2 className="text-lg font-bold font-mono uppercase">Scan QR Code</h2>
                <p className="text-sm text-slate-400">
                  Scan this QR code with your authenticator app, then enter the 6-digit code below.
                </p>
              </div>

              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="QR Code" className="w-48 h-48 rounded-lg" />
              </div>

              {secret && (
                <div className="bg-[#030812] border border-glass-border rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">Manual Setup Code</span>
                    <button
                      onClick={handleCopySecret}
                      className="text-[10px] font-mono text-rose-500 hover:text-rose-400 flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <code className="text-xs text-slate-300 break-all font-mono">{secret}</code>
                </div>
              )}

              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="verify-code" className="block text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                    Verification Code
                  </label>
                  <input
                    id="verify-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    disabled={submitting}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full bg-[#030812] border border-glass-border px-3.5 py-2.5 rounded font-mono text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500/30 transition-colors text-center text-2xl tracking-[0.5em]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] text-xs font-mono uppercase flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><Loader className="h-4 w-4 animate-spin" /> Verifying...</>
                  ) : (
                    <><Check className="h-4 w-4" /> Confirm & Enable</>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
