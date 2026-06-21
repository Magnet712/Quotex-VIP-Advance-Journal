'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminLogin } from '@/app/actions/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { ShieldCheck, AlertCircle, ArrowRight, Loader } from 'lucide-react';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-slate-100 uppercase">
              ADMIN CONTROL PANEL
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              AUTHENTICATE TO ACCESS SYSTEM CONFIGURATION
            </p>
          </div>

          {error && (
            <div className="bg-rose-950/20 border border-rose-500/20 text-rose-400 p-3.5 rounded text-xs leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Field */}
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

            {/* Password field */}
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

            {/* Submit Button */}
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
