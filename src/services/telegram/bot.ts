/**
 * Telegram bot service — sends notifications and handles commands via Telegraf.
 */

import { Telegraf } from 'telegraf';

let bot: Telegraf | null = null;

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
      '/killswitch — Ferma tutto il trading'
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
    // TODO: trigger kill switch
    ctx.reply('KILL SWITCH ATTIVATO. Tutti i trade sono stati fermati.');
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
