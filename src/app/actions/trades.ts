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

interface TradeInput {
  asset: string;
  strategy: string;
  entry_price: number;
  exit_price: number;
  profit_loss: number;
  screenshot_url?: string;
  notes?: string;
  trade_date?: string;
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
      entry_price: Number(trade.entry_price),
      exit_price: Number(trade.exit_price),
      profit_loss: Number(trade.profit_loss),
      screenshot_url: trade.screenshot_url || null,
      notes: trade.notes?.trim() || null,
      trade_date: trade.trade_date ? new Date(trade.trade_date).toISOString() : new Date().toISOString(),
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
  if (trade.entry_price !== undefined) updateData.entry_price = Number(trade.entry_price);
  if (trade.exit_price !== undefined) updateData.exit_price = Number(trade.exit_price);
  if (trade.profit_loss !== undefined) updateData.profit_loss = Number(trade.profit_loss);
  if (trade.screenshot_url !== undefined) updateData.screenshot_url = trade.screenshot_url || null;
  if (trade.notes !== undefined) updateData.notes = trade.notes?.trim() || null;
  if (trade.trade_date !== undefined) updateData.trade_date = new Date(trade.trade_date).toISOString();

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
