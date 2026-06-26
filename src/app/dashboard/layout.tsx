'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { logoutUser } from '@/app/actions/auth';
import { 
  BarChart3, BookOpen, Award, Settings, LogOut, 
  TrendingUp, Shield, Menu, X, Loader, User, Radio, History
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }

        setUser(session.user);

        // Fetch user profile status
        const { data: userProfile, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error || !userProfile) {
          console.error('Failed to fetch profile:', error);
          // If profile does not exist, they need to register / await activation
          router.push('/register-info');
          return;
        }

        setProfile(userProfile);

        // Guard status: Only approved users can access
        if (userProfile.status !== 'approved') {
          router.push('/register-info?pending=true');
          return;
        }

        setLoading(false);
      } catch (err) {
        console.error('Auth check error:', err);
        router.push('/login');
      }
    }

    checkAuth();
  }, [supabase, router]);

  const handleLogout = async () => {
    await logoutUser();
    router.push('/');
    router.refresh();
  };

  const navItems = [
    { name: 'Analytics',       href: '/dashboard',               icon: BarChart3  },
    { name: 'Journal',         href: '/dashboard/journal',        icon: BookOpen   },
    { name: 'Signals',         href: '/dashboard/signals',        icon: Radio      },
    { name: 'Signal History',  href: '/dashboard/signal-history', icon: History    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
        <main className="flex-1 flex flex-col items-center justify-center space-y-4">
          <Loader className="h-8 w-8 animate-spin text-neon-green" />
          <span className="text-xs font-mono text-slate-500">AUTHORIZING SECURE SYSTEM PORT...</span>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans grid-overlay">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col fixed inset-y-0 bg-[#030812] border-r border-glass-border">
        <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center px-6 pb-6 border-b border-glass-border/40">
            <Link href="/" className="flex items-center space-x-2 text-neon-green glow-text-green font-mono font-bold tracking-wider text-sm">
              <TrendingUp className="h-5 w-5 text-neon-green" />
              <span>QUOTEX JOURNAL</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="mt-6 flex-1 px-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center px-4 py-3 text-xs font-mono font-bold tracking-wider rounded-md border transition-all ${
                    isActive
                      ? 'bg-neon-green/10 border-neon-green/30 text-neon-green glow-text-green'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                  }`}
                >
                  <item.icon className="mr-3 h-4 w-4 shrink-0" />
                  {item.name.toUpperCase()}
                </Link>
              );
            })}
          </nav>

          {/* User profile / Logout */}
          <div className="px-4 pt-4 border-t border-glass-border/40 space-y-3">
            {/* VIP Status card */}
            <div className={`p-3 rounded border text-left flex items-center justify-between ${
              profile?.vip_access 
                ? 'bg-gold-vip/10 border-gold-vip/35 text-gold-vip glow-text-gold' 
                : 'bg-slate-900/40 border-glass-border text-slate-400'
            }`}>
              <div className="space-y-0.5">
                <div className="text-[8px] font-mono tracking-wider uppercase text-slate-500">Access Tier</div>
                <div className="text-[10px] font-mono font-bold">{profile?.vip_access ? 'PLATINUM VIP' : 'STANDARD'}</div>
              </div>
              <Award className={`h-5 w-5 ${profile?.vip_access ? 'text-gold-vip' : 'text-slate-600'}`} />
            </div>

            <div className="flex items-center justify-between py-1">
              <div className="flex items-center space-x-2 max-w-[140px] overflow-hidden">
                <div className="p-1.5 rounded-full bg-slate-900 border border-glass-border">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <div className="truncate">
                  <div className="text-[10px] font-bold text-slate-300 truncate">{profile?.username}</div>
                  <div className="text-[8px] font-mono text-slate-500 truncate">ID: {profile?.trader_id}</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded bg-slate-900/50 hover:bg-rose-950/20 text-slate-500 hover:text-rose-500 border border-glass-border transition-colors"
                title="Log Out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className="md:pl-64 flex flex-col flex-1 w-full">
        {/* Top Navbar - Mobile */}
        <header className="sticky top-0 z-40 md:hidden flex items-center justify-between h-16 px-4 bg-[#030812] border-b border-glass-border">
          <Link href="/" className="flex items-center space-x-2 text-neon-green glow-text-green font-mono font-bold tracking-wider text-xs">
            <TrendingUp className="h-4 w-4 text-neon-green" />
            <span>QUOTEX JOURNAL</span>
          </Link>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded text-slate-400 hover:text-slate-200"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden glass-panel border-b border-glass-border p-4 space-y-4">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-4 py-3 text-xs font-mono font-bold rounded-md border ${
                      isActive
                        ? 'bg-neon-green/10 border-neon-green/30 text-neon-green'
                        : 'bg-transparent border-transparent text-slate-400'
                    }`}
                  >
                    <item.icon className="mr-3 h-4 w-4" />
                    {item.name.toUpperCase()}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-glass-border/40 pt-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1 rounded-full bg-slate-900">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-300">{profile?.username}</div>
                  <div className="text-[8px] font-mono text-slate-500">ID: {profile?.trader_id}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-rose-950/20 border border-rose-500/20 text-rose-400 text-xs font-mono font-bold"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>LOGOUT</span>
              </button>
            </div>
          </div>
        )}

        {/* Page body */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
