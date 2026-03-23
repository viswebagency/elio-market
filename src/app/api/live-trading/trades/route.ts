/**
 * GET /api/live-trading/trades — Trade history with filters.
 * Protected by 2FA gate.
 *
 * Query params:
 *   period: 'today' | 'week' | 'month' | 'all' (default: 'all')
 *   page: number (default: 1)
 *   limit: number (default: 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase/server';
import { require2FA, TwoFARequiredError } from '@/lib/auth/require-2fa';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

    const url = new URL(request.url);
    const period = url.searchParams.get('period') ?? 'all';
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('live_trades')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('executed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply period filter
    if (period !== 'all') {
      const now = new Date();
      let since: string;
      if (period === 'today') {
        since = `${now.toISOString().split('T')[0]}T00:00:00Z`;
      } else if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        since = weekAgo.toISOString();
      } else {
        // month
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        since = monthAgo.toISOString();
      }
      query = query.gte('executed_at', since);
    }

    const { data: trades, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      trades: trades ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
