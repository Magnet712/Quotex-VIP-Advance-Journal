'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { logoutUser } from '@/app/actions/auth';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import UpgradeModal from '@/components/UpgradeModal';
import { 
  BarChart3, BookOpen, Award, Settings, LogOut, 
  TrendingUp, Shield, Menu, X, Loader, User, Radio, History,
  Calculator, Send, CheckSquare, LineChart, Video, Zap
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
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

        // Fetch user profile status & admin validation state concurrently
        const [userProfile, accessRes] = await Promise.all([
          supabase.from('users').select('*').eq('id', session.user.id).single(),
          getUserAccessState()
        ]);

        if (userProfile.error || !userProfile.data) {
          console.error('Failed to fetch profile:', userProfile.error);
          router.push('/register-info');
          return;
        }

        setProfile(userProfile.data);
        
        if (accessRes.success) {
          setIsAdmin(accessRes.isAdmin);
        }

        // Guard status: Only approved users can access
        if (userProfile.data.status !== 'approved') {
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

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const executeLogout = async () => {
    setShowLogoutConfirm(false);
    await logoutUser();
    router.push('/');
    router.refresh();
  };

  // Grouped Navigation Items
  const accountGroup = [
    { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
    { name: 'Membership', href: '/dashboard/membership', icon: Award },
    { name: 'Access Center', href: '/dashboard/access', icon: Shield },
    { name: 'Profile', href: '/dashboard/profile', icon: User }
  ];

  const tradingGroup = [
    { name: 'Journal', href: '/dashboard/journal', icon: BookOpen },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { name: 'Checklist', href: '/dashboard/checklist', icon: CheckSquare },
    { name: 'Risk Calculator', href: '/dashboard/risk-calculator', icon: Calculator }
  ];

  const signalsGroup = [
    { name: 'Signal Dashboard', href: '/dashboard/signals', icon: Radio },
    { name: 'Signal History', href: '/dashboard/signal-history', icon: History },
    { name: 'Performance', href: '/dashboard/performance', icon: LineChart }
  ];

  const communityGroup = [
    { name: 'Telegram', href: 'https://t.me/Magnetoftrade', icon: Send, isExternal: true },
    { name: 'YouTube', href: 'https://youtube.com/@magnetoftrade7751?si=Un1BlRIvS8z2Nd7W', icon: Video, isExternal: true },
    { name: 'Referral Program', href: '/register-info', icon: Award }
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

  const renderNavGroupLinks = (items: typeof accountGroup, isMobile = false) => {
    return items.map((item) => {
      const isActive = pathname === item.href;
      const key = `${isMobile ? 'm-' : 'd-'}${item.name}`;

      // Check if external link
      const isExt = 'isExternal' in item && (item as any).isExternal;

      if (isExt) {
        return (
          <a
            key={key}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => isMobile && setMobileMenuOpen(false)}
            className="group flex items-center px-4 py-2 text-[10px] font-mono font-bold tracking-wider rounded-md border bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 transition-all uppercase"
          >
            <item.icon className="mr-3 h-3.5 w-3.5 shrink-0" />
            {item.name}
          </a>
        );
      }

      return (
        <Link
          key={key}
          href={item.href}
          onClick={() => isMobile && setMobileMenuOpen(false)}
          className={`group flex items-center px-4 py-2 text-[10px] font-mono font-bold tracking-wider rounded-md border transition-all ${
            isActive
              ? 'bg-neon-green/15 border-neon-green/35 text-neon-green glow-text-green'
              : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <item.icon className="mr-3 h-3.5 w-3.5 shrink-0" />
          {item.name.toUpperCase()}
        </Link>
      );
    });
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans grid-overlay text-left">
      
      {/* Dynamic Upgrade Modal */}
      <UpgradeModal />

      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col fixed inset-y-0 bg-[#030812] border-r border-glass-border">
        <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center px-6 pb-5 border-b border-glass-border/40">
            <Link href="/" className="flex items-center space-x-2 text-neon-green glow-text-green font-mono font-bold tracking-wider text-sm">
              <TrendingUp className="h-5 w-5 text-neon-green" />
              <span>QUOTEX JOURNAL</span>
            </Link>
          </div>

          {/* Navigation groups */}
          <nav className="mt-4 flex-grow px-4 space-y-5 overflow-y-auto max-h-[70vh] pb-4">
            
            {/* ACCOUNT */}
            <div className="space-y-1">
              <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Account</span>
              {renderNavGroupLinks(accountGroup)}
            </div>

            {/* TRADING */}
            <div className="space-y-1">
              <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Trading</span>
              {renderNavGroupLinks(tradingGroup)}
            </div>

            {/* SIGNALS */}
            <div className="space-y-1">
              <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Signals</span>
              {renderNavGroupLinks(signalsGroup)}
            </div>

            {/* COMMUNITY */}
            <div className="space-y-1">
              <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Community</span>
              {renderNavGroupLinks(communityGroup as any)}
            </div>

            {/* ADMIN ACCESS */}
            {isAdmin && (
              <div className="space-y-1">
                <span className="text-[8px] font-mono text-rose-500/80 tracking-widest uppercase block pl-4">Admin</span>
                <Link
                  href="/admin"
                  className="group flex items-center px-4 py-2 text-[10px] font-mono font-bold tracking-wider rounded-md border border-transparent text-rose-400 hover:text-rose-300 hover:bg-rose-950/10 transition-all"
                >
                  <Settings className="mr-3 h-3.5 w-3.5 shrink-0" />
                  ADMIN PANEL
                </Link>
              </div>
            )}
            
          </nav>

          {/* User profile / Logout */}
          <div className="px-4 pt-4 border-t border-glass-border/40 space-y-3 shrink-0">
            
            {/* Dynamic Membership Status Badge */}
            <div className={`p-3 rounded-lg border text-left flex items-center justify-between ${
              profile?.premium_access 
                ? 'bg-purple-950/20 border-purple-500/35 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.1)]' 
                : profile?.vip_access 
                ? 'bg-blue-950/20 border-blue-500/35 text-blue-300' 
                : 'bg-slate-900/30 border-glass-border text-slate-400'
            }`}>
              <div className="space-y-0.5">
                <div className="text-[8px] font-mono tracking-wider uppercase text-slate-500">Access Tier</div>
                <div className="text-[10px] font-mono font-bold">
                  {profile?.premium_access ? 'Premium Pro' : profile?.vip_access ? 'VIP Journal' : 'Free Trader'}
                </div>
              </div>
              {profile?.premium_access ? (
                <Zap className="h-4.5 w-4.5 text-purple-400" />
              ) : profile?.vip_access ? (
                <Award className="h-4.5 w-4.5 text-blue-400" />
              ) : (
                <User className="h-4.5 w-4.5 text-slate-500" />
              )}
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
          <div className="md:hidden glass-panel border-b border-glass-border p-4 space-y-4 max-h-[85vh] overflow-y-auto">
            
            {/* Navigation Groups */}
            <nav className="space-y-4 text-left">
              <div className="space-y-1">
                <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Account</span>
                {renderNavGroupLinks(accountGroup, true)}
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Trading</span>
                {renderNavGroupLinks(tradingGroup, true)}
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Signals</span>
                {renderNavGroupLinks(signalsGroup, true)}
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Community</span>
                {renderNavGroupLinks(communityGroup as any, true)}
              </div>
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
    </div>
  );
}
