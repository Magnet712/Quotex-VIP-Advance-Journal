'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getUserAccessState } from '@/app/actions/admin_optimization';
import { canAccess } from '@/lib/permissions';
import LockedFeature from '@/components/LockedFeature';
import { 
  ListTodo, CheckSquare, Plus, Trash2, ShieldCheck, 
  Activity, Award, Sparkles, AlertTriangle, Play, HelpCircle
} from 'lucide-react';

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

const DEFAULT_RULES = [
  { id: 'rule-1', text: '📈 Market Structure Confirmed: Is the market clearly trending or ranging without random spikes?', checked: false },
  { id: 'rule-2', text: '🕯 Strong Candle Confirmation: Did the current candle close with strong momentum?', checked: false },
  { id: 'rule-3', text: '🎯 Entry at Key Zone: Is the entry happening near a support, resistance, rejection zone, or liquidity area?', checked: false },
  { id: 'rule-4', text: '⏰ No High Impact News: Is there no important economic news likely to create sudden volatility?', checked: false },
  { id: 'rule-5', text: '📊 Strategy Rules Confirmed: Does this trade meet every rule of my trading strategy?', checked: false },
  { id: 'rule-6', text: '🧠 Emotional Control: Am I calm and trading according to my plan? Not because of fear or revenge.', checked: false },
  { id: 'rule-7', text: '💰 Risk Management: Is this trade within my daily risk limit?', checked: false },
  { id: 'rule-8', text: '⏳ Perfect Timing: Is this the correct candle and expiration timing?', checked: false }
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
  
  // Session-based discipline counters (State only, no DB writes)
  const [tradesAvoided, setTradesAvoided] = useState(0);
  const [safeDecisions, setSafeDecisions] = useState(0);
  const [badEntriesPrevented, setBadEntriesPrevented] = useState(0);

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
        const stored = localStorage.getItem('binary_checklist_items');
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
    localStorage.setItem('binary_checklist_items', JSON.stringify(newItems));
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
    if (confirm('Restore default binary trading rules? Custom rules will be erased.')) {
      saveItems(DEFAULT_RULES);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Activity className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">SYNCHRONIZING DISCIPLINE MATRIX...</span>
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

  const totalCount = items.length;
  const checkedCount = items.filter(i => i.checked).length;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  // Wording / Title splitter helper for checklist rendering
  const parseRuleText = (text: string) => {
    const parts = text.split(':');
    if (parts.length > 1) {
      return { title: parts[0].trim(), question: parts[1].trim() };
    }
    return { title: 'Rule', question: text };
  };

  // Trade Confidence Score calculation
  const getConfidenceLevel = () => {
    if (progressPercent >= 100) return { score: '100%', label: 'Excellent Setup', color: 'text-emerald-400' };
    if (progressPercent >= 85) return { score: '88%', label: 'Very Good', color: 'text-emerald-400' };
    if (progressPercent >= 75) return { score: '75%', label: 'Acceptable', color: 'text-gold-vip' };
    if (progressPercent >= 60) return { score: '63%', label: 'Weak Setup', color: 'text-rose-400' };
    return { score: 'Below 60%', label: 'Avoid Trade', color: 'text-rose-500 font-bold' };
  };

  const confidence = getConfidenceLevel();

  // Trade Decision outputs
  const getTradeDecision = () => {
    if (progressPercent >= 100) {
      return {
        status: 'READY TO TRADE',
        desc: 'All required confirmations satisfied. Proceed according to your execution parameters.',
        color: 'text-emerald-400 border-emerald-500/20 bg-emerald-950/5',
        dot: '🟢'
      };
    }
    if (progressPercent >= 75) {
      return {
        status: 'WAIT',
        desc: 'One or more key validations are missing. Review invalid criteria before clicking entry.',
        color: 'text-gold-vip border-gold-vip/20 bg-gold-vip/5',
        dot: '🟡'
      };
    }
    return {
      status: 'DO NOT ENTER',
      desc: 'Sizing setup is incomplete. Halt and wait for verified market conditions.',
      color: 'text-rose-500 border-rose-500/20 bg-rose-950/5',
      dot: '🔴'
    };
  };

  const decision = getTradeDecision();

  // Trader Discipline Score Grade
  const getDisciplineGrade = () => {
    if (progressPercent === 100) return 'A+';
    if (progressPercent >= 85) return 'A';
    if (progressPercent >= 70) return 'B';
    if (progressPercent >= 50) return 'C';
    return 'D';
  };

  // AI Discipline Reminders
  const getAIReminders = () => {
    const reminders = [];
    const isChecked = (id: string) => {
      const item = items.find(i => i.id === id);
      return item ? item.checked : false;
    };

    if (!isChecked('rule-6')) reminders.push("Never trade emotionally. Close the terminal if frustrations rise.");
    if (!isChecked('rule-7')) reminders.push("Protect capital before chasing profits. Enforce your daily risk limits.");
    if (!isChecked('rule-8')) reminders.push("Waiting is a position. Expirations require exact boundary timings.");
    if (!isChecked('rule-5')) reminders.push("No setup = No trade. Stick strictly to strategy entry rules.");
    if (!isChecked('rule-4')) reminders.push("Avoid unpredictable volatility. High-impact news destroys technical setups.");

    return reminders;
  };

  const aiReminders = getAIReminders();

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-5xl mx-auto animate-fadeIn text-left">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
        <div>
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">discipline filter</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Trading Checklist</h1>
        </div>
        <div className="flex items-center gap-2 font-mono">
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

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: Progress Bar & Items List */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Binary Trade Readiness Progress Card */}
          <div className="glass-panel p-5 rounded-xl border border-glass-border bg-slate-900/10 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500 uppercase tracking-widest text-[9px] font-bold">Binary Trade Readiness</span>
              <span className="text-neon-green font-bold">{progressPercent}% ({checkedCount} / {totalCount} Completed)</span>
            </div>
            <div className="w-full bg-slate-950 border border-slate-900 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-neon-green h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Checklist Items List */}
          <div className="space-y-3.5">
            {items.map((item) => {
              const rule = parseRuleText(item.text);
              return (
                <div 
                  key={item.id} 
                  className={`p-4 rounded-xl border flex items-start gap-4 transition-all ${
                    item.checked 
                      ? 'bg-emerald-950/10 border-emerald-500/25 text-slate-300' 
                      : 'bg-slate-900/10 border-glass-border text-slate-400 hover:border-glass-border/75'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => handleToggle(item.id)}
                    className="mt-0.5 h-4 w-4 rounded bg-slate-950 border-glass-border text-neon-green focus:ring-0 cursor-pointer shrink-0"
                  />
                  <div className="flex-1 space-y-1">
                    <strong className={`text-xs font-mono block ${item.checked ? 'line-through text-slate-500 font-normal' : 'text-slate-200'}`}>
                      {rule.title}
                    </strong>
                    <span className={`text-[11px] leading-relaxed block ${item.checked ? 'line-through text-slate-600' : 'text-slate-400'}`}>
                      {rule.question}
                    </span>
                  </div>
                  {item.id.startsWith('custom-') && (
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="text-slate-600 hover:text-rose-500 transition-colors ml-2 self-center"
                      title="Delete rule"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  )}
                </div>
              );
            })}

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
              placeholder="e.g. Wait for Order Flow confirmation..."
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              className="flex-1 bg-[#02050b] border border-glass-border px-3.5 py-2.5 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-neon-green/30"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded bg-neon-green text-slate-950 font-bold hover:bg-neon-green-hover text-xs uppercase tracking-wider transition-colors flex items-center gap-1 shrink-0"
            >
              <Plus className="h-4 w-4" /> Add Rule
            </button>
          </form>

        </div>

        {/* Right Column: Decision Cards */}
        <div className="space-y-6">
          
          {/* Trade Decision Card */}
          <div className={`p-5 rounded-xl border font-mono space-y-4 ${decision.color}`}>
            <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
              <span className="text-[9px] uppercase tracking-widest font-bold font-mono">Trade Decision</span>
              <span className="text-xs font-bold font-mono uppercase">{decision.dot} {decision.status}</span>
            </div>
            
            <p className="text-xs leading-relaxed text-slate-300 font-sans">
              {decision.desc}
            </p>

            {/* Trade Confidence Score */}
            <div className="pt-2 flex justify-between items-center text-[10px] border-t border-white/5 text-slate-400 font-mono">
              <span>Setup Confidence:</span>
              <span className={`font-bold ${confidence.color}`}>{confidence.score} ({confidence.label})</span>
            </div>
          </div>

          {/* Trader Discipline Score Card */}
          <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Discipline Score</span>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">
                {progressPercent}%
              </span>
            </div>
            
            <div className="flex items-center justify-between pt-1">
              <div className="text-left font-mono">
                <span className="text-[9px] text-slate-500 block uppercase">Session Grade</span>
                <h4 className="text-xl font-bold text-slate-200 glow-text-gold">Grade {getDisciplineGrade()}</h4>
              </div>
              <Award className="h-8 w-8 text-gold-vip" />
            </div>
          </div>

          {/* AI Discipline Reminders Card */}
          {aiReminders.length > 0 && (
            <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-3.5">
              <div className="flex items-center gap-1.5 text-rose-500 font-mono text-[10px] uppercase border-b border-slate-900 pb-2">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                <span>Discipline Warnings</span>
              </div>
              <ul className="space-y-2 text-[11px] text-slate-400 font-sans leading-relaxed text-left">
                {aiReminders.map((rem, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="text-rose-500">•</span>
                    <span>{rem}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Session Discipline Counters Card */}
          <div className="glass-panel p-5 rounded-xl border border-glass-border space-y-4 font-mono text-xs">
            <div className="flex items-center gap-1.5 border-b border-slate-900 pb-2.5">
              <Activity className="h-4 w-4 text-neon-green" />
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Discipline Counter</span>
            </div>

            <div className="space-y-3 font-sans">
              {[
                { label: 'Trades Avoided Today', count: tradesAvoided, set: setTradesAvoided },
                { label: 'Safe Decisions Today', count: safeDecisions, set: setSafeDecisions },
                { label: 'Bad Entries Prevented', count: badEntriesPrevented, set: setBadEntriesPrevented }
              ].map((c, i) => (
                <div key={i} className="flex justify-between items-center bg-[#020617]/50 border border-slate-900/60 p-2 rounded">
                  <div className="text-left font-mono">
                    <span className="text-[10px] text-slate-300 block">{c.label}</span>
                    <span className="text-sm font-bold text-slate-200 mt-0.5 block">{c.count}</span>
                  </div>
                  <button
                    onClick={() => c.set(prev => prev + 1)}
                    className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-glass-border text-[10px] font-mono text-neon-green transition-all"
                  >
                    + Log
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Checklist complete warning banner */}
      {progressPercent === 100 && items.length > 0 && (
        <div className="p-4 bg-emerald-950/15 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-2.5 font-mono text-[10px] uppercase justify-center shadow-[0_0_15px_rgba(16,185,129,0.08)] animate-pulse">
          <ShieldCheck className="h-4.5 w-4.5 text-emerald-500 animate-spin" />
          <span>Checklist Complete — Ready for disciplined execution.</span>
        </div>
      )}

      {/* Professional Trading Principles Section */}
      <div className="space-y-4 pt-4 border-t border-glass-border/30">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-neon-green" />
          <h2 className="text-sm font-bold font-mono uppercase tracking-widest text-slate-200">
            Professional Trading Principles
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-mono text-slate-400">
          {[
            "Quality over quantity",
            "One good trade is enough",
            "Never revenge trade",
            "Capital preservation comes first",
            "Missing a trade is better than forcing one",
            "Discipline creates consistency"
          ].map((item, idx) => (
            <div key={idx} className="glass-panel p-3.5 rounded border border-glass-border/60 text-left flex gap-2 items-center">
              <span className="text-neon-green text-sm">✓</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
