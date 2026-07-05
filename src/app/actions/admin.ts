'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Helper to ensure the current authenticated user has admin privileges.
 */
async function verifyAdmin() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    const { data: adminRecord, error } = await supabase
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
 * Fetches all user profiles.
 */
export async function getAllUsers() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, users: data || [] };
}

/**
 * Updates a user profile status (e.g. approve, reject, disable).
 */
export async function updateUserStatus(userId: string, status: 'pending' | 'approved' | 'rejected') {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('users')
    .update({ status })
    .eq('id', userId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  return { success: true };
}

/**
 * Toggles a user's VIP access flag.
 */
export async function toggleVipAccess(userId: string, vipAccess: boolean) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('users')
    .update({ vip_access: vipAccess })
    .eq('id', userId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  return { success: true };
}

/**
 * Toggles a user's Premium access flag.
 */
export async function togglePremiumAccess(userId: string, premiumAccess: boolean) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('users')
    .update({ premium_access: premiumAccess })
    .eq('id', userId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/admin');
  return { success: true };
}

/**
 * Resets a user's password directly using the Supabase Admin client.
 */
export async function resetUserPassword(userId: string, newPassword: string) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }

  try {
    const adminClient = createAdminClient();
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Password reset error:', err);
    return { success: false, error: err.message || 'Failed to reset password.' };
  }
}

/**
 * Fetches dashboard statistics for the admin dashboard.
 */
export async function getAdminStats() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  const supabase = await createClient();

  // Fetch counts from DB
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('status, vip_access');

  if (usersError || !users) {
    return { success: false, error: usersError?.message || 'Failed to fetch user metrics.' };
  }

  const totalUsers = users.length;
  const pendingUsers = users.filter((u) => u.status === 'pending').length;
  const approvedUsers = users.filter((u) => u.status === 'approved').length;
  const vipUsers = users.filter((u) => u.vip_access).length;

  // Fetch total trades count
  const { count: totalTrades, error: tradesError } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true });

  return {
    success: true,
    stats: {
      totalUsers,
      pendingUsers,
      approvedUsers,
      vipUsers,
      totalTrades: totalTrades || 0,
    },
  };
}

/**
 * Fetches referral tracking summary for the admin dashboard.
 */
export async function getAdminReferralsLedger() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  try {
    const supabase = await createClient();
    
    // Fetch all users with referred_by_trader_id
    const { data: users, error } = await supabase
      .from('users')
      .select('id, trader_id, username, status, referred_by_trader_id, created_at');

    if (error) throw error;

    // Aggregate referrals by referrer in memory
    const referrersMap: Record<string, {
      trader_id: string;
      username: string;
      total: number;
      approved: number;
      pending: number;
      referredUsers: any[];
    }> = {};

    // First populate referrers mapping
    users.forEach(u => {
      if (u.trader_id) {
        referrersMap[u.trader_id] = {
          trader_id: u.trader_id,
          username: u.username || 'N/A',
          total: 0,
          approved: 0,
          pending: 0,
          referredUsers: []
        };
      }
    });

    // Count referrals
    users.forEach(u => {
      const referrerId = u.referred_by_trader_id;
      if (referrerId && referrersMap[referrerId]) {
        referrersMap[referrerId].total++;
        if (u.status === 'approved') {
          referrersMap[referrerId].approved++;
        } else if (u.status === 'pending') {
          referrersMap[referrerId].pending++;
        }
        referrersMap[referrerId].referredUsers.push({
          id: u.id,
          trader_id: u.trader_id,
          username: u.username,
          status: u.status,
          created_at: u.created_at
        });
      }
    });

    // Convert map to array and filter out users who have zero referrals
    const referralsLedger = Object.values(referrersMap)
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);

    return { success: true, ledger: referralsLedger };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Manually updates/corrects a user's referred_by_trader_id.
 */
export async function updateUserReferrer(userId: string, referrerTraderId: string | null) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized. Admin access required.' };
  }

  try {
    const supabase = await createClient();

    // If setting a referrer, validate that the referrerTraderId exists in users
    if (referrerTraderId) {
      const { data: refUser } = await supabase
        .from('users')
        .select('trader_id')
        .eq('trader_id', referrerTraderId.trim())
        .maybeSingle();

      if (!refUser) {
        return { success: false, error: 'Referrer Trader ID does not exist in users database.' };
      }
    }

    const { error } = await supabase
      .from('users')
      .update({ referred_by_trader_id: referrerTraderId ? referrerTraderId.trim() : null })
      .eq('id', userId);

    if (error) throw error;

    revalidatePath('/admin');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
