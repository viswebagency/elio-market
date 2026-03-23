/**
 * GET /api/live-trading/pending-approvals — Trades awaiting approval.
 * Protected by 2FA gate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase/server';
import { require2FA, TwoFARequiredError } from '@/lib/auth/require-2fa';
import { getPendingApprovals } from '@/services/telegram/trade-approval';

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

    const pending = getPendingApprovals().map((p) => ({
      id: p.id,
      symbol: p.trade.symbol,
      direction: p.trade.direction,
      size: p.trade.size,
      tradeValueUsd: p.tradeValueUsd,
      bankrollPct: p.bankrollPct,
      reason: p.reason,
      requestedAt: p.requestedAt,
    }));

    return NextResponse.json({ ok: true, pending });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
