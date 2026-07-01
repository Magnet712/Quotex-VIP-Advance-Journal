import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Next.js POST Webhook Endpoint
// Expects: POST /api/webhooks/signals
// Headers: x-webhook-secret: <process.env.WEBHOOK_SECRET>
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // 1. Authenticate the webhook request
    const webhookSecret = process.env.WEBHOOK_SECRET || 'quotex-journal-webhook-secret-key-123';
    const authHeader = request.headers.get('x-webhook-secret');
    
    if (authHeader !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse payload
    const body = await request.json();
    const action = body.action || 'create';

    // Initialize Supabase Admin client using service role key (bypasses RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceRole);

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: resolve
    // Resolves the most recent pending signal for this pair using close price
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'resolve') {
      const { pair, expiry_price } = body;
      if (!pair || expiry_price === undefined) {
        return NextResponse.json({ error: 'Missing required resolution fields' }, { status: 400 });
      }

      // Fetch the latest pending signal for this specific pair
      const { data: pendingSignal, error: findError } = await supabase
        .from('signals')
        .select('*')
        .eq('pair', pair)
        .eq('result', 'PENDING')
        .order('entry_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findError) {
        return NextResponse.json({ error: findError.message }, { status: 500 });
      }

      if (!pendingSignal) {
        return NextResponse.json({ error: `No pending signal found for pair ${pair}` }, { status: 404 });
      }

      const entryPrice = Number(pendingSignal.entry_price);
      const closePrice = Number(expiry_price);
      let result: 'WIN' | 'LOSS' = 'LOSS';

      if (pendingSignal.direction === 'CALL') {
        result = closePrice > entryPrice ? 'WIN' : 'LOSS';
      } else if (pendingSignal.direction === 'PUT') {
        result = closePrice < entryPrice ? 'WIN' : 'LOSS';
      }

      const { error: updateError } = await supabase
        .from('signals')
        .update({
          result:       result,
          expiry_price: closePrice,
        })
        .eq('id', pendingSignal.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        resolvedId: pendingSignal.id, 
        result 
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: create
    // Creates a new pending signal
    // ─────────────────────────────────────────────────────────────────────────
    const { 
      pair, direction, entry_price, confidence, 
      strategy_name, timeframe = '1m', risk_level 
    } = body;

    if (!pair || !direction || !entry_price || !confidence || !strategy_name) {
      return NextResponse.json({ error: 'Missing required signal creation fields' }, { status: 400 });
    }

    const entryTime = new Date();
    // Default to 1-minute expiry range for standard signals
    const expiryTime = new Date(entryTime.getTime() + 60 * 1000); 

    const { data, error } = await supabase
      .from('signals')
      .insert({
        pair:             pair,
        timeframe:        timeframe,
        direction:        direction,
        entry_price:      Number(entry_price),
        entry_time:       entryTime.toISOString(),
        expiry_time:      expiryTime.toISOString(),
        strategy_name:    strategy_name,
        confidence:       Number(confidence),
        risk_level:       risk_level || (Number(confidence) >= 91 ? 'LOW' : Number(confidence) >= 86 ? 'MEDIUM' : 'HIGH'),
        result:           'PENDING',
        source:           'live_market',
        strategy_version: 'v1.1',
        quality_score:    Math.round((80 + 80 + 80 + Number(confidence)) / 4), // Default quality offset calculation
        is_premium:       true
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Webhook API Create] Supabase error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, signalId: data.id });
  } catch (err: any) {
    console.error('[Webhook API Exception]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
