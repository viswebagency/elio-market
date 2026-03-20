/**
 * POST /api/setup/update-strategies
 *
 * Updates existing strategies in the DB to match the current seed definitions.
 * Only updates rules, rules_readable, description, and risk parameters.
 * Does NOT touch status, sessions, or backtest results.
 *
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { POLYMARKET_STRATEGIES } from '@/core/strategies/polymarket-strategies';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createUntypedAdminClient();
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const seed of POLYMARKET_STRATEGIES) {
    const { error } = await db
      .from('strategies')
      .update({
        name: seed.name,
        description: seed.description,
        rules: seed.rules,
        rules_readable: seed.rules_readable,
        max_drawdown: seed.max_drawdown,
        max_allocation_pct: seed.max_allocation_pct,
        max_consecutive_losses: seed.max_consecutive_losses,
        sizing_method: seed.sizing_method,
        sizing_value: seed.sizing_value,
        min_ev: seed.min_ev,
        min_probability: seed.min_probability,
      })
      .eq('code', seed.code);

    if (error) {
      errors.push(`${seed.code}: ${error.message}`);
    } else {
      updated++;
    }
  }

  return NextResponse.json({ ok: true, updated, skipped, errors });
}
