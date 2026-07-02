'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { PaymentVerificationService } from '@/lib/payments/verification';

// ─── Interfaces ──────────────────────────────────────────────────────────────
export interface PlanSetting {
  id: string;
  name: string;
  price: number;
  currency: string;
  discount: number;
  enabled: boolean;
}

export interface WalletSetting {
  network: string;
  display_name: string;
  address: string;
  enabled: boolean;
}

// Helper: check if active user is approved
async function getAuthProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, user: null, profile: null };

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return { ok: profile?.status === 'approved', user, profile };
}

// Helper: check if user is admin
async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: admin } = await supabase
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  return !!admin;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: getBillingPlans
// ─────────────────────────────────────────────────────────────────────────────
export async function getBillingPlans() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('pricing_settings')
      .select('*')
      .order('price', { ascending: true });

    if (error) throw error;
    return { success: true, plans: data as PlanSetting[] };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch pricing plans' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: getWalletSettings
// ─────────────────────────────────────────────────────────────────────────────
export async function getWalletSettings() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('wallet_settings')
      .select('*')
      .eq('enabled', true);

    if (error) throw error;
    return { success: true, wallets: data as WalletSetting[] };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch wallets' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: updateBillingPlan
// ─────────────────────────────────────────────────────────────────────────────
export async function updateBillingPlan(id: string, price: number, enabled: boolean, discount: number) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) return { success: false, error: 'Unauthorized admin action' };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('pricing_settings')
      .update({ price, enabled, discount, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    revalidatePath('/dashboard/subscription');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: updateWalletAddress
// ─────────────────────────────────────────────────────────────────────────────
export async function updateWalletAddress(network: string, address: string, enabled: boolean) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) return { success: false, error: 'Unauthorized admin action' };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('wallet_settings')
      .update({ address, enabled, updated_at: new Date().toISOString() })
      .eq('network', network);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: createPaymentRequest
// ─────────────────────────────────────────────────────────────────────────────
export async function createPaymentRequest(planId: string, network: string) {
  const { ok, user } = await getAuthProfile();
  if (!ok || !user) return { success: false, error: 'Unauthorized trader status' };

  try {
    const supabase = await createClient();

    // 1. Fetch Plan price
    const { data: plan, error: planErr } = await supabase
      .from('pricing_settings')
      .select('*')
      .eq('id', planId)
      .single();

    if (planErr || !plan) throw new Error('Selected plan not found');
    if (!plan.enabled) throw new Error('Selected plan is currently inactive');

    // 2. Fetch Wallet config
    const { data: wallet, error: walletErr } = await supabase
      .from('wallet_settings')
      .select('*')
      .eq('network', network)
      .single();

    if (walletErr || !wallet) throw new Error('Selected network is not configured');
    if (!wallet.enabled) throw new Error('Selected network is disabled');

    // Apply discount
    const finalAmount = Math.max(0, plan.price - (plan.price * (plan.discount / 100)));

    // 3. Create payment request record
    const { data, error } = await supabase
      .from('payment_requests')
      .insert({
        user_id: user.id,
        plan_id: planId,
        amount: finalAmount,
        currency: 'USDT',
        network,
        wallet_address: wallet.address,
        status: 'PENDING',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour expiry
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, payment: data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: submitPaymentTxnHash (Auto Payment Verification & Auto-Activation)
// ─────────────────────────────────────────────────────────────────────────────
export async function submitPaymentTxnHash(paymentRequestId: string, txnHash: string) {
  const { ok, user } = await getAuthProfile();
  if (!ok || !user) return { success: false, error: 'Unauthorized trader status' };

  const hash = txnHash.trim();
  if (!hash || hash.length < 8) {
    return { success: false, error: 'Please enter a valid transaction hash.' };
  }

  try {
    const supabase = await createClient();
    const admin = await createAdminClient();

    // 1. Get payment request
    const { data: request, error: reqErr } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('id', paymentRequestId)
      .single();

    if (reqErr || !request) throw new Error('Payment request record not found');
    if (request.status === 'CONFIRMED') {
      return { success: true, alreadyConfirmed: true, message: 'This invoice has already been verified and activated.' };
    }

    // 2. Set to PROCESSING state
    await admin
      .from('payment_requests')
      .update({ txn_hash: hash, status: 'PROCESSING' })
      .eq('id', paymentRequestId);

    // 3. Verify via payment verification interface
    const verification = await PaymentVerificationService.verify(
      hash,
      request.network,
      request.amount,
      request.wallet_address
    );

    if (!verification.success || !verification.confirmed) {
      // Revert status to PENDING but store the hash attempt for logs review
      await admin
        .from('payment_requests')
        .update({ txn_hash: hash, status: 'PENDING' })
        .eq('id', paymentRequestId);

      return {
        success: false,
        error: verification.error || 'Transaction verification failed. Ensure hash is correct.',
      };
    }

    // 4. Save to IMMUTABLE audit log (unique constraint on txn_hash prevents double activations!)
    const { error: auditError } = await admin
      .from('payment_audit_logs')
      .insert({
        payment_request_id: paymentRequestId,
        user_id: user.id,
        txn_hash: hash,
        network: request.network,
        amount: request.amount,
        status: 'CONFIRMED',
        verification_source: 'MockProvider',
        confirmed_at: new Date().toISOString(),
      });

    if (auditError) {
      if (auditError.message.includes('unique') || auditError.code === '23505') {
        throw new Error('This transaction hash has already been claimed and activated.');
      }
      throw auditError;
    }

    // 5. Update payment request status
    await admin
      .from('payment_requests')
      .update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() })
      .eq('id', paymentRequestId);

    // 6. Activate Subscription
    const actRes = await activateSubscription(user.id, request.plan_id);
    if (!actRes.success) throw new Error(actRes.error || 'Failed to activate plan subscription');

    // 7. Add notification alert
    await admin.from('notification_logs').insert({
      user_id: user.id,
      title: 'Payment Confirmed',
      message: `Your payment for ${request.plan_id.replace('_', ' ').toUpperCase()} was verified automatically. Premium activated!`,
    });

    revalidatePath('/dashboard/subscription');
    revalidatePath('/dashboard/payments');
    return { success: true };

  } catch (err: any) {
    return { success: false, error: err.message || 'Verification pipeline error' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: activateSubscription (Idempotent subscription binder)
// ─────────────────────────────────────────────────────────────────────────────
async function activateSubscription(userId: string, planId: string) {
  const admin = await createAdminClient();

  try {
    // 1. Calculate expiry dates
    let expiry: Date | null = new Date();
    if (planId === 'premium_monthly') {
      expiry.setDate(expiry.getDate() + 30);
    } else if (planId === 'premium_6months') {
      expiry.setDate(expiry.getDate() + 180);
    } else if (planId === 'premium_lifetime') {
      expiry = null; // Lifetime access
    } else {
      expiry = null;
    }

    const expiresAtStr = expiry ? expiry.toISOString() : null;

    // 2. Mark any existing active user subscriptions as EXPIRED/CANCELLED
    await admin
      .from('subscriptions')
      .update({ status: 'CANCELLED' })
      .eq('user_id', userId)
      .eq('status', 'ACTIVE');

    // 3. Insert new subscription schedule
    await admin
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_id: planId,
        status: 'ACTIVE',
        activated_at: new Date().toISOString(),
        expires_at: expiresAtStr,
      });

    // 4. Upgrade user's premium_access boolean inside public.users
    await admin
      .from('users')
      .update({ premium_access: true })
      .eq('id', userId);

    // 5. Add subscription audit log
    await admin
      .from('subscription_logs')
      .insert({
        user_id: userId,
        plan_id: planId,
        action: 'ACTIVATED',
        details: `Activated plan ${planId} expiring on ${expiresAtStr || 'NEVER'}`,
      });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: getUserSubscriptionState
// ─────────────────────────────────────────────────────────────────────────────
export async function getUserSubscriptionState() {
  const { ok, user, profile } = await getAuthProfile();
  if (!ok || !user) return { success: false, error: 'Unauthorized trader status' };

  try {
    const supabase = await createClient();
    
    // Check and expire active plan first (self-healing hook)
    await checkAndExpireSubscriptions(user.id);

    // Fetch active subscription
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    let remainingDays = 0;
    if (sub && sub.expires_at) {
      const diff = new Date(sub.expires_at).getTime() - Date.now();
      remainingDays = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    return {
      success: true,
      hasActiveSubscription: !!sub,
      subscription: sub,
      remainingDays,
      traderProfile: profile
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: checkAndExpireSubscriptions (Auto Expiration Cleaner hook)
// ─────────────────────────────────────────────────────────────────────────────
export async function checkAndExpireSubscriptions(userId: string) {
  const admin = await createAdminClient();

  try {
    // Find active subscription that has expired
    const { data: expiredSub } = await admin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .lt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (expiredSub) {
      // 1. Set subscription status to EXPIRED
      await admin
        .from('subscriptions')
        .update({ status: 'EXPIRED' })
        .eq('id', expiredSub.id);

      // 2. Revoke premium_access in users table
      await admin
        .from('users')
        .update({ premium_access: false })
        .eq('id', userId);

      // 3. Add to logs
      await admin
        .from('subscription_logs')
        .insert({
          user_id: userId,
          plan_id: expiredSub.plan_id,
          action: 'EXPIRED',
          details: `Subscription expired automatically. Activated at ${expiredSub.activated_at}`,
        });

      // 4. Log alert
      await admin.from('notification_logs').insert({
        user_id: userId,
        title: 'Membership Expired',
        message: `Your premium membership for plan ${expiredSub.plan_id.replace('_', ' ').toUpperCase()} has expired.`,
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('[Subscription Expire Hook Error]:', err);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: getUserPayments (History list for dashboard payments page)
// ─────────────────────────────────────────────────────────────────────────────
export async function getUserPayments(page = 1, pageSize = 20) {
  const { ok, user } = await getAuthProfile();
  if (!ok || !user) return { success: false, error: 'Unauthorized trader status' };

  try {
    const supabase = await createClient();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from('payment_requests')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return { success: true, payments: data, total: count || 0 };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: getUserNotifications & markNotificationsRead
// ─────────────────────────────────────────────────────────────────────────────
export async function getUserNotifications() {
  const { ok, user } = await getAuthProfile();
  if (!ok || !user) return { success: false, notifications: [] };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('notification_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return { success: true, notifications: data };
  } catch (err: any) {
    return { success: false, notifications: [] };
  }
}

export async function markNotificationsRead() {
  const { ok, user } = await getAuthProfile();
  if (!ok || !user) return { success: false };

  try {
    const supabase = await createClient();
    await supabase
      .from('notification_logs')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    return { success: true };
  } catch (err: any) {
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: getSaaSStatistics (For Admin panel)
// ─────────────────────────────────────────────────────────────────────────────
export async function getSaaSStatistics() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) return { success: false, error: 'Unauthorized' };

  try {
    const supabase = await createClient();
    
    // Concurrently fetch stats count
    const [usersRes, paymentsRes] = await Promise.all([
      supabase.from('users').select('vip_access, premium_access'),
      supabase.from('payment_requests').select('status, amount')
    ]);

    const users = usersRes.data || [];
    const payments = paymentsRes.data || [];

    const freeCount = users.filter(u => !u.vip_access && !u.premium_access).length;
    const vipCount = users.filter(u => u.vip_access).length;
    const premiumCount = users.filter(u => u.premium_access).length;

    const pendingCount = payments.filter(p => p.status === 'PENDING' || p.status === 'PROCESSING').length;
    const successPayments = payments.filter(p => p.status === 'CONFIRMED');
    const successCount = successPayments.length;

    const totalRevenue = successPayments.reduce((acc, curr) => acc + Number(curr.amount), 0);
    
    // Estimate monthly revenue (confirmed in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { data: monthlyPayments } = await supabase
      .from('payment_requests')
      .select('amount')
      .eq('status', 'CONFIRMED')
      .gte('confirmed_at', thirtyDaysAgo.toISOString());
    
    const monthlyRevenue = (monthlyPayments || []).reduce((acc, curr) => acc + Number(curr.amount), 0);

    const conversionRate = users.length > 0 ? Number(((premiumCount / users.length) * 100).toFixed(1)) : 0;

    return {
      success: true,
      stats: {
        totalRevenue,
        monthlyRevenue,
        premiumCount,
        vipCount,
        freeCount,
        pendingCount,
        successCount,
        conversionRate
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: getAdminPaymentsLedger (For Admin list auditing)
// ─────────────────────────────────────────────────────────────────────────────
export async function getAdminPaymentsLedger(filters: { status?: string; searchQuery?: string; page?: number } = {}) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) return { success: false, error: 'Unauthorized', payments: [], total: 0 };

  try {
    const supabase = await createClient();
    const page = filters.page || 1;
    const pageSize = 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('payment_requests')
      .select('*, users!inner(username, trader_id)', { count: 'exact' });

    if (filters.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }

    if (filters.searchQuery) {
      const q = `%${filters.searchQuery}%`;
      query = query.or(`txn_hash.ilike.${q},wallet_address.ilike.${q},users.username.ilike.${q},users.trader_id.ilike.${q}`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return { success: true, payments: data || [], total: count || 0 };
  } catch (err: any) {
    return { success: false, error: err.message, payments: [], total: 0 };
  }
}
