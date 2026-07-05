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

    // 2. Call the transaction-safe RPC function
    const { data: expiredCount, error: rpcError } = await admin
      .rpc('expire_subscriptions_cron');

    if (rpcError) throw rpcError;

    console.log(`[Cron Auto Expiration] Successfully expired ${expiredCount || 0} subscriptions.`);

    return NextResponse.json({
      success: true,
      expiredCount: expiredCount || 0
    });

  } catch (err: any) {
    console.error('[Cron Auto Expiration Exception]:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
