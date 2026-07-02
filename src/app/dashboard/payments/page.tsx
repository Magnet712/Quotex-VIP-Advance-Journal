'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers, Clock, CheckCircle, XCircle, Search, Filter,
  ChevronLeft, ChevronRight, RefreshCw, Download, 
  Database, Activity, FileText, ExternalLink, AlertCircle, ChevronDown, ChevronUp, Check
} from 'lucide-react';
import { getUserPayments } from '@/app/actions/billing';

interface PaymentRequest {
  id:                 string;
  plan_id:            string;
  amount:             number;
  currency:           string;
  network:            string;
  wallet_address:     string;
  txn_hash:           string | null;
  status:             'PENDING' | 'PROCESSING' | 'DETECTED' | 'CONFIRMING' | 'CONFIRMED' | 'EXPIRED' | 'FAILED' | 'DUPLICATE' | 'REJECTED';
  created_at:         string;
  expires_at:         string;
  confirmed_at:       string | null;
  confirmation_count: number;
  transition_logs:    string[] | null;
}

export default function PaymentsHistoryPage() {
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  
  const PAGE_SIZE = 20;

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUserPayments(page, PAGE_SIZE);
      if (res.success && res.payments) {
        setPayments(res.payments as PaymentRequest[]);
        setTotal(res.total);
      }
    } catch (err) {
      console.error('Failed to load user payments:', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filteredPayments = payments.filter(p => {
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const planMatch = p.plan_id.toLowerCase().includes(q);
      const hashMatch = p.txn_hash?.toLowerCase().includes(q) || false;
      const addrMatch = p.wallet_address.toLowerCase().includes(q);
      return planMatch || hashMatch || addrMatch;
    }
    return true;
  });

  const handleExportCSV = () => {
    if (filteredPayments.length === 0) return;
    const headers = ['Invoice ID', 'Date', 'Plan', 'Amount (USDT)', 'Network', 'Txn Hash', 'Status', 'Confirmations', 'Confirmed At'];
    const rows = filteredPayments.map(p => [
      p.id.slice(0, 8).toUpperCase(),
      new Date(p.created_at).toLocaleString(),
      p.plan_id.replace('_', ' ').toUpperCase(),
      p.amount,
      p.network,
      p.txn_hash || '—',
      p.status,
      p.confirmation_count,
      p.confirmed_at ? new Date(p.confirmed_at).toLocaleString() : '—'
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `billing_invoices_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const pendingCount = payments.filter(p => p.status === 'PENDING' || p.status === 'PROCESSING' || p.status === 'DETECTED' || p.status === 'CONFIRMING').length;
  const confirmedCount = payments.filter(p => p.status === 'CONFIRMED').length;

  if (loading && payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 font-mono">
        <Activity className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">QUERYING SAAS TRANSACTION LEDGER...</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto text-left font-mono">
      
      {/* Title bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
        <div>
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">billing records</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Payment Status Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          {filteredPayments.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-xs uppercase transition-all"
            >
              <Download className="h-3.5 w-3.5" /> Export Invoice CSV
            </button>
          )}
          <button
            onClick={loadPayments}
            className="flex items-center gap-1.5 px-3 py-2 rounded border border-glass-border hover:bg-slate-900/40 text-xs font-mono font-bold text-slate-400 hover:text-slate-200 transition-all uppercase"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'TOTAL INVOICES', value: String(total), icon: FileText, color: 'text-slate-200' },
          { label: 'CONFIRMED PAYMENTS', value: String(confirmedCount), icon: CheckCircle, color: 'text-neon-green' },
          { label: 'PENDING VERIFICATION', value: String(pendingCount), icon: Clock, color: 'text-amber-400 animate-pulse' },
          { label: 'FAILED / EXPIRED', value: String(payments.filter(p => p.status === 'FAILED' || p.status === 'EXPIRED' || p.status === 'REJECTED' || p.status === 'DUPLICATE').length), icon: XCircle, color: 'text-rose-400' }
        ].map((stat, i) => (
          <div key={i} className="glass-panel p-4 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-[8px] text-slate-500 tracking-wider uppercase">{stat.label}</div>
              <div className={`text-lg font-bold mt-2 ${stat.color}`}>{stat.value}</div>
            </div>
            <stat.icon className={`h-6.5 w-6.5 ${stat.color} opacity-60`} />
          </div>
        ))}
      </div>

      {/* Filters ledger bar */}
      <div className="glass-panel p-4 rounded-xl border border-glass-border space-y-4">
        <div className="flex flex-col sm:flex-row gap-3.5 items-stretch sm:items-center text-xs">
          <input
            type="text"
            placeholder="Search invoice Hash / Wallet address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-grow bg-[#02050b] border border-glass-border px-3.5 py-2 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-neon-green/30"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#02050b] border border-glass-border px-3.5 py-2 rounded text-slate-300"
          >
            <option value="ALL">ALL STATUSES</option>
            <option value="PENDING">PENDING</option>
            <option value="DETECTED">DETECTED</option>
            <option value="CONFIRMING">CONFIRMING</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="EXPIRED">EXPIRED</option>
            <option value="FAILED">FAILED</option>
            <option value="DUPLICATE">DUPLICATE</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </div>
      </div>

      {/* Payments ledger table */}
      <div className="glass-panel border border-glass-border rounded-xl overflow-hidden">
        <table className="w-full text-left text-[11px] font-mono border-collapse">
          <thead className="bg-[#030812] border-b border-glass-border text-slate-500 uppercase tracking-wider text-[9px]">
            <tr>
              <th className="p-4">INVOICE</th>
              <th className="p-4">DATE</th>
              <th className="p-4">PACKAGE</th>
              <th className="p-4">DEPOSIT</th>
              <th className="p-4">NETWORK</th>
              <th className="p-4">TX HASH</th>
              <th className="p-4 text-center">CONFIRMATIONS</th>
              <th className="p-4 text-right">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-glass-border/30 text-slate-300">
            {filteredPayments.map((p) => {
              const isConfirmed = p.status === 'CONFIRMED';
              const isPending = p.status === 'PENDING' || p.status === 'PROCESSING' || p.status === 'DETECTED' || p.status === 'CONFIRMING';
              const isExpanded = expandedInvoice === p.id;

              return (
                <React.Fragment key={p.id}>
                  <tr 
                    onClick={() => setExpandedInvoice(isExpanded ? null : p.id)}
                    className="hover:bg-slate-900/20 transition-colors cursor-pointer"
                  >
                    <td className="p-4 text-slate-500 font-bold flex items-center gap-1">
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {p.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="p-4 text-slate-400">
                      {new Date(p.created_at).toLocaleDateString([], { dateStyle: 'short' })}
                    </td>
                    <td className="p-4 font-bold text-slate-200 uppercase">{p.plan_id.replace('_', ' ')}</td>
                    <td className="p-4 text-slate-200 font-bold">${p.amount}</td>
                    <td className="p-4 text-slate-400">{p.network.replace('_', '-')}</td>
                    <td className="p-4 max-w-[120px] truncate select-all" title={p.txn_hash || ''}>
                      {p.txn_hash ? (
                        <span className="text-slate-400 hover:text-slate-200 transition-colors font-bold">
                          {p.txn_hash}
                        </span>
                      ) : (
                        <span className="text-slate-650 italic">No Hash</span>
                      )}
                    </td>
                    <td className="p-4 text-center font-bold text-slate-300">
                      {p.confirmation_count || 0}
                    </td>
                    <td className="p-4 text-right font-bold">
                      <span className={`px-2 py-0.5 rounded border text-[9px] uppercase ${
                        isConfirmed ? 'text-neon-green border-neon-green/30 bg-neon-green/5' :
                        isPending ? 'text-amber-400 border-amber-500/30 bg-amber-500/5' :
                        'text-rose-400 border-rose-500/30 bg-rose-500/5'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>

                  {/* Disclose Accordion drawer */}
                  {isExpanded && (
                    <tr className="bg-slate-900/10 border-t border-glass-border/20">
                      <td colSpan={8} className="p-4 space-y-3.5 text-left">
                        <div>
                          <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Invoice Metadata</div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-[10px] text-slate-400 font-mono">
                            <div>
                              <span className="text-slate-600 text-[8px] uppercase block">Deposit Address</span>
                              <span className="text-slate-300 font-bold block overflow-x-auto select-all mt-0.5">{p.wallet_address}</span>
                            </div>
                            <div>
                              <span className="text-slate-600 text-[8px] uppercase block">Expiry Deadline</span>
                              <span className="text-slate-300 font-bold block mt-0.5">
                                {new Date(p.expires_at).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-600 text-[8px] uppercase block">Subscription Action</span>
                              <span className="text-slate-300 font-bold block mt-0.5">
                                {isConfirmed ? 'PREMIUM ACTIVATED ✓' : 'AWAITING VERIFIED AUDITS'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-glass-border/20 pt-3">
                          <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">Audit Transition Logs</div>
                          <div className="space-y-1.5 pl-2 max-h-40 overflow-y-auto scrollbar-thin">
                            {p.transition_logs && p.transition_logs.map((log, idx) => (
                              <div key={idx} className="text-[10px] text-slate-400 font-mono flex items-start gap-1">
                                <span className="text-slate-600 shrink-0">&raquo;</span>
                                <span>{log}</span>
                              </div>
                            ))}
                            {(!p.transition_logs || p.transition_logs.length === 0) && (
                              <div className="text-[10px] text-slate-600 italic pl-1">No lifecycle state transition logs captured.</div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {filteredPayments.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-500 uppercase">
                  No payment audit records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination control */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs pt-2">
          <span className="text-slate-500">
            Showing Page {page} of {totalPages} ({total} Total Invoices)
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-2 rounded border border-glass-border bg-slate-900/40 hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="p-2 rounded border border-glass-border bg-slate-900/40 hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
