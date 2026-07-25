import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { activateSubscriptionInternal } from '@/app/actions/billing';

function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const bodyText = await request.text();
    const signature = request.headers.get('x-razorpay-signature') || '';

    if (!verifyWebhookSignature(bodyText, signature, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(bodyText);
    const event = payload.event;

    if (event === 'payment.captured') {
      const payment = payload.payload.payment.entity;
      const orderId = payment.order_id;
      const paymentId = payment.id;

      const supabase = createAdminClient();

      const { data: requestRecord } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('razorpay_order_id', orderId)
        .maybeSingle();

      if (!requestRecord) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      if (requestRecord.status === 'CONFIRMED') {
        return NextResponse.json({ status: 'already_confirmed' });
      }

      await supabase
        .from('payment_requests')
        .update({
          status: 'CONFIRMED',
          razorpay_payment_id: paymentId,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', requestRecord.id);

      const actRes = await activateSubscriptionInternal(requestRecord.user_id, requestRecord.plan_id);

      if (actRes.success) {
        await supabase.from('notification_logs').insert({
          user_id: requestRecord.user_id,
          title: 'Payment Confirmed',
          message: `Your Razorpay payment was confirmed. ${requestRecord.plan_id.replace('_', ' ').toUpperCase()} activated!`,
        });
      }

      return NextResponse.json({ status: 'ok', activated: actRes.success });
    }

    if (event === 'payment.failed') {
      const payment = payload.payload.payment.entity;
      const orderId = payment.order_id;

      const supabase = createAdminClient();

      const { data: requestRecord } = await supabase
        .from('payment_requests')
        .select('id, user_id')
        .eq('razorpay_order_id', orderId)
        .maybeSingle();

      if (requestRecord) {
        await supabase
          .from('payment_requests')
          .update({ status: 'FAILED' })
          .eq('id', requestRecord.id);

        await supabase.from('notification_logs').insert({
          user_id: requestRecord.user_id,
          title: 'Payment Failed',
          message: 'Your Razorpay payment could not be processed. Please try again.',
        });
      }

      return NextResponse.json({ status: 'ok' });
    }

    return NextResponse.json({ status: 'ignored' });
  } catch {
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
