'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { logoutUser } from '@/app/actions/auth';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import UpgradeModal from '@/components/UpgradeModal';
import { 
  BarChart3, BookOpen, Award, Settings, LogOut, 
  TrendingUp, Shield, Menu, X, Loader2, User, Radio, History,
  Calculator, Send, CheckSquare, LineChart, Video, Zap, CreditCard, Bell,
  Lock
} from 'lucide-react';
import { getUserNotifications, markNotificationsRead } from '@/app/actions/billing';

const NAV_ACCOUNT = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: 'Membership', href: '/dashboard/membership', icon: Award },
  { name: 'Subscription', href: '/dashboard/subscription', icon: CreditCard },
  { name: 'Payments', href: '/dashboard/payments', icon: History },
  { name: 'Access Center', href: '/dashboard/access', icon: Shield },
  { name: 'Profile', href: '/dashboard/profile', icon: User }
];
const NAV_TRADING = [
  { name: 'Journal', href: '/dashboard/journal', icon: BookOpen },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Checklist', href: '/dashboard/checklist', icon: CheckSquare },
  { name: 'Risk Calculator', href: '/dashboard/risk-calculator', icon: Calculator }
];
const NAV_SIGNALS = [
  { name: 'Signal Dashboard', href: '/dashboard/signals', icon: Radio },
  { name: 'Signal History', href: '/dashboard/signal-history', icon: History },
  { name: 'Performance', href: '/dashboard/performance', icon: LineChart }
];
const NAV_COMMUNITY = [
  { name: 'Telegram', href: 'https://t.me/Magnetoftrade', icon: Send, isExternal: true },
  { name: 'YouTube', href: 'https://youtube.com/@magnetoftrade7751?si=Un1BlRIvS8z2Nd7W', icon: Video, isExternal: true },
  { name: 'Referral Program', href: '/dashboard/referral', icon: Award }
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Notifications states
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  
  const router = useRouter();
  const pathname = usePathname();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

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
    setIsLoggingOut(true);
    try {
      await logoutUser();
      router.push('/');
      router.refresh();
    } finally {
      setIsLoggingOut(false);
      setShowLogoutConfirm(false);
    }
  };

  useEffect(() => {
    if (loading || !user) return;
    async function loadNotifications() {
      try {
        const res = await getUserNotifications();
        if (res.success && res.notifications) {
          setNotifications(res.notifications);
          setUnreadNotifications(res.notifications.filter((n: any) => !n.is_read).length);
        }
      } catch (err) {
        console.error('Failed to load notifications:', err);
      }
    }
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loading, user]);

  const handleToggleNotifications = async () => {
    setShowNotificationsDropdown(!showNotificationsDropdown);
    if (!showNotificationsDropdown && unreadNotifications > 0) {
      await markNotificationsRead();
      setUnreadNotifications(0);
    }
  };

  const renderNotificationsBell = (align: 'up' | 'down' = 'down') => {
    return (
      <div className="relative font-mono">
        <button
          onClick={handleToggleNotifications}
          className="p-1.5 rounded bg-slate-900/50 hover:bg-slate-800 text-slate-500 hover:text-slate-300 border border-glass-border transition-colors relative"
          title="Notifications"
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadNotifications > 0 && (
            <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
          )}
        </button>

        {showNotificationsDropdown && (
          <div className={`absolute right-0 ${
            align === 'up' ? 'bottom-10' : 'top-10'
          } z-50 w-64 glass-panel border border-glass-border rounded-xl p-3 space-y-2 text-left shadow-xl bg-[#030812]`}>
            <div className="text-[8px] text-slate-550 uppercase tracking-wider border-b border-glass-border/40 pb-1.5 flex justify-between items-center">
              <span>Alert Notifications</span>
              {unreadNotifications > 0 && <span className="text-rose-450 font-bold">{unreadNotifications} Unread</span>}
            </div>
            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
              {notifications.map((n: any) => (
                <div key={n.id} className="text-[10px] space-y-0.5 border-b border-glass-border/10 pb-1.5 last:border-0 last:pb-0">
                  <div className="font-bold text-slate-200">{n.title}</div>
                  <p className="text-slate-400 text-[9px] leading-normal">{n.message}</p>
                  <span className="text-[7px] text-slate-655 block">{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
              {notifications.length === 0 && (
                <div className="text-center py-4 text-[9px] text-slate-650 uppercase">
                  No notifications
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
        <main className="flex-1 flex flex-col items-center justify-center space-y-4 animate-fadeIn">
          <div className="relative">
            <Loader2 className="h-8 w-8 animate-spin text-neon-green" />
            <div className="absolute inset-0 h-8 w-8 animate-ping opacity-20 rounded-full bg-neon-green" />
          </div>
          <span className="text-xs font-mono text-slate-500 tracking-widest">AUTHORIZING SECURE SYSTEM PORT...</span>
        </main>
      </div>
    );
  }

  const renderNavGroupLinks = (items: typeof NAV_ACCOUNT, isMobile = false, isPremiumGroup = false) => {
    const hasPremiumAccess = profile?.premium_access || isAdmin;
    return items.map((item) => {
      const isActive = pathname === item.href;
      const key = `${isMobile ? 'm-' : 'd-'}${item.name}`;

      const isExt = 'isExternal' in item && (item as any).isExternal;
      const isLocked = isPremiumGroup && !hasPremiumAccess;

      const baseClasses = 'group flex items-center px-4 py-2 text-[10px] font-mono font-bold tracking-wider rounded-md border transition-all duration-150';
      const activeClasses = 'bg-neon-green/15 border-neon-green/35 text-neon-green glow-text-green';
      const inactiveClasses = 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50';
      const externalClasses = 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50';
      const lockedClasses = 'bg-transparent border-transparent text-slate-600 select-none';

      if (isExt) {
        return (
          <a
            key={key}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => isMobile && setMobileMenuOpen(false)}
            className={`${baseClasses} ${externalClasses} uppercase`}
            aria-label={`${item.name} (opens external)`}
          >
            <item.icon className="mr-3 h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover:scale-110" />
            <span className="relative">
              {item.name}
              <span className="ml-1 text-[7px] opacity-40">↗</span>
            </span>
          </a>
        );
      }

      if (isLocked) {
        return (
          <button
            key={key}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { requestedPlan: 'premium' } }));
              if (isMobile) setMobileMenuOpen(false);
            }}
            className={`${baseClasses} ${lockedClasses} uppercase relative w-full text-left cursor-pointer`}
            title="Upgrade to Premium Signal Pro to unlock"
          >
            <item.icon className="mr-3 h-3.5 w-3.5 shrink-0 text-slate-600" />
            <span className="flex-1">{item.name.toUpperCase()}</span>
            <Lock className="h-3 w-3 text-amber-500/70 shrink-0" />
          </button>
        );
      }

      return (
        <Link
          key={key}
          href={item.href}
          onClick={() => isMobile && setMobileMenuOpen(false)}
          className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses} uppercase relative`}
          aria-current={isActive ? 'page' : undefined}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-neon-green rounded-full animate-fadeIn" />
          )}
          <item.icon className={`mr-3 h-3.5 w-3.5 shrink-0 transition-all duration-150 ${isActive ? 'text-neon-green' : ''} ${!isActive ? 'group-hover:scale-110' : ''}`} />
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
              {renderNavGroupLinks(NAV_ACCOUNT)}
            </div>

            {/* TRADING */}
            <div className="space-y-1">
              <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Trading</span>
              {renderNavGroupLinks(NAV_TRADING)}
            </div>

            {/* SIGNALS */}
            <div className="space-y-1">
              <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Signals</span>
              {renderNavGroupLinks(NAV_SIGNALS, false, true)}
            </div>

            {/* COMMUNITY */}
            <div className="space-y-1">
              <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Community</span>
              {renderNavGroupLinks(NAV_COMMUNITY as any)}
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
                ? 'bg-purple-950/20 border-purple-500/35 text-purple-300 glow-shadow-purple' 
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
              <div className="flex items-center space-x-1.5 relative">
                {renderNotificationsBell('up')}
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

          <div className="flex items-center gap-2">
            {renderNotificationsBell('down')}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded text-slate-400 hover:text-slate-200"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </header>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden glass-panel border-b border-glass-border p-4 space-y-4 max-h-[85vh] overflow-y-auto">
            
            {/* Navigation Groups */}
            <nav className="space-y-4 text-left">
              <div className="space-y-1">
                <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Account</span>
                {renderNavGroupLinks(NAV_ACCOUNT, true)}
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Trading</span>
                {renderNavGroupLinks(NAV_TRADING, true)}
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Signals</span>
                {renderNavGroupLinks(NAV_SIGNALS, true, true)}
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-mono text-slate-600 tracking-widest uppercase block pl-4">Community</span>
                {renderNavGroupLinks(NAV_COMMUNITY as any, true)}
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
                disabled={isLoggingOut}
                className="flex-1 py-2 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs font-mono uppercase tracking-wider transition-colors"
              >
                {isLoggingOut ? 'Logging out...' : 'Yes, Logout'}
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
