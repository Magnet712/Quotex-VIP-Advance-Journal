'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginTrader } from '@/app/actions/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Lock, TrendingUp, AlertCircle, ArrowRight, Loader } from 'lucide-react';

export default function LoginPage() {
  const [traderId, setTraderId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
              <label htmlFor="password-field" className="block text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                Password
              </label>
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
          <div className="border-t border-glass-border pt-4 text-center space-y-2">
            <div className="text-xs text-slate-500">
              New to the platform?{' '}
              <Link href="/register-info" className="text-neon-green hover:underline">
                Create Account & Request Activation
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

      <Footer />
    </div>
  );
}
