/**
 * Telegram User Store — Supabase
 *
 * Persists Telegram bot users in the profiles table.
 * Uses telegram_chat_id, telegram_username, telegram_verified columns.
 * Replaces the in-memory store that was lost on every cold start.
 */

import { createUntypedAdminClient } from '@/lib/db/supabase/admin';
import { TelegramUserStore, TelegramUser } from './telegram-commands';

export class SupabaseTelegramUserStore implements TelegramUserStore {
  async getUser(chatId: number): Promise<TelegramUser | null> {
    const db = createUntypedAdminClient();

    const { data } = await db
      .from('profiles')
      .select('id, telegram_chat_id, telegram_username, telegram_verified, display_name, created_at')
      .eq('telegram_chat_id', chatId)
      .maybeSingle();

    if (!data) return null;

    return {
      chatId: data.telegram_chat_id,
      username: data.telegram_username,
      firstName: data.display_name ?? 'Utente',
      lastName: null,
      active: data.telegram_verified ?? false,
      registeredAt: data.created_at,
    };
  }

  async saveUser(user: TelegramUser): Promise<void> {
    const db = createUntypedAdminClient();

    // Try to find a profile to link this Telegram chat to
    // First, check if any profile already has this chat ID
    const { data: existing } = await db
      .from('profiles')
      .select('id')
      .eq('telegram_chat_id', user.chatId)
      .maybeSingle();

    if (existing) {
      // Update existing
      await db
        .from('profiles')
        .update({
          telegram_username: user.username,
          telegram_verified: user.active,
          display_name: user.firstName,
        })
        .eq('id', existing.id);
      return;
    }

    // Link to first unlinked profile (single-user mode)
    const { data: unlinked } = await db
      .from('profiles')
      .select('id')
      .is('telegram_chat_id', null)
      .limit(1)
      .maybeSingle();

    if (unlinked) {
      await db
        .from('profiles')
        .update({
          telegram_chat_id: user.chatId,
          telegram_username: user.username,
          telegram_verified: user.active,
          display_name: user.firstName,
        })
        .eq('id', unlinked.id);
      return;
    }

    // If no profile available, update the first one (founder mode)
    const { data: first } = await db
      .from('profiles')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (first) {
      await db
        .from('profiles')
        .update({
          telegram_chat_id: user.chatId,
          telegram_username: user.username,
          telegram_verified: user.active,
          display_name: user.firstName,
        })
        .eq('id', first.id);
    }
  }

  async deactivateUser(chatId: number): Promise<void> {
    const db = createUntypedAdminClient();

    await db
      .from('profiles')
      .update({ telegram_verified: false })
      .eq('telegram_chat_id', chatId);
  }

  async getActiveUsers(): Promise<TelegramUser[]> {
    const db = createUntypedAdminClient();

    const { data: rows } = await db
      .from('profiles')
      .select('telegram_chat_id, telegram_username, display_name, telegram_verified, created_at')
      .eq('telegram_verified', true)
      .not('telegram_chat_id', 'is', null);

    if (!rows || rows.length === 0) return [];

    return rows.map((row) => ({
      chatId: row.telegram_chat_id,
      username: row.telegram_username,
      firstName: row.display_name ?? 'Utente',
      lastName: null,
      active: true,
      registeredAt: row.created_at,
    }));
  }
}
