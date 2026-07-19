'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

/**
 * Helper to check if the current user is an admin.
 */
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

/**
 * Fetches a single feature flag status from the system_settings table.
 * Fallbacks to defaultValue if the setting does not exist in the database.
 * Safe to run for public landing page visitor checking.
 */
export async function getFeatureFlag(key: string, defaultValue = true): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', `feature_flag_${key}`)
      .single();

    if (error || !data) {
      return defaultValue;
    }

    return data.value === 'true' || data.value === 'ON' || data.value === '1';
  } catch {
    return defaultValue;
  }
}

/**
 * Admin Only: Sets a feature flag state.
 */
export async function setFeatureFlag(key: string, value: boolean): Promise<{ success: boolean; error?: string }> {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('system_settings')
      .upsert({
        key: `feature_flag_${key}`,
        value: value ? 'true' : 'false',
        updated_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }

    revalidatePath('/admin');
    revalidatePath('/dashboard');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Fetches all feature flags from system_settings for display/admin listing.
 */
export async function getAllFeatureFlags(): Promise<{ success: boolean; flags: Record<string, boolean>; error?: string }> {
  if (!(await verifyAdmin())) {
    return { success: false, flags: {}, error: 'Unauthorized. Admin access required.' };
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value')
      .like('key', 'feature_flag_%');

    if (error) {
      throw error;
    }

    const flags: Record<string, boolean> = {};
    const defaultFlags: Record<string, boolean> = {
      premium_signals: true,
      ai_review: true,
      checklists: true,
      pricing_page: true
    };

    (data ?? []).forEach(row => {
      const name = row.key.replace('feature_flag_', '');
      flags[name] = row.value === 'true' || row.value === 'ON' || row.value === '1';
    });

    // Merge defaults
    Object.keys(defaultFlags).forEach(key => {
      if (flags[key] === undefined) {
        flags[key] = defaultFlags[key];
      }
    });

    return { success: true, flags };
  } catch (err: any) {
    return { success: false, flags: {}, error: err.message };
  }
}
