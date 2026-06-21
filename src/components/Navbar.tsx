'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logoutUser } from '@/app/actions/auth';
import { Menu, X, TrendingUp, ShieldAlert, Award, BarChart3, LogOut, LayoutDashboard } from 'lucide-react';

interface NavbarProps {
  isAdminPage?: boolean;
}

export default function Navbar({ isAdminPage = false }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function getSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        // Check if admin
        const { data: adminRecord } = await supabase
          .from('admins')
          .select('role')
          .eq('id', session.user.id)
          .single();
        setIsAdmin(!!adminRecord);
      }
      setLoading(false);
    }

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
        setIsAdmin(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setIsAdmin(false);
    router.push('/');
    router.refresh();
  };

  return (
    <nav className="sticky top-0 z-50 glass-panel border-b border-glass-border backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2 text-neon-green glow-text-green font-mono font-bold text-lg tracking-wider">
              <TrendingUp className="h-6 w-6 text-neon-green" />
              <span>QUOTEX ADVANCE JOURNAL</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/#features" className="text-slate-300 hover:text-neon-green transition-colors text-sm font-medium">
              Features
            </Link>
            <Link href="/#vip" className="text-slate-300 hover:text-gold-vip transition-colors text-sm font-medium flex items-center gap-1">
              <Award className="h-4 w-4 text-gold-vip" />
              VIP Access
            </Link>
            <Link href="/#charts" className="text-slate-300 hover:text-neon-green transition-colors text-sm font-medium flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              Charts
            </Link>
            
            {/* Auth Buttons */}
            {loading ? (
              <div className="h-8 w-16 bg-slate-800 rounded animate-pulse" />
            ) : user ? (
              <div className="flex items-center space-x-4">
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-md border border-slate-700 bg-slate-900/50 text-slate-300 hover:text-neon-green hover:border-neon-green/30 text-xs font-semibold tracking-wide transition-all"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Admin Panel</span>
                  </Link>
                )}
                <Link
                  href="/dashboard"
                  className="flex items-center space-x-1 px-4 py-1.5 rounded bg-neon-green text-slate-950 font-semibold hover:bg-neon-green-hover text-xs transition-colors tracking-wide glow-button"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  <span>Dashboard</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-1 text-slate-400 hover:text-rose-500 transition-colors text-xs"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden lg:inline">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link
                  href="/login"
                  className="text-slate-300 hover:text-neon-green text-sm font-medium transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="https://broker-qx.pro/sign-up/?lid=1712337"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-xs transition-all tracking-wider glow-button"
                >
                  NEW ACCOUNT OPEN
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-slate-400 hover:text-neon-green focus:outline-none"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden glass-panel border-t border-glass-border">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link
              href="/#features"
              onClick={() => setIsOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-slate-300 hover:text-neon-green transition-colors"
            >
              Features
            </Link>
            <Link
              href="/#vip"
              onClick={() => setIsOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-slate-300 hover:text-gold-vip transition-colors flex items-center gap-2"
            >
              <Award className="h-5 w-5 text-gold-vip" />
              VIP Access
            </Link>
            <Link
              href="/#charts"
              onClick={() => setIsOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-slate-300 hover:text-neon-green transition-colors flex items-center gap-2"
            >
              <BarChart3 className="h-5 w-5" />
              Charts
            </Link>
            <hr className="border-slate-800 my-2" />
            
            {loading ? (
              <div className="h-10 w-full bg-slate-800 rounded animate-pulse" />
            ) : user ? (
              <div className="space-y-2 px-3 py-2">
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center space-x-2 text-slate-300 hover:text-neon-green transition-colors text-sm py-1"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    <span>Admin Panel</span>
                  </Link>
                )}
                <Link
                  href="/dashboard"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center space-x-2 w-full px-4 py-2 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-sm transition-colors text-center"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Go to Dashboard</span>
                </Link>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    handleLogout();
                  }}
                  className="flex items-center justify-center space-x-2 w-full px-4 py-2 rounded border border-slate-700 hover:border-rose-500 hover:text-rose-500 transition-colors text-sm text-slate-400"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2 px-3 py-2">
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="block text-center w-full px-4 py-2 rounded border border-slate-700 text-slate-300 hover:text-neon-green transition-colors text-sm"
                >
                  Login
                </Link>
                <Link
                  href="https://broker-qx.pro/sign-up/?lid=1712337"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                  className="block text-center w-full px-4 py-2 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-sm transition-colors"
                >
                  NEW ACCOUNT OPEN
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
