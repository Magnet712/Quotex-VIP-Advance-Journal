'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  getAllUsers, updateUserStatus, toggleVipAccess, 
  resetUserPassword, getAdminStats 
} from '@/app/actions/admin';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { 
  ShieldAlert, Check, X, Award, Key, Trash, RefreshCw, 
  Users, UserCheck, UserPlus, Star, BarChart2, Loader 
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalUsers: 0,
    pendingUsers: 0,
    approvedUsers: 0,
    vipUsers: 0,
    totalTrades: 0,
  });

  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [resettingUser, setResettingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const loadData = async () => {
    setLoading(true);
    setAuthError(false);

    try {
      // 1. Verify user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/admin/login');
        return;
      }

      // 2. Fetch admin stats
      const statsRes = await getAdminStats();
      if (!statsRes.success) {
        setAuthError(true);
        setLoading(false);
        return;
      }

      // 3. Fetch users
      const usersRes = await getAllUsers();
      if (!usersRes.success) {
        setAuthError(true);
        setLoading(false);
        return;
      }

      setStats(statsRes.stats);
      setUsers(usersRes.users || []);
    } catch (err) {
      setAuthError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (userId: string, status: 'pending' | 'approved' | 'rejected') => {
    setActionLoading(userId);
    setMessage(null);
    try {
      const res = await updateUserStatus(userId, status);
      if (res.success) {
        setMessage({ type: 'success', text: `User status successfully updated to ${status}.` });
        await loadData();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update status.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleVipToggle = async (userId: string, currentVip: boolean) => {
    setActionLoading(userId);
    setMessage(null);
    try {
      const res = await toggleVipAccess(userId, !currentVip);
      if (res.success) {
        setMessage({ type: 'success', text: `VIP Access successfully ${!currentVip ? 'granted' : 'revoked'}.` });
        await loadData();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to toggle VIP status.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || !newPassword) return;

    setActionLoading(resettingUser.id);
    setMessage(null);

    try {
      const res = await resetUserPassword(resettingUser.id, newPassword);
      if (res.success) {
        setMessage({ type: 'success', text: `Password successfully updated for Trader ID ${resettingUser.trader_id}.` });
        setResettingUser(null);
        setNewPassword('');
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update password.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter((u) => u.status === activeTab);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center space-y-4">
          <Loader className="h-8 w-8 animate-spin text-rose-500" />
          <span className="text-xs font-mono text-slate-500">DECRYPTING ADMINISTRATION PORTAL...</span>
        </main>
        <Footer />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center space-y-4 p-4 text-center">
          <ShieldAlert className="h-12 w-12 text-rose-500 animate-pulse" />
          <h2 className="text-xl font-bold font-mono text-slate-200">ACCESS LOGS REFUSED</h2>
          <p className="text-sm text-slate-400 max-w-md">
            You do not possess the digital signatures required to read these admin ledgers. Return to login page.
          </p>
          <button
            onClick={() => router.push('/admin/login')}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded text-xs font-mono text-white transition-colors"
          >
            Go to Admin Sign In
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 grid-overlay">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        {/* Title */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
          <div>
            <span className="text-[10px] font-mono text-rose-500 font-bold uppercase tracking-wider block">compliance control console</span>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-100">
              Quotex VIP Administration
            </h1>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-glass-border hover:border-neon-green/30 bg-slate-900/40 text-slate-400 hover:text-neon-green text-xs font-mono transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> REFRESH LEDGER
          </button>
        </div>

        {/* System Message Notifications */}
        {message && (
          <div className={`p-4 rounded border text-xs leading-relaxed font-mono ${
            message.type === 'success' ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-rose-950/20 border-rose-500/20 text-rose-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Metrics Rows */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'TOTAL TRADERS', value: stats.totalUsers, icon: Users, color: 'text-slate-300' },
            { label: 'PENDING VERIFICATION', value: stats.pendingUsers, icon: UserPlus, color: 'text-gold-vip glow-text-gold' },
            { label: 'APPROVED TRADERS', value: stats.approvedUsers, icon: UserCheck, color: 'text-neon-green glow-text-green' },
            { label: 'ACTIVE VIP LIFETIME', value: stats.vipUsers, icon: Star, color: 'text-gold-vip glow-text-gold' },
            { label: 'TOTAL TRADES LOGGED', value: stats.totalTrades, icon: BarChart2, color: 'text-sky-400' },
          ].map((item, i) => (
            <div key={i} className="glass-panel p-4 rounded-lg flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-[9px] tracking-wider font-mono">
                <span>{item.label}</span>
                <item.icon className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <div className={`text-xl font-bold font-mono mt-3 ${item.color}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Reset Password Modal */}
        {resettingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-md glass-panel p-6 rounded-xl border border-glass-border space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-mono font-bold text-slate-200">RESET PASSPHRASE</h3>
                <p className="text-[10px] text-slate-500 font-mono">
                  TRADER ID: {resettingUser.trader_id} &bull; USERNAME: {resettingUser.username}
                </p>
              </div>

              <form onSubmit={handlePasswordReset} className="space-y-4">
                <input
                  type="text"
                  required
                  placeholder="Enter custom new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#030812] border border-glass-border px-3.5 py-2 rounded font-mono text-sm text-slate-200 focus:outline-none focus:border-neon-green/30"
                />

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono uppercase tracking-wider"
                  >
                    RESET PASS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResettingUser(null);
                      setNewPassword('');
                    }}
                    className="px-4 py-2 rounded bg-slate-900 border border-glass-border hover:bg-slate-800 text-slate-400 text-xs font-mono font-bold"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tab Selection */}
        <div className="border-b border-glass-border flex space-x-6 text-xs font-mono">
          {(['pending', 'approved', 'rejected'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 capitalize transition-all border-b-2 font-bold tracking-wider ${
                activeTab === tab
                  ? 'border-rose-500 text-rose-500 glow-text-gold'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab} User Requests ({users.filter((u) => u.status === tab).length})
            </button>
          ))}
        </div>

        {/* User Database Table */}
        <div className="glass-panel rounded-lg overflow-hidden border border-glass-border">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-glass-border text-slate-500 text-[10px] tracking-wider uppercase font-bold">
                  <th className="p-4">Trader ID</th>
                  <th className="p-4">Username</th>
                  <th className="p-4">Created Date</th>
                  <th className="p-4 text-center">VIP Badge</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border/40">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-600">
                      NO REGISTRATIONS FOUND IN THIS SUB-TAB.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="p-4 font-bold text-slate-200">{user.trader_id}</td>
                      <td className="p-4 text-slate-300">{user.username}</td>
                      <td className="p-4 text-slate-500">
                        {new Date(user.created_at).toLocaleDateString()} {new Date(user.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          disabled={actionLoading === user.id}
                          onClick={() => handleVipToggle(user.id, user.vip_access)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${
                            user.vip_access
                              ? 'bg-gold-vip/15 border-gold-vip/35 text-gold-vip glow-text-gold'
                              : 'bg-slate-900 border-glass-border text-slate-500 hover:text-gold-vip hover:border-gold-vip/30'
                          }`}
                        >
                          <Award className="h-3.5 w-3.5" />
                          <span>{user.vip_access ? 'VIP' : 'GRANT'}</span>
                        </button>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {user.status === 'pending' && (
                          <>
                            <button
                              disabled={actionLoading === user.id}
                              onClick={() => handleStatusChange(user.id, 'approved')}
                              className="p-1.5 rounded bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-950/80 transition-colors inline-flex items-center"
                              title="Approve Account"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              disabled={actionLoading === user.id}
                              onClick={() => handleStatusChange(user.id, 'rejected')}
                              className="p-1.5 rounded bg-rose-950/40 border border-rose-500/20 text-rose-400 hover:bg-rose-950/80 transition-colors inline-flex items-center"
                              title="Reject Account"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {user.status === 'approved' && (
                          <button
                            disabled={actionLoading === user.id}
                            onClick={() => handleStatusChange(user.id, 'pending')}
                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-400/30 transition-colors inline-flex items-center gap-1"
                            title="Disable/Suspend Account"
                          >
                            <Trash className="h-3 w-3" />
                            <span>Disable</span>
                          </button>
                        )}
                        {user.status === 'rejected' && (
                          <button
                            disabled={actionLoading === user.id}
                            onClick={() => handleStatusChange(user.id, 'approved')}
                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-400/30 transition-colors inline-flex items-center gap-1"
                            title="Approve / Restore Account"
                          >
                            <Check className="h-3 w-3" />
                            <span>Approve</span>
                          </button>
                        )}
                        <button
                          disabled={actionLoading === user.id}
                          onClick={() => setResettingUser(user)}
                          className="p-1.5 rounded bg-slate-900 border border-glass-border text-slate-400 hover:text-rose-500 transition-colors inline-flex items-center"
                          title="Reset Password"
                        >
                          <Key className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
