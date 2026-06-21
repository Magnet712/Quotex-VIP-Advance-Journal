'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getTrades, addTrade, updateTrade, deleteTrade } from '@/app/actions/trades';
import { 
  Plus, Edit2, Trash2, Image as ImageIcon, ExternalLink, 
  Search, Filter, X, Loader, Upload, AlertCircle, ArrowUpRight, ArrowDownRight 
} from 'lucide-react';

export default function JournalPage() {
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [strategyFilter, setStrategyFilter] = useState('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<any>(null);
  const [activeScreenshot, setActiveScreenshot] = useState<string | null>(null);

  // Form fields
  const [asset, setAsset] = useState('');
  const [strategy, setStrategy] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [profitLoss, setProfitLoss] = useState('');
  const [notes, setNotes] = useState('');
  const [tradeDate, setTradeDate] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);

  // Error/Success state
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
      }
      await refreshTrades();
    }
    loadData();
  }, []);

  const refreshTrades = async () => {
    setLoading(true);
    const res = await getTrades();
    if (res.success && res.trades) {
      setTrades(res.trades);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setAsset('');
    setStrategy('');
    setEntryPrice('');
    setExitPrice('');
    setProfitLoss('');
    setNotes('');
    setTradeDate(new Date().toISOString().substring(0, 16));
    setScreenshotFile(null);
    setFormError(null);
  };

  const openAddModal = () => {
    resetForm();
    setIsAddOpen(true);
  };

  const openEditModal = (trade: any) => {
    setEditingTrade(trade);
    setAsset(trade.asset);
    setStrategy(trade.strategy);
    setEntryPrice(String(trade.entry_price));
    setExitPrice(String(trade.exit_price));
    setProfitLoss(String(trade.profit_loss));
    setNotes(trade.notes || '');
    setTradeDate(new Date(trade.trade_date).toISOString().substring(0, 16));
    setScreenshotFile(null);
    setFormError(null);
  };

  const handleFileUpload = async (file: File): Promise<string | null> => {
    if (!user) return null;
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('trade-screenshots')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Upload error:', error);
      throw new Error('Failed to upload screenshot: ' + error.message);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('trade-screenshots')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    if (!asset || !strategy || !entryPrice || !exitPrice || !profitLoss) {
      setFormError('Please fill in all required fields.');
      setFormLoading(false);
      return;
    }

    try {
      let screenshotUrl = '';
      if (screenshotFile) {
        screenshotUrl = await handleFileUpload(screenshotFile) || '';
      }

      const res = await addTrade({
        asset,
        strategy,
        entry_price: Number(entryPrice),
        exit_price: Number(exitPrice),
        profit_loss: Number(profitLoss),
        notes,
        trade_date: tradeDate ? new Date(tradeDate).toISOString() : new Date().toISOString(),
        screenshot_url: screenshotUrl,
      });

      if (res.success) {
        setIsAddOpen(false);
        resetForm();
        await refreshTrades();
      } else {
        setFormError(res.error || 'Failed to record trade.');
      }
    } catch (err: any) {
      setFormError(err.message || 'An error occurred.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrade) return;

    setFormError(null);
    setFormLoading(true);

    try {
      let screenshotUrl = editingTrade.screenshot_url;
      if (screenshotFile) {
        screenshotUrl = await handleFileUpload(screenshotFile) || '';
      }

      const res = await updateTrade(editingTrade.id, {
        asset,
        strategy,
        entry_price: Number(entryPrice),
        exit_price: Number(exitPrice),
        profit_loss: Number(profitLoss),
        notes,
        trade_date: tradeDate ? new Date(tradeDate).toISOString() : new Date().toISOString(),
        screenshot_url: screenshotUrl,
      });

      if (res.success) {
        setEditingTrade(null);
        resetForm();
        await refreshTrades();
      } else {
        setFormError(res.error || 'Failed to update trade.');
      }
    } catch (err: any) {
      setFormError(err.message || 'An error occurred.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (tradeId: string) => {
    if (!confirm('Are you sure you want to delete this trade record?')) return;
    try {
      const res = await deleteTrade(tradeId);
      if (res.success) {
        await refreshTrades();
      } else {
        alert(res.error || 'Failed to delete record.');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred.');
    }
  };

  // --- FILTER & SEARCH ---
  const assets = ['ALL', ...Array.from(new Set(trades.map((t) => t.asset)))];
  const strategies = ['ALL', ...Array.from(new Set(trades.map((t) => t.strategy)))];

  const filteredTrades = trades.filter((t) => {
    const matchesSearch = 
      t.asset.toLowerCase().includes(search.toLowerCase()) ||
      t.strategy.toLowerCase().includes(search.toLowerCase()) ||
      (t.notes && t.notes.toLowerCase().includes(search.toLowerCase()));

    const matchesAsset = assetFilter === 'ALL' || t.asset === assetFilter;
    const matchesStrategy = strategyFilter === 'ALL' || t.strategy === strategyFilter;
    
    let matchesOutcome = true;
    if (outcomeFilter === 'WINS') matchesOutcome = t.profit_loss > 0;
    if (outcomeFilter === 'LOSSES') matchesOutcome = t.profit_loss <= 0;

    return matchesSearch && matchesAsset && matchesStrategy && matchesOutcome;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto">
      
      {/* Title / Action bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
        <div>
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">transaction ledger</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Trading Journal</h1>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-xs font-mono tracking-wider uppercase transition-colors glow-button"
        >
          <Plus className="h-4 w-4" /> RECORD NEW TRADE
        </button>
      </div>

      {/* Screenshot Preview Modal */}
      {activeScreenshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setActiveScreenshot(null)}>
          <div className="relative max-w-3xl w-full glass-panel border border-glass-border p-2 rounded-lg" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setActiveScreenshot(null)} className="absolute top-4 right-4 p-1.5 rounded bg-slate-950/65 border border-glass-border text-slate-400 hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
            <img src={activeScreenshot} alt="Trade Screenshot" className="w-full h-auto rounded max-h-[75vh] object-contain" />
          </div>
        </div>
      )}

      {/* Add / Edit Trade Modal */}
      {(isAddOpen || editingTrade) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="w-full max-w-xl glass-panel border border-glass-border rounded-xl p-6 relative space-y-4">
            <button 
              onClick={() => {
                setIsAddOpen(false);
                setEditingTrade(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-slate-900 border border-glass-border text-slate-400 hover:text-slate-200"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-sm font-mono font-bold text-slate-200 uppercase tracking-wide">
                {isAddOpen ? 'RECORD NEW TRANSACTION' : 'MODIFY TRADE LEDGER'}
              </h3>
              <p className="text-[9px] text-slate-500 font-mono">
                ENSURE MATHEMATICAL SIZING PARAMETERS ARE LOGGED ACCURATELY
              </p>
            </div>

            {formError && (
              <div className="bg-rose-950/20 border border-rose-500/20 text-rose-400 p-3 rounded text-xs leading-relaxed flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={isAddOpen ? handleAddSubmit : handleEditSubmit} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-4">
                {/* Asset */}
                <div className="space-y-1">
                  <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Asset Pair</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EUR/USD"
                    value={asset}
                    onChange={(e) => setAsset(e.target.value)}
                    className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 uppercase placeholder-slate-700 focus:outline-none focus:border-neon-green/30"
                  />
                </div>

                {/* Strategy */}
                <div className="space-y-1">
                  <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Strategy Used</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. VIP Golden EMA"
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                    className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 placeholder-slate-700 focus:outline-none focus:border-neon-green/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Entry Price */}
                <div className="space-y-1">
                  <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Entry Price</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="1.0850"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 placeholder-slate-700 focus:outline-none focus:border-neon-green/30"
                  />
                </div>

                {/* Exit Price */}
                <div className="space-y-1">
                  <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Exit Price</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="1.0875"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 placeholder-slate-700 focus:outline-none focus:border-neon-green/30"
                  />
                </div>

                {/* Profit Loss */}
                <div className="space-y-1">
                  <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Profit/Loss ($)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 150 or -75"
                    value={profitLoss}
                    onChange={(e) => setProfitLoss(e.target.value)}
                    className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 placeholder-slate-700 focus:outline-none focus:border-neon-green/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Date */}
                <div className="space-y-1">
                  <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Execution Date</label>
                  <input
                    type="datetime-local"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none focus:border-neon-green/30"
                  />
                </div>

                {/* File Upload */}
                <div className="space-y-1">
                  <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Upload Chart Screenshot</label>
                  <label className="w-full bg-[#030812] border border-glass-border hover:border-glass-border-hover rounded px-3 py-2 text-slate-400 cursor-pointer flex items-center justify-center gap-1.5 transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    <span className="truncate">{screenshotFile ? screenshotFile.name : 'Select image file'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Psychology & Technical Notes</label>
                <textarea
                  placeholder="Analyze execution discipline, FOMO factors, or support breakout confirmations."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 placeholder-slate-700 focus:outline-none focus:border-neon-green/30 font-sans"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-grow py-2.5 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover transition-colors tracking-wider uppercase flex items-center justify-center gap-1.5"
                >
                  {formLoading ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      <span>RECORDING SUBMISSION...</span>
                    </>
                  ) : (
                    <span>CONFIRM WRITE TO LEDGER</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddOpen(false);
                    setEditingTrade(null);
                  }}
                  className="px-4 py-2.5 rounded bg-slate-900 border border-glass-border hover:bg-slate-800 text-slate-400 font-bold"
                >
                  CANCEL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filters Area */}
      <div className="glass-panel p-4 rounded-lg flex flex-col md:flex-row gap-4 items-stretch md:items-center text-xs">
        {/* Search */}
        <div className="flex-1 relative flex items-center">
          <Search className="h-4 w-4 text-slate-500 absolute left-3" />
          <input
            type="text"
            placeholder="Search assets, strategies, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#030812] border border-glass-border pl-10 pr-4 py-2 rounded text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/30"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          
          {/* Asset filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">ASSET:</span>
            <select
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              className="bg-[#030812] border border-glass-border px-2 py-1.5 rounded text-slate-300 font-mono text-[11px] outline-none"
            >
              {assets.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Strategy filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">STRATEGY:</span>
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="bg-[#030812] border border-glass-border px-2 py-1.5 rounded text-slate-300 font-mono text-[11px] outline-none"
            >
              {strategies.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Outcome Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">OUTCOME:</span>
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="bg-[#030812] border border-glass-border px-2 py-1.5 rounded text-slate-300 font-mono text-[11px] outline-none"
            >
              <option value="ALL">ALL</option>
              <option value="WINS">WINS ONLY</option>
              <option value="LOSSES">LOSSES ONLY</option>
            </select>
          </div>

        </div>
      </div>

      {/* Ledger Table */}
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Loader className="h-7 w-7 animate-spin text-neon-green" />
        </div>
      ) : (
        <div className="glass-panel rounded-lg overflow-hidden border border-glass-border">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-glass-border text-slate-500 text-[10px] tracking-wider uppercase font-bold">
                  <th className="p-4">Date</th>
                  <th className="p-4">Asset</th>
                  <th className="p-4">Strategy</th>
                  <th className="p-4 text-right">Entry / Exit</th>
                  <th className="p-4 text-right">Profit / Loss</th>
                  <th className="p-4 text-center">Chart</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border/40">
                {filteredTrades.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-600">
                      NO MATCHING TRANSACTION ENTRIES RECORDED.
                    </td>
                  </tr>
                ) : (
                  filteredTrades.map((trade) => {
                    const isWin = trade.profit_loss > 0;
                    return (
                      <tr key={trade.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="p-4 text-slate-400">
                          {new Date(trade.trade_date).toLocaleDateString([], { month: 'short', day: '2-digit' })}
                          <span className="text-[9px] text-slate-600 block">
                            {new Date(trade.trade_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="p-4 font-bold text-slate-200">{trade.asset}</td>
                        <td className="p-4 text-slate-400">{trade.strategy}</td>
                        <td className="p-4 text-right text-slate-300">
                          {Number(trade.entry_price).toFixed(4)}
                          <span className="text-[9px] text-slate-500 block">
                            &rarr; {Number(trade.exit_price).toFixed(4)}
                          </span>
                        </td>
                        <td className={`p-4 text-right font-bold font-mono ${isWin ? 'text-neon-green' : 'text-rose-500'}`}>
                          {isWin ? '+' : ''}${Number(trade.profit_loss).toFixed(2)}
                        </td>
                        <td className="p-4 text-center">
                          {trade.screenshot_url ? (
                            <button
                              onClick={() => setActiveScreenshot(trade.screenshot_url)}
                              className="p-1 rounded bg-slate-900 border border-glass-border hover:border-neon-green/30 text-slate-400 hover:text-neon-green transition-colors inline-flex items-center"
                              title="View screenshot"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span className="text-[9px] text-slate-700">None</span>
                          )}
                        </td>
                        <td className="p-4 text-right space-x-1.5">
                          <button
                            onClick={() => openEditModal(trade)}
                            className="p-1 rounded bg-slate-900 border border-glass-border hover:border-neon-green/30 text-slate-400 hover:text-neon-green transition-colors inline-flex items-center"
                            title="Edit"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(trade.id)}
                            className="p-1 rounded bg-slate-900 border border-glass-border hover:border-rose-500/30 text-slate-400 hover:text-rose-500 transition-colors inline-flex items-center"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
