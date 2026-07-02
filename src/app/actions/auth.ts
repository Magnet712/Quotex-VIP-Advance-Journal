'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

/**
 * Maps a Trader ID to a virtual email address for Supabase Auth.
 */
function getVirtualEmail(traderId: string): string {
  const cleanId = traderId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `${cleanId}@quotex-journal.local`;
}

/**
 * Registers a new trader.
 * Creates an auth user with a virtual email, then inserts their profile with 'pending' status.
 */
export async function registerTrader(traderId: string, username: string, password: string) {
  try {
    if (!traderId || !username || !password) {
      return { success: false, error: 'All fields are required.' };
    }

    if (traderId.length < 4) {
      return { success: false, error: 'Trader ID must be at least 4 characters.' };
    }

    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    const email = getVirtualEmail(traderId);
    const supabase = await createClient();
    const adminClient = createAdminClient();

    // 1. Create the user using the admin client (bypasses signup restrictions)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        trader_id: traderId,
        username: username,
      },
    });

    if (authError) {
      // Check if user already exists
      if (
        authError.message.includes('already registered') ||
        authError.message.includes('email_exists') ||
        authError.message.includes('already exists')
      ) {
        return { success: false, error: 'This Trader ID is already registered.' };
      }
      return { success: false, error: authError.message };
    }

    const user = authData.user;
    if (!user) {
      return { success: false, error: 'Registration failed. Please try again.' };
    }

    // 2. Insert into public.users profile using admin client (bypasses RLS before login)
    const { error: profileError } = await adminClient
      .from('users')
      .insert({
        id: user.id,
        trader_id: traderId.trim(),
        username: username.trim(),
        status: 'pending',
        vip_access: false,
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // We attempt to clean up the auth user since profile insertion failed
      await adminClient.auth.admin.deleteUser(user.id);
      return { success: false, error: 'Failed to create user profile. Please try again.' };
    }

    // 3. Log the user in to establish the session cookies
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      console.error('Auto-login error after registration:', loginError);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Register error:', err);
    return { success: false, error: err.message || 'An unexpected error occurred.' };
  }
}

/**
 * Logs in an existing trader.
 */
export async function loginTrader(traderId: string, password: string) {
  try {
    if (!traderId || !password) {
      return { success: false, error: 'Trader ID and Password are required.' };
    }

    const email = getVirtualEmail(traderId);
    const supabase = await createClient();

    // Sign in with virtual email
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: 'Invalid Trader ID or password.' };
    }

    if (!data.user) {
      return { success: false, error: 'Login failed.' };
    }

    // Fetch user profile status
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('status, vip_access, premium_access')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      return { success: false, error: 'User profile not found.' };
    }

    return {
      success: true,
      status: profile.status,
      vipAccess: profile.vip_access,
      premiumAccess: profile.premium_access,
    };
  } catch (err: any) {
    console.error('Login error:', err);
    return { success: false, error: err.message || 'An unexpected error occurred.' };
  }
}

/**
 * Signs out the current user and clears session cookies.
 */
export async function logoutUser() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  return { success: true };
}

/**
 * Logs in an administrator and checks if their ID exists in public.admins.
 */
export async function adminLogin(email: string, password: string) {
  try {
    if (!email || !password) {
      return { success: false, error: 'Email and password are required.' };
    }

    const supabase = await createClient();

    // 1. Sign in via Supabase auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: 'Invalid credentials.' };
    }

    if (!data.user) {
      return { success: false, error: 'Authentication failed.' };
    }

    // 2. Check if user is in public.admins table
    const { data: adminRecord, error: adminError } = await supabase
      .from('admins')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (adminError || !adminRecord) {
      // Sign them out immediately to clear cookies/session
      await supabase.auth.signOut();
      return { success: false, error: 'Access denied: Admin privileges required.' };
    }

    return { success: true, role: adminRecord.role };
  } catch (err: any) {
    console.error('Admin login error:', err);
    return { success: false, error: err.message || 'An unexpected error occurred.' };
  }
}
