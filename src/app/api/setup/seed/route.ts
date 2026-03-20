/**
 * POST /api/setup/seed
 *
 * One-time setup endpoint that:
 * 1. Inserts all 13 Polymarket strategies into Supabase
 * 2. Starts a paper trading session for each strategy
 * 3. Registers Elio's Telegram chat ID in profiles
 *
 * Protected by CRON_SECRET (same auth as cron endpoints).
 * Idempotent: skips strategies that already exist (by code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { POLYMARKET_STRATEGIES } from '@/core/strategies/polymarket-strategies';
import { getPaperTradingManager } from '@/core/paper-trading/manager';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ELIO_CHAT_ID = 8659384895;
const INITIAL_CAPITAL_PER_STRATEGY = 100; // $100 paper per strategia

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createUntypedAdminClient();
  const results = {
    strategiesCreated: 0,
    strategiesSkipped: 0,
    sessionsStarted: 0,
    sessionsSkipped: 0,
    errors: [] as string[],
  };

  try {
    // 1. Get or create a system user for seeded strategies
    const userId = await getOrCreateSystemUser(db);

    // 2. Insert strategies
    for (const strategy of POLYMARKET_STRATEGIES) {
      try {
        // Check if already exists
        const { data: existing } = await db
          .from('strategies')
          .select('id')
          .eq('code', strategy.code)
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          results.strategiesSkipped++;
          continue;
        }

        const { data: inserted, error } = await db
          .from('strategies')
          .insert({
            user_id: userId,
            code: strategy.code,
            name: strategy.name,
            description: strategy.description,
            area: strategy.area,
            risk_level: strategy.risk_level,
            rules: strategy.rules,
            rules_readable: strategy.rules_readable,
            max_drawdown: strategy.max_drawdown,
            max_allocation_pct: strategy.max_allocation_pct,
            max_consecutive_losses: strategy.max_consecutive_losses,
            sizing_method: strategy.sizing_method,
            sizing_value: strategy.sizing_value,
            min_ev: strategy.min_ev,
            min_probability: strategy.min_probability,
            status: 'paper_trading',
            promoted_to_paper_at: new Date().toISOString(),
            is_active: true,
          })
          .select('id')
          .single();

        if (error) {
          results.errors.push(`${strategy.code}: ${error.message}`);
          continue;
        }

        results.strategiesCreated++;

        // 3. Start paper trading session for this strategy
        if (inserted) {
          try {
            // Check if session already running
            const { data: existingSession } = await db
              .from('paper_sessions')
              .select('id')
              .eq('strategy_id', inserted.id)
              .eq('status', 'running')
              .maybeSingle();

            if (existingSession) {
              results.sessionsSkipped++;
            } else {
              const manager = getPaperTradingManager();
              await manager.start(userId, inserted.id, INITIAL_CAPITAL_PER_STRATEGY);
              results.sessionsStarted++;
            }
          } catch (sessionErr) {
            const msg = sessionErr instanceof Error ? sessionErr.message : String(sessionErr);
            results.errors.push(`Session ${strategy.code}: ${msg}`);
          }
        }
      } catch (stratErr) {
        const msg = stratErr instanceof Error ? stratErr.message : String(stratErr);
        results.errors.push(`${strategy.code}: ${msg}`);
      }
    }

    // 4. Update Telegram chat ID in profile
    await db
      .from('profiles')
      .update({
        telegram_chat_id: ELIO_CHAT_ID,
        telegram_username: 'visdigital',
        telegram_verified: true,
      })
      .eq('id', userId);

    console.log('[Setup/seed]', JSON.stringify(results));

    return NextResponse.json({ ok: true, ...results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[Setup/seed] ERRORE:', message);
    return NextResponse.json({ ok: false, error: message, ...results }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateSystemUser(db: ReturnType<typeof createUntypedAdminClient>): Promise<string> {
  // Try to find existing user with Elio's telegram_chat_id
  const { data: existing } = await db
    .from('profiles')
    .select('id')
    .eq('telegram_chat_id', ELIO_CHAT_ID)
    .maybeSingle();

  if (existing) return existing.id;

  // Try to find any user (single-user mode for now)
  const { data: anyUser } = await db
    .from('profiles')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (anyUser) return anyUser.id;

  // No users at all — this shouldn't happen if Supabase auth is configured.
  // For safety, create a placeholder profile
  throw new Error(
    'Nessun utente trovato in profiles. Registrati prima su Supabase Auth, poi rilancia il seed.',
  );
}
