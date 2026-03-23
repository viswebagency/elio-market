/**
 * POST /api/live-trading/approve — Approve a pending trade from web.
 * Protected by 2FA gate.
 *
 * Body: { tradeId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase/server';
import { require2FA, TwoFARequiredError } from '@/lib/auth/require-2fa';
import { resolveApproval } from '@/services/telegram/trade-approval';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const tradeId = body.tradeId as string;

    if (!tradeId) {
      return NextResponse.json({ error: 'tradeId required' }, { status: 400 });
    }

    const resolved = resolveApproval(tradeId, true);
    if (!resolved) {
      return NextResponse.json({ error: 'Trade non trovato o gia\' gestito' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, action: 'approved', tradeId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
