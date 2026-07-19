'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getTrades, addTrade, updateTrade, deleteTrade, eraseTrades, addMultipleTrades } from '@/app/actions/trades';
import { 
  Plus, Edit2, Trash2, Image as ImageIcon, ExternalLink, 
  Search, Filter, X, Loader, Upload, AlertCircle, ArrowUpRight, ArrowDownRight, Trash, BrainCircuit, HeartHandshake, Eye
} from 'lucide-react';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';

export default function JournalPage() {
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [userAccess, setUserAccess] = useState<any>({
    vipAccess: false,
    premiumAccess: false,
    status: 'pending'
  });

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [strategyFilter, setStrategyFilter] = useState('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<any>(null);
  const [activeScreenshot, setActiveScreenshot] = useState<string | null>(null);

  // --- FORM FIELDS ---
  // Common Session Metadata (Used in Add / Edit)
  const [strategy, setStrategy] = useState('');
  const [notes, setNotes] = useState('');
  const [tradeDate, setTradeDate] = useState('');
  const [session, setSession] = useState('Asia');
  const [emotionalState, setEmotionalState] = useState('Calm');
  const [tradeQuality, setTradeQuality] = useState('A');
  const [executionGrade, setExecutionGrade] = useState('Clean');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);

  // Multi-Trade Recording Fields (Only for Add)
  const [tradesList, setTradesList] = useState<Array<{
    id: string;
    asset: string;
    initialBalance: string;
    target: string;
    percentage: string;
    results: 'Win' | 'Loss' | 'MTG Win';
    autoPL: boolean;
    profitLoss: string;
  }>>([
    { id: '1', asset: '', initialBalance: '', target: '', percentage: '', results: 'Win', autoPL: true, profitLoss: '' }
  ]);

  // Single-Trade Edit Fields (Only for Edit Mode)
  const [asset, setAsset] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [profitLoss, setProfitLoss] = useState('');
  const [editInitialBalance, setEditInitialBalance] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editPercentage, setEditPercentage] = useState('');
  const [editResults, setEditResults] = useState<'Win' | 'Loss' | 'MTG Win'>('Win');
  const [editAutoPL, setEditAutoPL] = useState(false);

  // Error/Success state
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Delete/Erase confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [eraseAllStep, setEraseAllStep] = useState(0);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      try {
        const [sessionRes, accessRes] = await Promise.all([
          supabase.auth.getSession(),
          getUserAccessState()
        ]);
        if (sessionRes.data.session?.user) {
          setUser(sessionRes.data.session.user);
        }
        if (accessRes.success) {
          setUserAccess({
            vipAccess: accessRes.vipAccess,
            premiumAccess: accessRes.premiumAccess,
            status: accessRes.status
          });
        }
      } catch (err) {
        console.error('Failed to load journal page user state:', err);
      }
      await refreshTrades();
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(t);
  }, [notification]);

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

    // Reset session fields
    setSession('Asia');
    setEmotionalState('Calm');
    setTradeQuality('A');
    setExecutionGrade('Clean');

    // Reset multi-trade builder
    setTradesList([
      { id: '1', asset: '', initialBalance: '', target: '', percentage: '', results: 'Win', autoPL: true, profitLoss: '' }
    ]);

    // Reset single edit states
    setEditInitialBalance('');
    setEditTarget('');
    setEditPercentage('');
    setEditResults('Win');
    setEditAutoPL(false);
  };

  const openAddModal = () => {
    resetForm();
    setIsAddOpen(true);
  };

  const openEditModal = (trade: any) => {
    setEditingTrade(trade);
    setAsset(trade.asset);
    setStrategy(trade.strategy);
    setEntryPrice(trade.entry_price !== null && trade.entry_price !== undefined ? String(trade.entry_price) : '');
    setExitPrice(trade.exit_price !== null && trade.exit_price !== undefined ? String(trade.exit_price) : '');
    setProfitLoss(String(trade.profit_loss));
    setNotes(trade.notes || '');
    setTradeDate(new Date(trade.trade_date).toISOString().substring(0, 16));
    setScreenshotFile(null);
    setFormError(null);

    // Populate session parameters
    setSession(trade.session || 'Asia');
    setEmotionalState(trade.emotional_state || 'Calm');
    setTradeQuality(trade.trade_quality || 'A');
    setExecutionGrade(trade.execution_grade || 'Clean');

    // Populate single-edit trade parameters
    setEditInitialBalance(trade.initial_balance !== null && trade.initial_balance !== undefined ? String(trade.initial_balance) : '');
    setEditTarget(trade.target !== null && trade.target !== undefined ? String(trade.target) : '');
    setEditPercentage(trade.percentage !== null && trade.percentage !== undefined ? String(trade.percentage) : '');
    setEditResults(trade.results || 'Win');
    setEditAutoPL(false);
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

  // Multi-Trade List Modifiers
  const addTradeRow = () => {
    const lastRow = tradesList[tradesList.length - 1];
    setTradesList([
      ...tradesList,
      {
        id: String(Date.now() + Math.random()),
        asset: lastRow ? lastRow.asset : '',
        initialBalance: lastRow ? lastRow.initialBalance : '',
        target: lastRow ? lastRow.target : '',
        percentage: lastRow ? lastRow.percentage : '',
        results: 'Win',
        autoPL: true,
        profitLoss: ''
      }
    ]);
  };

  const removeTradeRow = (id: string) => {
    if (tradesList.length === 1) return;
    setTradesList(tradesList.filter(t => t.id !== id));
  };

  const updateTradeRow = (id: string, field: string, value: any) => {
    setTradesList(tradesList.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, [field]: value };

      // Perform Auto P/L calculations if checked
      if (updated.autoPL && (field === 'initialBalance' || field === 'percentage' || field === 'results' || field === 'autoPL')) {
        const bal = Number(updated.initialBalance) || 0;
        const pct = Number(updated.percentage) || 0;
        if (updated.results === 'Win' || updated.results === 'MTG Win') {
          updated.profitLoss = String((bal * pct / 100).toFixed(2));
        } else {
          updated.profitLoss = String((-bal * pct / 100).toFixed(2));
        }
      }
      return updated;
    }));
  };

  // Single Edit Auto P/L calculator
  const handleSingleEditAutoPL = (field: string, value: any) => {
    let bal = Number(field === 'editInitialBalance' ? value : editInitialBalance) || 0;
    let pct = Number(field === 'editPercentage' ? value : editPercentage) || 0;
    let res = (field === 'editResults' ? value : editResults);
    let auto = (field === 'editAutoPL' ? value : editAutoPL);

    if (field === 'editInitialBalance') setEditInitialBalance(value);
    if (field === 'editPercentage') setEditPercentage(value);
    if (field === 'editResults') setEditResults(value);
    if (field === 'editAutoPL') setEditAutoPL(value);

    if (auto) {
      if (res === 'Win' || res === 'MTG Win') {
        setProfitLoss(String((bal * pct / 100).toFixed(2)));
      } else {
        setProfitLoss(String((-bal * pct / 100).toFixed(2)));
      }
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    // Validate entries
    for (const t of tradesList) {
      if (!t.asset || !t.profitLoss) {
        setFormError('Please fill in Asset Pair and Profit/Loss for all trade rows.');
        setFormLoading(false);
        return;
      }
    }

    try {
      let screenshotUrl = '';
      if (screenshotFile) {
        screenshotUrl = await handleFileUpload(screenshotFile) || '';
      }

      // Format array of trades
      const tradesData = tradesList.map(t => ({
        asset: t.asset,
        strategy: strategy.trim(),
        profit_loss: Number(t.profitLoss),
        notes: notes.trim(),
        trade_date: tradeDate ? new Date(tradeDate).toISOString() : new Date().toISOString(),
        screenshot_url: screenshotUrl,
        // Session parameters
        session,
        emotional_state: emotionalState,
        trade_quality: tradeQuality,
        execution_grade: executionGrade,
        // Trade specific inputs
        initial_balance: t.initialBalance ? Number(t.initialBalance) : null,
        target: t.target ? Number(t.target) : null,
        results: t.results,
        percentage: t.percentage ? Number(t.percentage) : null,
      }));

      const res = await addMultipleTrades(tradesData);

      if (res.success) {
        setIsAddOpen(false);
        resetForm();
        await refreshTrades();
      } else {
        setFormError(res.error || 'Failed to record session trades.');
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
        entry_price: entryPrice ? Number(entryPrice) : null,
        exit_price: exitPrice ? Number(exitPrice) : null,
        profit_loss: Number(profitLoss),
        notes,
        trade_date: tradeDate ? new Date(tradeDate).toISOString() : new Date().toISOString(),
        screenshot_url: screenshotUrl,
        // Session parameters
        session,
        emotional_state: emotionalState,
        trade_quality: tradeQuality,
        execution_grade: executionGrade,
        // Trade specific inputs
        initial_balance: editInitialBalance ? Number(editInitialBalance) : null,
        target: editTarget ? Number(editTarget) : null,
        results: editResults,
        percentage: editPercentage ? Number(editPercentage) : null,
      });

      if (res.success) {
        setEditingTrade(null);
        resetForm();
        await refreshTrades();
      } else {
        setFormError(res.error || 'Failed to update trade record.');
      }
    } catch (err: any) {
      setFormError(err.message || 'An error occurred.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (tradeId: string) => {
    setDeleteConfirmId(tradeId);
  };

  const confirmDelete = async () => {
    const tradeId = deleteConfirmId;
    if (!tradeId) return;
    setDeleteConfirmId(null);
    try {
      const res = await deleteTrade(tradeId);
      if (res.success) {
        await refreshTrades();
      } else {
        setNotification({ type: 'error', message: res.error || 'Failed to delete record.' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error occurred.' });
    }
  };

  const handleEraseAll = async () => {
    setEraseAllStep(1);
  };

  const confirmEraseFirst = () => {
    setEraseAllStep(2);
  };

  const confirmEraseSecond = async () => {
    setEraseAllStep(0);
    setLoading(true);
    try {
      const res = await eraseTrades();
      if (res.success) {
        setNotification({ type: 'success', message: 'All trading data has been permanently deleted.' });
        await refreshTrades();
      } else {
        setNotification({ type: 'error', message: res.error || 'Failed to erase data.' });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Error erasing data: ' + err.message });
    } finally {
      setLoading(false);
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
    const isWin = t.profit_loss > 0 || t.results === 'Win' || t.results === 'MTG Win';
    if (outcomeFilter === 'WINS') matchesOutcome = isWin;
    if (outcomeFilter === 'LOSSES') matchesOutcome = !isWin;

    return matchesSearch && matchesAsset && matchesStrategy && matchesOutcome;
  });

  const profile = {
    vip_access: userAccess.vipAccess,
    premium_access: userAccess.premiumAccess,
    status: userAccess.status
  };

  if (!loading && !canAccess('journal', profile)) {
    return <LockedFeature feature="journal" />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto animate-fadeIn">
      
      {/* Title / Action bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4 animate-fadeInUp">
        <div>
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">transaction ledger</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Trading Journal</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleEraseAll}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded border border-rose-500/35 hover:bg-rose-950/20 text-rose-400 font-bold text-xs font-mono tracking-wider uppercase transition-all"
          >
            <Trash2 className="h-4 w-4" /> ERASE DATA
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-xs font-mono tracking-wider uppercase transition-colors glow-button"
          >
            <Plus className="h-4 w-4" /> RECORD NEW TRADE
          </button>
        </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-4xl glass-panel border border-glass-border rounded-xl p-6 relative space-y-4 my-8">
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
                {isAddOpen ? 'RECORD NEW SESSION & TRADES' : 'MODIFY TRADE LEDGER'}
              </h3>
              <p className="text-[9px] text-slate-500 font-mono">
                {isAddOpen ? 'BATCH ENTER TRADES UNDER ONE EXECUTION DATE & SESSION METADATA' : 'ENSURE MATHEMATICAL SIZING PARAMETERS ARE LOGGED ACCURATELY'}
              </p>
            </div>

            {formError && (
              <div className="bg-rose-950/20 border border-rose-500/20 text-rose-400 p-3 rounded text-xs leading-relaxed flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={isAddOpen ? handleAddSubmit : handleEditSubmit} className="space-y-6 text-xs font-mono">
              
              {/* Session Meta Section */}
              <div className="glass-panel p-4 rounded-lg bg-slate-900/30 border border-glass-border/30 space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide pb-1.5 border-b border-glass-border/20 flex items-center gap-1.5">
                  <BrainCircuit className="h-4 w-4 text-neon-green" /> Session Metadata
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Date */}
                  <div className="space-y-1">
                    <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Execution Date</label>
                    <input
                      type="datetime-local"
                      required
                      value={tradeDate}
                      onChange={(e) => setTradeDate(e.target.value)}
                      className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none focus:border-neon-green/30"
                    />
                  </div>

                  {/* Session Dropdown */}
                  <div className="space-y-1">
                    <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Trading Session</label>
                    <select
                      value={session}
                      onChange={(e) => setSession(e.target.value)}
                      className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none focus:border-neon-green/30"
                    >
                      <option value="Asia">Asia</option>
                      <option value="London">London</option>
                      <option value="New York">New York</option>
                    </select>
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Emotional State */}
                  <div className="space-y-1">
                    <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Emotional State</label>
                    <select
                      value={emotionalState}
                      onChange={(e) => setEmotionalState(e.target.value)}
                      className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none focus:border-neon-green/30"
                    >
                      <option value="Calm">Calm</option>
                      <option value="Focused">Focused</option>
                      <option value="Confident">Confident</option>
                      <option value="fearful">Fearful</option>
                      <option value="Revenge Trading">Revenge Trading</option>
                      <option value="Overconfident">Overconfident</option>
                    </select>
                  </div>

                  {/* Trade Quality */}
                  <div className="space-y-1">
                    <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Setup Quality</label>
                    <select
                      value={tradeQuality}
                      onChange={(e) => setTradeQuality(e.target.value)}
                      className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none focus:border-neon-green/30"
                    >
                      <option value="A+">A+</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                    </select>
                  </div>

                  {/* Execution Grade */}
                  <div className="space-y-1">
                    <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Execution Grade</label>
                    <select
                      value={executionGrade}
                      onChange={(e) => setExecutionGrade(e.target.value)}
                      className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none focus:border-neon-green/30"
                    >
                      <option value="Clean">Clean</option>
                      <option value="institutional">Institutional</option>
                      <option value="Average">Average</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Add Mode: Multi-Trade builder */}
              {isAddOpen && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-glass-border/30">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                      <HeartHandshake className="h-4 w-4 text-neon-green" /> Recorded Trades
                    </h4>
                    <button
                      type="button"
                      onClick={addTradeRow}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-glass-border hover:border-neon-green/40 hover:text-neon-green text-[9px] font-bold transition-all"
                    >
                      + ADD ANOTHER TRADE
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {tradesList.map((t, index) => (
                      <div key={t.id} className="glass-panel p-4 rounded-lg bg-slate-950/40 border border-glass-border/30 space-y-4 relative">
                        <div className="flex justify-between items-center pb-2 border-b border-glass-border/10">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Trade Row #{index + 1}</span>
                          {tradesList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeTradeRow(t.id)}
                              className="text-[9px] text-rose-500 hover:text-rose-400 uppercase font-bold"
                            >
                              [Remove Row]
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                          {/* Asset */}
                          <div className="space-y-1">
                            <label className="block text-[9px] text-slate-400 uppercase font-bold">Asset Pair</label>
                            <input
                              type="text"
                              required
                              placeholder="EUR/USD"
                              value={t.asset}
                              onChange={(e) => updateTradeRow(t.id, 'asset', e.target.value)}
                              className="w-full bg-[#030812] border border-glass-border px-2 py-1.5 rounded text-slate-200 uppercase placeholder-slate-700 focus:outline-none"
                            />
                          </div>

                          {/* Initial Balance */}
                          <div className="space-y-1">
                            <label className="block text-[9px] text-slate-400 uppercase font-bold">Balance ($)</label>
                            <input
                              type="number"
                              step="any"
                              required
                              placeholder="1000"
                              value={t.initialBalance}
                              onChange={(e) => updateTradeRow(t.id, 'initialBalance', e.target.value)}
                              className="w-full bg-[#030812] border border-glass-border px-2 py-1.5 rounded text-slate-200 placeholder-slate-700 focus:outline-none"
                            />
                          </div>

                          {/* Target */}
                          <div className="space-y-1">
                            <label className="block text-[9px] text-slate-400 uppercase font-bold">Target ($)</label>
                            <input
                              type="number"
                              step="any"
                              required
                              placeholder="10"
                              value={t.target}
                              onChange={(e) => updateTradeRow(t.id, 'target', e.target.value)}
                              className="w-full bg-[#030812] border border-glass-border px-2 py-1.5 rounded text-slate-200 placeholder-slate-700 focus:outline-none"
                            />
                          </div>

                          {/* Percentage */}
                          <div className="space-y-1">
                            <label className="block text-[9px] text-slate-400 uppercase font-bold">Pct (%)</label>
                            <input
                              type="number"
                              step="any"
                              required
                              placeholder="85"
                              value={t.percentage}
                              onChange={(e) => updateTradeRow(t.id, 'percentage', e.target.value)}
                              className="w-full bg-[#030812] border border-glass-border px-2 py-1.5 rounded text-slate-200 placeholder-slate-700 focus:outline-none"
                            />
                          </div>

                          {/* Results */}
                          <div className="space-y-1">
                            <label className="block text-[9px] text-slate-400 uppercase font-bold">Result</label>
                            <select
                              value={t.results}
                              onChange={(e) => updateTradeRow(t.id, 'results', e.target.value)}
                              className="w-full bg-[#030812] border border-glass-border px-2 py-1.5 rounded text-slate-200 focus:outline-none"
                            >
                              <option value="Win">Win</option>
                              <option value="Loss">Loss</option>
                              <option value="MTG Win">MTG Win</option>
                            </select>
                          </div>

                          {/* P/L & Auto P/L */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <label className="block text-[9px] text-slate-400 uppercase font-bold">P&L ($)</label>
                              <label className="flex items-center gap-0.5 text-[8px] text-slate-500 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={t.autoPL}
                                  onChange={(e) => updateTradeRow(t.id, 'autoPL', e.target.checked)}
                                  className="rounded-sm border-glass-border bg-slate-900 focus:ring-0 scale-75"
                                />
                                <span>Auto</span>
                              </label>
                            </div>
                            <input
                              type="number"
                              step="any"
                              required
                              disabled={t.autoPL}
                              placeholder="150"
                              value={t.profitLoss}
                              onChange={(e) => updateTradeRow(t.id, 'profitLoss', e.target.value)}
                              className="w-full bg-[#030812] border border-glass-border px-2 py-1.5 rounded text-slate-200 placeholder-slate-700 focus:outline-none disabled:opacity-50"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Edit Mode: Single-Trade Fields */}
              {editingTrade && (
                <div className="glass-panel p-4 rounded-lg bg-slate-900/30 border border-glass-border/30 space-y-4">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide pb-1.5 border-b border-glass-border/20 flex items-center gap-1.5">
                    <Plus className="h-4 w-4 text-neon-green" /> Trade Metrics
                  </h4>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Asset */}
                    <div className="space-y-1">
                      <label className="block text-[9px] text-slate-400 uppercase font-bold">Asset Pair</label>
                      <input
                        type="text"
                        required
                        value={asset}
                        onChange={(e) => setAsset(e.target.value)}
                        className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 uppercase focus:outline-none"
                      />
                    </div>

                    {/* Initial Balance */}
                    <div className="space-y-1">
                      <label className="block text-[9px] text-slate-400 uppercase font-bold">Initial Balance</label>
                      <input
                        type="number"
                        step="any"
                        value={editInitialBalance}
                        onChange={(e) => handleSingleEditAutoPL('editInitialBalance', e.target.value)}
                        className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none"
                      />
                    </div>

                    {/* Target */}
                    <div className="space-y-1">
                      <label className="block text-[9px] text-slate-400 uppercase font-bold">Target</label>
                      <input
                        type="number"
                        step="any"
                        value={editTarget}
                        onChange={(e) => setEditTarget(e.target.value)}
                        className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none"
                      />
                    </div>

                    {/* Percentage */}
                    <div className="space-y-1">
                      <label className="block text-[9px] text-slate-400 uppercase font-bold">Percentage (%)</label>
                      <input
                        type="number"
                        step="any"
                        value={editPercentage}
                        onChange={(e) => handleSingleEditAutoPL('editPercentage', e.target.value)}
                        className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Results */}
                    <div className="space-y-1">
                      <label className="block text-[9px] text-slate-400 uppercase font-bold">Result</label>
                      <select
                        value={editResults}
                        onChange={(e) => handleSingleEditAutoPL('editResults', e.target.value)}
                        className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none"
                      >
                        <option value="Win">Win</option>
                        <option value="Loss">Loss</option>
                        <option value="MTG Win">MTG Win</option>
                      </select>
                    </div>

                    {/* Profit/Loss and Auto P/L */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="block text-[9px] text-slate-400 uppercase font-bold">Profit/Loss ($)</label>
                        <label className="flex items-center gap-0.5 text-[8px] text-slate-500 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editAutoPL}
                            onChange={(e) => handleSingleEditAutoPL('editAutoPL', e.target.checked)}
                            className="rounded-sm border-glass-border bg-slate-900 focus:ring-0 scale-75"
                          />
                          <span>Auto</span>
                        </label>
                      </div>
                      <input
                        type="number"
                        step="any"
                        required
                        disabled={editAutoPL}
                        value={profitLoss}
                        onChange={(e) => setProfitLoss(e.target.value)}
                        className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none disabled:opacity-50"
                      />
                    </div>

                    {/* Entry Price (Legacy compatibility, optional) */}
                    <div className="space-y-1">
                      <label className="block text-[9px] text-slate-400 uppercase font-bold">Entry Price (Optional)</label>
                      <input
                        type="number"
                        step="any"
                        value={entryPrice}
                        onChange={(e) => setEntryPrice(e.target.value)}
                        className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none"
                      />
                    </div>

                    {/* Exit Price (Legacy compatibility, optional) */}
                    <div className="space-y-1">
                      <label className="block text-[9px] text-slate-400 uppercase font-bold">Exit Price (Optional)</label>
                      <input
                        type="number"
                        step="any"
                        value={exitPrice}
                        onChange={(e) => setExitPrice(e.target.value)}
                        className="w-full bg-[#030812] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Extra details (Notes & Screenshots) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                {/* Screenshot Upload */}
                <div className="space-y-1">
                  <label className="block text-[9px] text-slate-400 uppercase tracking-wider font-bold">Upload Session Screenshot (Optional)</label>
                  <label className="w-full h-[72px] bg-[#030812] border border-glass-border hover:border-glass-border-hover rounded px-3 py-2 text-slate-400 cursor-pointer flex flex-col items-center justify-center gap-1 transition-colors">
                    <Upload className="h-4 w-4" />
                    <span className="truncate text-[10px] text-center max-w-full block px-2">
                      {screenshotFile ? screenshotFile.name : 'Select file (PNG, JPG, WEBP)'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
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
                      <Loader className="h-4 w-4 animate-spin text-slate-950" />
                      <span>SAVING DATA PARAMETERS...</span>
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
      <div className="glass-panel p-4 rounded-lg flex flex-col md:flex-row gap-4 items-stretch md:items-center text-xs transition-all duration-200 hover:border-glass-border/50">
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
                  <th className="p-4">Date / Session</th>
                  <th className="p-4">Asset / Strategy</th>
                  <th className="p-4">Session Details</th>
                  <th className="p-4">Trade Parameters</th>
                  <th className="p-4 text-right">Profit / Loss</th>
                  <th className="p-4 text-center">Chart</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              {/* Table body with enhanced row styling */}
              <tbody className="divide-y divide-glass-border/40 text-[11px]">
                {filteredTrades.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-600 py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Search className="h-6 w-6 text-slate-700" />
                        <span>NO MATCHING TRANSACTION ENTRIES RECORDED.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTrades.map((trade, idx) => {
                    const isWin = trade.profit_loss > 0 || trade.results === 'Win' || trade.results === 'MTG Win';
                    return (
                      <tr key={trade.id} className="hover:bg-slate-900/30 transition-all duration-150 hover:scale-[1.001]" style={{ animationDelay: `${idx * 0.02}s` }}>
                        {/* Date / Session */}
                        <td className="p-4 text-slate-400">
                          {new Date(trade.trade_date).toLocaleDateString([], { month: 'short', day: '2-digit' })}
                          <span className="text-[9px] text-slate-600 block">
                            {new Date(trade.trade_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {trade.session && (
                            <span className="inline-block mt-1 px-1 py-0.5 rounded text-[8px] bg-slate-900 border border-glass-border/40 text-slate-400 font-bold uppercase">
                              {trade.session}
                            </span>
                          )}
                        </td>

                        {/* Asset / Strategy */}
                        <td className="p-4 font-bold text-slate-200">
                          <span className="block text-slate-200">{trade.asset}</span>
                          <span className="text-[9px] text-slate-500 font-normal block mt-0.5">
                            {trade.strategy || 'No Strategy'}
                          </span>
                        </td>

                        {/* Session Details */}
                        <td className="p-4 text-slate-300">
                          <div className="space-y-0.5 text-[10px]">
                            {trade.emotional_state && (
                              <div>
                                <span className="text-slate-500 text-[9px]">Psyche:</span>{' '}
                                <span className={trade.emotional_state === 'Revenge Trading' || trade.emotional_state === 'fearful' ? 'text-rose-400' : 'text-slate-300'}>
                                  {trade.emotional_state}
                                </span>
                              </div>
                            )}
                            {trade.trade_quality && (
                              <div>
                                <span className="text-slate-500 text-[9px]">Setup:</span>{' '}
                                <span className="text-gold-vip font-bold">{trade.trade_quality}</span>
                              </div>
                            )}
                            {trade.execution_grade && (
                              <div>
                                <span className="text-slate-500 text-[9px]">Grade:</span>{' '}
                                <span className="text-slate-300">{trade.execution_grade}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Trade Parameters */}
                        <td className="p-4 text-slate-400">
                          {trade.initial_balance !== null && trade.initial_balance !== undefined ? (
                            <div className="space-y-0.5 text-[10px]">
                              <div>
                                <span className="text-slate-500 text-[9px]">Bal:</span> ${trade.initial_balance}
                              </div>
                              {trade.target && (
                                <div>
                                  <span className="text-slate-500 text-[9px]">Goal:</span> ${trade.target}
                                </div>
                              )}
                              {trade.percentage && (
                                <div>
                                  <span className="text-slate-500 text-[9px]">Return:</span> {trade.percentage}%
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-600">Legacy Price Logic</span>
                          )}
                        </td>

                        {/* Profit / Loss */}
                        <td className={`p-4 text-right font-bold font-mono text-xs ${isWin ? 'text-neon-green' : 'text-rose-500'}`}>
                          <div className="space-y-0.5">
                            <div>
                              {isWin ? '+' : ''}${Number(trade.profit_loss).toFixed(2)}
                            </div>
                            {trade.results && (
                              <div className="text-[8px] uppercase tracking-wider">
                                {trade.results === 'MTG Win' ? (
                                  <span className="px-1 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 font-bold">
                                    MTG WIN
                                  </span>
                                ) : trade.results === 'Win' ? (
                                  <span className="text-emerald-400 font-bold">WIN</span>
                                ) : (
                                  <span className="text-rose-400 font-bold">LOSS</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Chart */}
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

                        {/* Action buttons */}
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

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-rose-400" />
              <h3 className="text-sm font-bold font-mono text-slate-200">Delete Trade</h3>
            </div>
            <p className="text-xs font-mono text-slate-400 leading-relaxed">
              Are you sure you want to delete this trade record?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded text-xs font-mono font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Erase all step 1 confirmation */}
      {eraseAllStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-rose-400" />
              <h3 className="text-sm font-bold font-mono text-slate-200">Erase All Data</h3>
            </div>
            <p className="text-xs font-mono text-slate-400 leading-relaxed">
              WARNING: This will permanently delete ALL your trading journal records. This action cannot be undone. Do you want to proceed?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEraseAllStep(0)}
                className="px-4 py-2 rounded text-xs font-mono font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmEraseFirst}
                className="px-4 py-2 rounded text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Erase all step 2 final confirmation */}
      {eraseAllStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-2xl border-rose-500/50">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-rose-400" />
              <h3 className="text-sm font-bold font-mono text-slate-200">Final Confirmation</h3>
            </div>
            <p className="text-xs font-mono text-slate-400 leading-relaxed">
              Are you absolutely sure you want to delete everything? Click Confirm to permanently erase all your data.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEraseAllStep(0)}
                className="px-4 py-2 rounded text-xs font-mono font-bold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmEraseSecond}
                className="px-4 py-2 rounded text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 transition-all"
              >
                Confirm Erase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-slideIn">
          <div className={`p-4 rounded-xl border flex items-start gap-3 w-80 shadow-2xl ${
            notification.type === 'error'
              ? 'border-rose-500/30 bg-[#0a0303]'
              : 'border-neon-green/30 bg-[#030b17]'
          }`}>
            <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${notification.type === 'error' ? 'text-rose-400' : 'text-neon-green'}`} />
            <div className="space-y-1 font-mono text-xs">
              <div className={`font-bold uppercase ${notification.type === 'error' ? 'text-rose-300' : 'text-neon-green'}`}>
                {notification.type === 'error' ? 'ERROR' : 'SUCCESS'}
              </div>
              <div className="text-slate-400">{notification.message}</div>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="ml-auto text-slate-600 hover:text-slate-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
