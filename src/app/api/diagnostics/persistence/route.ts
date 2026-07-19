import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { persistenceDiag } from '@/lib/otc/persistence-diagnostics';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7) === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(persistenceDiag.getMetrics());
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: adminRecord } = await supabase
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!adminRecord) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(persistenceDiag.getMetrics());
}
