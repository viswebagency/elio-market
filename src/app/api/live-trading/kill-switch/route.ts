/**
 * POST /api/live-trading/kill-switch — Activate/deactivate kill switch from web.
 * Protected by 2FA gate.
 *
 * Body: { action: 'activate' | 'deactivate' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase/server';
import { require2FA, TwoFARequiredError } from '@/lib/auth/require-2fa';
import { killSwitch } from '@/services/execution/kill-switch';
import { cancelAllPending } from '@/services/telegram/trade-approval';
import { auditLogger } from '@/services/execution/audit-logger';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    return NextResponse.json({ ok: true, status: killSwitch.getStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    const action = body.action as string;

    if (action === 'activate') {
      cancelAllPending();
      const report = await killSwitch.activate(user.id, 'Web dashboard');
      await auditLogger.logKillSwitch(user.id, 'Kill switch activated from web dashboard');
      return NextResponse.json({ ok: true, action: 'activated', report });
    }

    if (action === 'deactivate') {
      await killSwitch.deactivate(user.id);
      await auditLogger.logKillSwitch(user.id, 'Kill switch deactivated from web dashboard');
      return NextResponse.json({ ok: true, action: 'deactivated' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
