'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/rate-limit';

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
export async function registerTrader(traderId: string, username: string, password: string, referredBy?: string) {
  try {
    if (!traderId || !username || !password) {
      return { success: false, error: 'All fields are required.' };
    }

    if (traderId.length < 4) {
      return { success: false, error: 'Trader ID must be at least 4 characters.' };
    }

    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters.' };
    }

    const rl = checkRateLimit(`register:${traderId}`, 3, 60000);
    if (!rl.allowed) {
      return { success: false, error: 'Too many registration attempts. Please try again later.' };
    }

    const email = getVirtualEmail(traderId);
    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Validate referredBy exists in public.users
    let validReferredBy: string | null = null;
    if (referredBy) {
      const { data: refUser } = await adminClient
        .from('users')
        .select('trader_id')
        .eq('trader_id', referredBy.trim())
        .maybeSingle();
      if (refUser) {
        validReferredBy = refUser.trader_id;
      }
    }

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
      return { success: false, error: 'Registration failed. Please try again.' };
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
        referred_by_trader_id: validReferredBy,
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
    return { success: false, error: 'An unexpected error occurred.' };
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

    const rl = checkRateLimit(`login:${traderId}`, 5, 60000);
    if (!rl.allowed) {
      return { success: false, error: 'Too many login attempts. Please try again later.' };
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

    // Fetch user profile status using the admin client to bypass cookie propagation delay
    const adminClient = createAdminClient();
    const { data: profile, error: profileError } = await adminClient
      .from('users')
      .select('status, vip_access, premium_access')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch error for user ID:', data.user.id, profileError);
      return { 
        success: false, 
        error: 'User profile not found. Please contact support.' 
      };
    }

    return {
      success: true,
      status: profile.status,
      vipAccess: profile.vip_access,
      premiumAccess: profile.premium_access,
    };
  } catch (err: any) {
    console.error('Login error:', err);
    return { success: false, error: 'An unexpected error occurred.' };
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
 * If the admin has MFA enrolled, returns mfaRequired instead of full success.
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

    // 3. Check if MFA is enrolled and verified
    const { data: mfaData } = await supabase.auth.mfa.listFactors();
    const verifiedFactors = mfaData?.all?.filter(f => f.status === 'verified') || [];

    if (verifiedFactors.length > 0) {
      // Create a challenge for the first verified factor
      const factor = verifiedFactors[0];
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });

      if (challengeError) {
        await supabase.auth.signOut();
        return { success: false, error: 'Authentication failed. Please try again.' };
      }

      return {
        mfaRequired: true,
        factorId: factor.id,
        challengeId: challengeData.id,
      };
    }

    return { success: true, role: adminRecord.role };
  } catch (err: any) {
    console.error('Admin login error:', err);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}


