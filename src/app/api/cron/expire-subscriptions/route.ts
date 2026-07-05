import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  // 1. Verify cron secret key to prevent public execution
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret');
  const cronSecret = process.env.CRON_SECRET || 'quotex-journal-cron-secret-key-123';

  if (secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();

    // 2. Fetch all active subscriptions that have passed their expiration date
    const { data: expiredSubs, error: subError } = await admin
      .from('subscriptions')
      .select('id, user_id, plan_id, activated_at')
      .eq('status', 'ACTIVE')
      .lt('expires_at', new Date().toISOString());

    if (subError) throw subError;

    if (!expiredSubs || expiredSubs.length === 0) {
      return NextResponse.json({ success: true, expiredCount: 0 });
    }

    const expiredIds = expiredSubs.map(s => s.id);
    const userIds = Array.from(new Set(expiredSubs.map(s => s.user_id)));

    // 3. Set matching subscriptions status to 'EXPIRED'
    const { error: updateSubError } = await admin
      .from('subscriptions')
      .update({ status: 'EXPIRED' })
      .in('id', expiredIds);

    if (updateSubError) throw updateSubError;

    // 4. Overlap Check: Query any OTHER active/lifetime subscriptions that are still valid
    const { data: stillActiveSubs } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('status', 'ACTIVE')
      .in('user_id', userIds)
      .or(`expires_at.gt.${new Date().toISOString()},expires_at.is.null`);

    const stillActiveUserIds = new Set((stillActiveSubs ?? []).map(s => s.user_id));
    const revokeUserIds = userIds.filter(uid => !stillActiveUserIds.has(uid));

    // Only update premium_access to false for users who have no other valid active subscriptions
    if (revokeUserIds.length > 0) {
      const { error: updateUserError } = await admin
        .from('users')
        .update({ premium_access: false })
        .in('id', revokeUserIds);

      if (updateUserError) throw updateUserError;
    }

    // 5. Create logs and notification entries
    const logPayloads = expiredSubs.map(sub => ({
      user_id: sub.user_id,
      plan_id: sub.plan_id,
      action: 'EXPIRED',
      details: `Subscription expired automatically via daily cron cleanup. Activated at ${sub.activated_at}`,
    }));

    const { error: logError } = await admin
      .from('subscription_logs')
      .insert(logPayloads);

    if (logError) throw logError;

    const notificationPayloads = expiredSubs.map(sub => ({
      user_id: sub.user_id,
      title: 'Membership Expired',
      message: `Your premium membership for plan ${sub.plan_id.replace('_', ' ').toUpperCase()} has expired.`,
    }));

    const { error: notifyError } = await admin
      .from('notification_logs')
      .insert(notificationPayloads);

    if (notifyError) throw notifyError;

    console.log(`[Cron Auto Expiration] Successfully expired ${expiredSubs.length} subscriptions.`);

    return NextResponse.json({
      success: true,
      expiredCount: expiredSubs.length,
      userIdsProcessed: userIds
    });

  } catch (err: any) {
    console.error('[Cron Auto Expiration Exception]:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
