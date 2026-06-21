'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Checks if the current user is authenticated and approved.
 */
async function checkUserApproved() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { approved: false, userId: null };

  const { data: profile } = await supabase
    .from('users')
    .select('status')
    .eq('id', user.id)
    .single();

  return {
    approved: profile?.status === 'approved',
    userId: user.id,
  };
}

/**
 * Fetches trades for the current user.
 */
export async function getTrades() {
  const { approved, userId } = await checkUserApproved();
  if (!approved || !userId) {
    return { success: false, error: 'Unauthorized. Approved account required.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('trade_date', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, trades: data || [] };
}

export interface TradeInput {
  asset: string;
  strategy: string;
  entry_price?: number | null;
  exit_price?: number | null;
  profit_loss: number;
  screenshot_url?: string;
  notes?: string;
  trade_date?: string;
  // new fields
  emotional_state?: string | null;
  trade_quality?: string | null;
  execution_grade?: string | null;
  session?: string | null;
  initial_balance?: number | null;
  target?: number | null;
  results?: string | null;
  percentage?: number | null;
}

/**
 * Adds a new trade record.
 */
export async function addTrade(trade: TradeInput) {
  const { approved, userId } = await checkUserApproved();
  if (!approved || !userId) {
    return { success: false, error: 'Unauthorized. Approved account required.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: userId,
      asset: trade.asset.toUpperCase().trim(),
      strategy: trade.strategy.trim(),
      entry_price: trade.entry_price !== undefined && trade.entry_price !== null ? Number(trade.entry_price) : null,
      exit_price: trade.exit_price !== undefined && trade.exit_price !== null ? Number(trade.exit_price) : null,
      profit_loss: Number(trade.profit_loss),
      screenshot_url: trade.screenshot_url || null,
      notes: trade.notes?.trim() || null,
      trade_date: trade.trade_date ? new Date(trade.trade_date).toISOString() : new Date().toISOString(),
      emotional_state: trade.emotional_state || null,
      trade_quality: trade.trade_quality || null,
      execution_grade: trade.execution_grade || null,
      session: trade.session || null,
      initial_balance: trade.initial_balance !== undefined && trade.initial_balance !== null ? Number(trade.initial_balance) : null,
      target: trade.target !== undefined && trade.target !== null ? Number(trade.target) : null,
      results: trade.results || null,
      percentage: trade.percentage !== undefined && trade.percentage !== null ? Number(trade.percentage) : null,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/journal');
  return { success: true, trade: data };
}

/**
 * Adds multiple trade records in a single batch query.
 */
export async function addMultipleTrades(tradesList: TradeInput[]) {
  const { approved, userId } = await checkUserApproved();
  if (!approved || !userId) {
    return { success: false, error: 'Unauthorized. Approved account required.' };
  }

  const supabase = await createClient();
  const insertData = tradesList.map(trade => ({
    user_id: userId,
    asset: trade.asset.toUpperCase().trim(),
    strategy: trade.strategy.trim(),
    entry_price: trade.entry_price !== undefined && trade.entry_price !== null ? Number(trade.entry_price) : null,
    exit_price: trade.exit_price !== undefined && trade.exit_price !== null ? Number(trade.exit_price) : null,
    profit_loss: Number(trade.profit_loss),
    screenshot_url: trade.screenshot_url || null,
    notes: trade.notes?.trim() || null,
    trade_date: trade.trade_date ? new Date(trade.trade_date).toISOString() : new Date().toISOString(),
    emotional_state: trade.emotional_state || null,
    trade_quality: trade.trade_quality || null,
    execution_grade: trade.execution_grade || null,
    session: trade.session || null,
    initial_balance: trade.initial_balance !== undefined && trade.initial_balance !== null ? Number(trade.initial_balance) : null,
    target: trade.target !== undefined && trade.target !== null ? Number(trade.target) : null,
    results: trade.results || null,
    percentage: trade.percentage !== undefined && trade.percentage !== null ? Number(trade.percentage) : null,
  }));

  const { data, error } = await supabase
    .from('trades')
    .insert(insertData)
    .select();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/journal');
  return { success: true, trades: data };
}

/**
 * Updates an existing trade record.
 */
export async function updateTrade(tradeId: string, trade: Partial<TradeInput>) {
  const { approved, userId } = await checkUserApproved();
  if (!approved || !userId) {
    return { success: false, error: 'Unauthorized. Approved account required.' };
  }

  const supabase = await createClient();
  const updateData: any = {};
  if (trade.asset !== undefined) updateData.asset = trade.asset.toUpperCase().trim();
  if (trade.strategy !== undefined) updateData.strategy = trade.strategy.trim();
  if (trade.entry_price !== undefined) updateData.entry_price = trade.entry_price !== null ? Number(trade.entry_price) : null;
  if (trade.exit_price !== undefined) updateData.exit_price = trade.exit_price !== null ? Number(trade.exit_price) : null;
  if (trade.profit_loss !== undefined) updateData.profit_loss = Number(trade.profit_loss);
  if (trade.screenshot_url !== undefined) updateData.screenshot_url = trade.screenshot_url || null;
  if (trade.notes !== undefined) updateData.notes = trade.notes?.trim() || null;
  if (trade.trade_date !== undefined) updateData.trade_date = new Date(trade.trade_date).toISOString();
  
  // new fields
  if (trade.emotional_state !== undefined) updateData.emotional_state = trade.emotional_state || null;
  if (trade.trade_quality !== undefined) updateData.trade_quality = trade.trade_quality || null;
  if (trade.execution_grade !== undefined) updateData.execution_grade = trade.execution_grade || null;
  if (trade.session !== undefined) updateData.session = trade.session || null;
  if (trade.initial_balance !== undefined) updateData.initial_balance = trade.initial_balance !== null ? Number(trade.initial_balance) : null;
  if (trade.target !== undefined) updateData.target = trade.target !== null ? Number(trade.target) : null;
  if (trade.results !== undefined) updateData.results = trade.results || null;
  if (trade.percentage !== undefined) updateData.percentage = trade.percentage !== null ? Number(trade.percentage) : null;

  const { data, error } = await supabase
    .from('trades')
    .update(updateData)
    .eq('id', tradeId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/journal');
  return { success: true, trade: data };
}

/**
 * Deletes an existing trade record.
 */
export async function deleteTrade(tradeId: string) {
  const { approved, userId } = await checkUserApproved();
  if (!approved || !userId) {
    return { success: false, error: 'Unauthorized. Approved account required.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('trades')
    .delete()
    .eq('id', tradeId)
    .eq('user_id', userId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/journal');
  return { success: true };
}

/**
 * Erases all trades recorded by the current user.
 */
export async function eraseTrades() {
  const { approved, userId } = await checkUserApproved();
  if (!approved || !userId) {
    return { success: false, error: 'Unauthorized. Approved account required.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('trades')
    .delete()
    .eq('user_id', userId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/journal');
  return { success: true };
}
