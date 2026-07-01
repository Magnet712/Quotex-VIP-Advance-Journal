'use server';

/**
 * Signal Mode Actions (Admin Only)
 *
 * Controls whether the signal engine uses simulated data or
 * a live OTC feed. Reads/writes the system_settings table.
 *
 * Only admin-authenticated users can change the mode.
 * All users can read the current mode (for display purposes).
 */

import { createClient }   from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SignalMode } from '@/lib/otc/types';

// ─── Admin check (reuses same pattern as existing admin.ts) ──────────────────
async function verifyAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: adminRecord } = await supabase
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    return !!adminRecord;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: getSignalMode
// Returns the current signal mode. Falls back to SIMULATION on any error.
// Safe to call from client components via server action.
// ─────────────────────────────────────────────────────────────────────────────
export async function getSignalMode(): Promise<{
  success: boolean;
  mode: SignalMode;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'signal_mode')
      .single();

    if (error || !data) {
      return { success: true, mode: 'SIMULATION' };
    }

    const mode = (data.value as SignalMode) ?? 'SIMULATION';
    return { success: true, mode };
  } catch (err: any) {
    // Default to safe simulation mode on any error
    return { success: false, mode: 'SIMULATION', error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION: setSignalMode
// Admin-only. Switches signal engine between SIMULATION and LIVE_OTC.
// When LIVE_OTC is selected and the live feed is unavailable, the
// data router in src/lib/otc/index.ts will automatically fallback
// to simulation and show "Data Source Offline" in the UI.
// ─────────────────────────────────────────────────────────────────────────────
export async function setSignalMode(mode: SignalMode): Promise<{
  success: boolean;
  error?: string;
}> {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  const modes = mode.split(',').map(m => m.trim()).filter(Boolean);
  const invalid = modes.some(m => m !== 'SIMULATION' && m !== 'LIVE_OTC' && m !== 'LIVE_MARKET');
  if (invalid || modes.length === 0) {
    return { success: false, error: 'Invalid signal mode selection.' };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('system_settings')
      .upsert({
        key:        'signal_mode',
        value:      mode,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[setSignalMode] Supabase error:', error.message);
      return { success: false, error: error.message };
    }

    // Revalidate admin + signals pages so mode change reflects immediately
    revalidatePath('/admin');
    revalidatePath('/dashboard/signals');

    return { success: true };
  } catch (err: any) {
    console.error('[setSignalMode] Unexpected error:', err);
    return { success: false, error: err.message };
  }
}
