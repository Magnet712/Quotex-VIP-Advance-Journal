import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Next.js POST Webhook Endpoint
// Expects: POST /api/webhooks/signals
// Headers: x-webhook-secret: <process.env.WEBHOOK_SECRET>
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // 2. Parse payload
    const body = await request.json();
    const action = body.action || 'create';
    const bodySecret = body.secret;

    // Extract secret from URL query parameters
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get('secret');

    // 1. Authenticate the webhook request (check header, query parameter, or JSON body)
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[Webhook] WEBHOOK_SECRET environment variable is not set');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    const authHeader = request.headers.get('x-webhook-secret');
    
    if (
      authHeader !== webhookSecret && 
      querySecret !== webhookSecret && 
      bodySecret !== webhookSecret
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Clean and format pair name (e.g. EURUSD -> EUR/USD, FX:EURUSD -> EUR/USD)
    let rawPair = body.pair || '';
    let pair = String(rawPair).toUpperCase().trim();
    if (pair.includes(':')) {
      pair = pair.split(':')[1];
    }
    if (pair.includes('.')) {
      pair = pair.split('.')[0];
    }
    if (pair.length === 6 && !pair.includes('/')) {
      pair = `${pair.substring(0, 3)}/${pair.substring(3, 6)}`;
    }

    // Initialize Supabase Admin client using service role key (bypasses RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceRole);

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: resolve
    // Resolves the most recent pending signal for this pair using close price
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'resolve') {
      const { expiry_price } = body;
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
      direction, entry_price, confidence, 
      strategy_name, timeframe = '1m', risk_level 
    } = body;

    if (!pair || !direction || !entry_price || !confidence || !strategy_name) {
      return NextResponse.json({ error: 'Missing required signal creation fields' }, { status: 400 });
    }

    const entryTime = new Date();
    // Parse duration based on timeframe (e.g. 5m, 15m, 1h)
    let durationMs = 60 * 1000; // default 1m
    const match = timeframe.match(/^(\d+)([mhd])$/);
    if (match) {
      const val = parseInt(match[1], 10);
      const unit = match[2];
      if (unit === 'm') durationMs = val * 60 * 1000;
      else if (unit === 'h') durationMs = val * 60 * 60 * 1000;
      else if (unit === 'd') durationMs = val * 24 * 60 * 60 * 1000;
    }
    const expiryTime = new Date(entryTime.getTime() + durationMs); 

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
