'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function checkIsAdmin(): Promise<boolean> {
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

export interface SendNotificationPayload {
  traderId?: string;
  title: string;
  message: string;
  broadcast?: boolean;
}

export async function sendAdminNotification(payload: SendNotificationPayload): Promise<{
  success: boolean;
  count?: number;
  targetUser?: { username: string; trader_id: string };
  error?: string;
}> {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    return { success: false, error: 'Unauthorized: Admin privileges required.' };
  }

  const { title, message, traderId, broadcast } = payload;

  if (!title?.trim() || !message?.trim()) {
    return { success: false, error: 'Title and message cannot be empty.' };
  }

  try {
    const admin = createAdminClient();

    if (broadcast) {
      // Broadcast to all active users
      const { data: users, error: usersError } = await admin
        .from('users')
        .select('id');

      if (usersError || !users || users.length === 0) {
        return { success: false, error: 'Failed to retrieve users for broadcast.' };
      }

      const rows = users.map((u) => ({
        user_id: u.id,
        title: title.trim(),
        message: message.trim(),
        is_read: false,
        created_at: new Date().toISOString(),
      }));

      const { error: insertError } = await admin
        .from('notification_logs')
        .insert(rows);

      if (insertError) {
        console.error('[sendAdminNotification] Broadcast insert error:', insertError);
        return { success: false, error: 'Failed to dispatch broadcast notifications.' };
      }

      return { success: true, count: rows.length };
    } else {
      // Send to single user by Trader ID
      if (!traderId?.trim()) {
        return { success: false, error: 'Please specify a Trader ID.' };
      }

      const cleanTraderId = traderId.trim();

      const { data: user, error: userError } = await admin
        .from('users')
        .select('id, username, trader_id')
        .ilike('trader_id', cleanTraderId)
        .maybeSingle();

      if (userError || !user) {
        return { success: false, error: `No user found matching Trader ID: "${cleanTraderId}"` };
      }

      const { error: insertError } = await admin
        .from('notification_logs')
        .insert({
          user_id: user.id,
          title: title.trim(),
          message: message.trim(),
          is_read: false,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('[sendAdminNotification] Insert error:', insertError);
        return { success: false, error: 'Failed to create user notification.' };
      }

      return {
        success: true,
        count: 1,
        targetUser: {
          username: user.username || 'User',
          trader_id: user.trader_id,
        },
      };
    }
  } catch (err: any) {
    console.error('[sendAdminNotification] Exception:', err);
    return { success: false, error: 'Internal server error dispatching notification.' };
  }
}
