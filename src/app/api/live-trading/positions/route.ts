/**
 * GET /api/live-trading/positions — Open live positions.
 * Protected by 2FA gate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase/server';
import { require2FA, TwoFARequiredError } from '@/lib/auth/require-2fa';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
      await require2FA(user.id);
    } catch (e) {
      if (e instanceof TwoFARequiredError) {
        return NextResponse.json({ error: e.message }, { status: 403 });
      }
      throw e;
    }

    const { data: positions, error } = await supabase
      .from('live_positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, positions: positions ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
