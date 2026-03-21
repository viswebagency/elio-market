/**
 * Auto-Rotation Logic for Circuit-Broken Sessions
 *
 * Shared between crypto-tick and tick cron jobs.
 * After a cooldown period, closes the broken session and creates a new one.
 */

import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { getTelegramClient } from '@/lib/telegram';
import { MAX_AUTO_ROTATIONS, CRYPTO_L1_DEFAULT_CAPITAL } from './crypto-manager';

const ELIO_CHAT_ID = 8659384895;

export interface ExpiredSession {
  id: string;
  strategy_code: string;
  strategy_name: string;
  strategy_id: string | null;
  user_id: string | null;
  auto_rotation_count: number;
  max_auto_rotations: number;
  initial_capital: number;
}

export interface AutoRotationResult {
  rotated: number;
  stopped: number;
  errors: string[];
}

/**
 * Process expired cooldown sessions for a given table.
 * - If max rotations reached: stop permanently + alert
 * - Otherwise: close old session, create new one + alert
 */
export async function processExpiredCooldowns(
  table: 'crypto_paper_sessions' | 'paper_sessions',
  rotateSession: (session: ExpiredSession) => Promise<string>,
): Promise<AutoRotationResult> {
  const db = createUntypedAdminClient();
  const result: AutoRotationResult = { rotated: 0, stopped: 0, errors: [] };

  const { data: expired, error } = await db
    .from(table)
    .select('id, strategy_code, strategy_name, strategy_id, user_id, auto_rotation_count, max_auto_rotations, initial_capital')
    .eq('is_circuit_broken', true)
    .not('cooldown_until', 'is', null)
    .lte('cooldown_until', new Date().toISOString());

  if (error || !expired || expired.length === 0) return result;

  const client = getTelegramClient();
  const area = table === 'crypto_paper_sessions' ? 'CRYPTO' : 'POLYMARKET';

  for (const session of expired) {
    try {
      const maxRotations = session.max_auto_rotations ?? MAX_AUTO_ROTATIONS;

      if (session.auto_rotation_count >= maxRotations) {
        // Max rotations reached — permanent stop
        await db
          .from(table)
          .update({
            status: 'stopped',
            stopped_at: new Date().toISOString(),
            cooldown_until: null,
          })
          .eq('id', session.id);

        result.stopped++;

        await client.sendMessage(
          ELIO_CHAT_ID,
          `\u26D4 <b>[${area}] Auto-Rotation Limit</b>\n\n` +
          `Strategia <b>${session.strategy_name || session.strategy_code}</b> ha raggiunto il limite di ${maxRotations} rotazioni automatiche.\n` +
          `Sessione fermata definitivamente.\n\n` +
          `<i>${new Date().toLocaleString('it-IT')}</i>`,
        );
      } else {
        // Rotate: close old, create new
        const newSessionId = await rotateSession(session);
        result.rotated++;

        const rotationNum = session.auto_rotation_count + 1;
        await client.sendMessage(
          ELIO_CHAT_ID,
          `\u267B\uFE0F <b>[${area}] Auto-Rotation</b>\n\n` +
          `Strategia <b>${session.strategy_name || session.strategy_code}</b> riavviata automaticamente.\n` +
          `Rotazione ${rotationNum}/${maxRotations}\n` +
          `Nuova sessione: <code>${newSessionId}</code>\n\n` +
          `<i>${new Date().toLocaleString('it-IT')}</i>`,
        );
      }
    } catch (err) {
      result.errors.push(`Rotation failed for ${session.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
