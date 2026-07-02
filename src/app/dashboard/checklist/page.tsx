'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';
import { ListTodo, CheckSquare, Plus, Trash2, ShieldCheck, Activity, Award } from 'lucide-react';

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

const DEFAULT_RULES = [
  { id: 'rule-1', text: 'Trend Alignment: Is this trade aligned with the major High Timeframe (HTF) trend?', checked: false },
  { id: 'rule-2', text: 'Key Levels: Are we entry-pointing near a validated Support / Resistance or key zone?', checked: false },
  { id: 'rule-3', text: 'Risk Reward: Is the reward size at least twice the stop size (Minimum 1:2 R:R ratio)?', checked: false },
  { id: 'rule-4', text: 'Economic Calendar: Are there high-impact news releases scheduled within 30 minutes?', checked: false },
  { id: 'rule-5', text: 'Technical Confluence: Do we have at least two independent indicators confirming entry?', checked: false },
  { id: 'rule-6', text: 'Emotional Sanity: Are you calm, relaxed, and strictly following rules (No revenge trading)?', checked: false }
];

export default function ChecklistPage() {
  const [loading, setLoading] = useState(true);
  const [userAccess, setUserAccess] = useState<any>({
    vipAccess: false,
    premiumAccess: false,
    status: 'pending'
  });

  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      try {
        const accessRes = await getUserAccessState();
        if (accessRes.success) {
          setUserAccess({
            vipAccess: accessRes.vipAccess,
            premiumAccess: accessRes.premiumAccess,
            status: accessRes.status
          });
        }

        // Load checklist from localStorage
        const stored = localStorage.getItem('trader_checklist_items');
        if (stored) {
          setItems(JSON.parse(stored));
        } else {
          setItems(DEFAULT_RULES);
        }

      } catch (err) {
        console.error('Failed to load checklist page dependencies:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const saveItems = (newItems: ChecklistItem[]) => {
    setItems(newItems);
    localStorage.setItem('trader_checklist_items', JSON.stringify(newItems));
  };

  const handleToggle = (id: string) => {
    const updated = items.map(item => 
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    saveItems(updated);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim()) return;

    const newItem: ChecklistItem = {
      id: `custom-${Date.now()}`,
      text: newItemText.trim(),
      checked: false
    };

    saveItems([...items, newItem]);
    setNewItemText('');
  };

  const handleDeleteItem = (id: string) => {
    const updated = items.filter(item => item.id !== id);
    saveItems(updated);
  };

  const handleResetCheckboxes = () => {
    const updated = items.map(item => ({ ...item, checked: false }));
    saveItems(updated);
  };

  const handleRestoreDefaults = () => {
    if (confirm('Restore default trading rules? Custom rules will be erased.')) {
      saveItems(DEFAULT_RULES);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Activity className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">SYNCHRONIZING CHECKLIST...</span>
      </div>
    );
  }

  const profile = {
    vip_access: userAccess.vipAccess,
    premium_access: userAccess.premiumAccess,
    status: userAccess.status
  };

  if (!canAccess('checklist', profile)) {
    return <LockedFeature feature="checklist" />;
  }

  const checkedCount = items.filter(i => i.checked).length;
  const progressPercent = items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-3xl mx-auto animate-fadeIn text-left">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
        <div>
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">discipline filter</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Trading Checklist</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetCheckboxes}
            className="px-3.5 py-2 rounded border border-glass-border bg-slate-900/60 hover:bg-slate-800 text-xs font-mono font-bold text-slate-300 uppercase transition-all"
          >
            Clear Checks
          </button>
          <button
            onClick={handleRestoreDefaults}
            className="px-3.5 py-2 rounded border border-glass-border bg-slate-900/20 text-xs font-mono font-bold text-slate-500 hover:text-slate-400 uppercase transition-all"
            title="Restore Defaults"
          >
            Defaults
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="glass-panel p-5 rounded-xl border border-glass-border bg-slate-900/10 space-y-3">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-500 uppercase">Pre-Trade Verification Progress</span>
          <span className="text-neon-green font-bold">{progressPercent}% ({checkedCount} / {items.length} Checked)</span>
        </div>
        <div className="w-full bg-slate-950 border border-glass-border/30 h-2.5 rounded-full overflow-hidden p-0.5">
          <div 
            className="bg-gradient-to-r from-emerald-500 to-neon-green h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-3.5">
        {items.map((item) => (
          <div 
            key={item.id} 
            className={`p-4 rounded-xl border flex items-start gap-3.5 transition-all ${
              item.checked 
                ? 'bg-emerald-950/10 border-emerald-500/25 text-slate-300' 
                : 'bg-slate-900/10 border-glass-border text-slate-400 hover:border-glass-border/75'
            }`}
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => handleToggle(item.id)}
              className="mt-1 h-4 w-4 rounded bg-slate-950 border-glass-border text-neon-green focus:ring-0 cursor-pointer shrink-0"
            />
            <span className={`text-xs leading-relaxed flex-1 ${item.checked ? 'line-through text-slate-500' : 'text-slate-300'}`}>
              {item.text}
            </span>
            {item.id.startsWith('custom-') && (
              <button
                onClick={() => handleDeleteItem(item.id)}
                className="text-slate-600 hover:text-rose-500 transition-colors ml-2"
                title="Delete rule"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {items.length === 0 && (
          <div className="p-8 text-center text-slate-500 font-mono text-xs border border-dashed border-glass-border rounded-xl">
            No pre-trade checks defined. Add custom rules below.
          </div>
        )}
      </div>

      {/* Add Custom Rule Form */}
      <form onSubmit={handleAddItem} className="flex gap-2 font-mono">
        <input
          type="text"
          required
          placeholder="Define new trading rule rule..."
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          className="flex-1 bg-[#02050b] border border-glass-border px-3.5 py-2.5 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/30"
        />
        <button
          type="submit"
          className="px-4 py-2.5 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-xs uppercase tracking-wider transition-colors flex items-center gap-1"
        >
          <Plus className="h-4 w-4" /> Add Rule
        </button>
      </form>

      {/* Verification Shield banner */}
      {progressPercent === 100 && items.length > 0 && (
        <div className="p-4 bg-emerald-950/15 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-2.5 font-mono text-[10px] uppercase justify-center shadow-[0_0_15px_rgba(16,185,129,0.08)] animate-pulse">
          <ShieldCheck className="h-4.5 w-4.5 text-emerald-500" />
          <span>All checks passed successfully. Strategy execution verified. Proceed to trade.</span>
        </div>
      )}

    </div>
  );
}
