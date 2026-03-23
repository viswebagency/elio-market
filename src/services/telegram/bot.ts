/**
 * Telegram bot service — sends notifications and handles commands via Telegraf.
 */

import { Telegraf } from 'telegraf';
import { killSwitch, KillSwitchReport } from '@/services/execution/kill-switch';
import { CryptoAdapter } from '@/plugins/crypto/adapter';
import { resolveApproval, cancelAllPending } from '@/services/telegram/trade-approval';

let bot: Telegraf | null = null;

/** Pending confirmation state per chat */
const pendingConfirmations = new Map<
  number,
  { action: 'activate' | 'deactivate'; expiresAt: number }
>();

/** Format kill switch report for Telegram */
function formatKillSwitchReport(report: KillSwitchReport): string {
  const lines = [
    '<b>KILL SWITCH ATTIVATO</b>',
    '',
    `Ordini cancellati: ${report.cancelledOrders}`,
    `Posizioni chiuse: ${report.closedPositions}`,
  ];
  if (report.errors.length > 0) {
    lines.push('', '<b>Errori:</b>');
    for (const err of report.errors) {
      lines.push(`- ${err}`);
    }
  }
  return lines.join('\n');
}

/** Adapter resolver — set externally to avoid circular deps */
let adapterResolver: (() => Promise<CryptoAdapter | undefined>) | null = null;

/** Set the adapter resolver function */
export function setKillSwitchAdapterResolver(
  resolver: () => Promise<CryptoAdapter | undefined>
): void {
  adapterResolver = resolver;
}

/** Initialize the Telegram bot */
export function initTelegramBot(): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');

  bot = new Telegraf(token);

  // Command handlers
  bot.command('start', (ctx) => {
    ctx.reply(
      'Benvenuto su Elio.Market Bot!\n\n' +
      'Comandi disponibili:\n' +
      '/status — Stato portfolio\n' +
      '/pnl — P&L giornaliero\n' +
      '/alerts — Alert attivi\n' +
      '/killswitch — Ferma tutto il trading\n' +
      '/killswitch_off — Riattiva il trading'
    );
  });

  bot.command('status', async (ctx) => {
    // TODO: fetch portfolio status
    ctx.reply('Portfolio status: OK');
  });

  bot.command('pnl', async (ctx) => {
    // TODO: fetch today's P&L
    ctx.reply('P&L di oggi: EUR 0.00');
  });

  bot.command('killswitch', async (ctx) => {
    const status = killSwitch.getStatus();
    if (status.active) {
      ctx.reply(
        `Kill switch GIA ATTIVO.\n` +
        `Attivato da: ${status.activatedBy}\n` +
        `Motivo: ${status.reason}\n` +
        `Data: ${status.activatedAt}`
      );
      return;
    }

    pendingConfirmations.set(ctx.chat.id, {
      action: 'activate',
      expiresAt: Date.now() + 60_000, // 1 min timeout
    });

    ctx.reply(
      'Attivare kill switch? Tutti gli ordini saranno cancellati e le posizioni chiuse.\n' +
      'Rispondi SI per confermare.'
    );
  });

  bot.command('killswitch_off', async (ctx) => {
    const status = killSwitch.getStatus();
    if (!status.active) {
      ctx.reply('Kill switch non e\' attivo.');
      return;
    }

    pendingConfirmations.set(ctx.chat.id, {
      action: 'deactivate',
      expiresAt: Date.now() + 60_000,
    });

    ctx.reply(
      'Disattivare il kill switch e riabilitare il trading?\n' +
      'Rispondi SI per confermare.'
    );
  });

  // Handle trade approval callback queries
  bot.on('callback_query', async (ctx) => {
    const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
    if (!data) return;

    if (data.startsWith('approve_trade:') || data.startsWith('reject_trade:')) {
      const approved = data.startsWith('approve_trade:');
      const tradeId = data.split(':')[1];

      const resolved = resolveApproval(tradeId, approved);
      if (resolved) {
        await ctx.answerCbQuery(approved ? 'Trade approvato' : 'Trade rifiutato');
        await ctx.editMessageReplyMarkup(undefined);
        await ctx.reply(
          approved
            ? `Trade <b>${tradeId}</b> APPROVATO.`
            : `Trade <b>${tradeId}</b> RIFIUTATO.`,
          { parse_mode: 'HTML' },
        );
      } else {
        await ctx.answerCbQuery('Trade non piu\' in attesa (scaduto o gia\' gestito)');
      }
      return;
    }

    // Pass through other callback queries
    await ctx.answerCbQuery();
  });

  // Handle text messages for confirmation
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const pending = pendingConfirmations.get(chatId);

    if (!pending) return;

    // Expired
    if (Date.now() > pending.expiresAt) {
      pendingConfirmations.delete(chatId);
      return;
    }

    const text = ctx.message.text.trim().toUpperCase();
    if (text !== 'SI') {
      pendingConfirmations.delete(chatId);
      ctx.reply('Operazione annullata.');
      return;
    }

    pendingConfirmations.delete(chatId);

    if (pending.action === 'activate') {
      const userId = String(ctx.from.id);
      let adapter: CryptoAdapter | undefined;
      if (adapterResolver) {
        try {
          adapter = await adapterResolver();
        } catch {
          // No adapter available — activate without closing positions
        }
      }
      cancelAllPending();
      const report = await killSwitch.activate(userId, 'Telegram command', adapter);
      ctx.reply(formatKillSwitchReport(report), { parse_mode: 'HTML' });
    } else {
      const userId = String(ctx.from.id);
      await killSwitch.deactivate(userId);
      ctx.reply('Kill switch disattivato. Trading riabilitato.');
    }
  });

  return bot;
}

/** Send a message to a specific chat */
export async function sendTelegramMessage(chatId: string, message: string): Promise<void> {
  if (!bot) throw new Error('Telegram bot not initialized');
  await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

/** Send an alert notification */
export async function sendTelegramAlert(
  chatId: string,
  title: string,
  body: string,
  severity: 'info' | 'warning' | 'critical'
): Promise<void> {
  const icons = { info: 'i', warning: '!', critical: '!!!' };
  const message = `<b>[${icons[severity]}] ${title}</b>\n\n${body}`;
  await sendTelegramMessage(chatId, message);
}

export { bot };
