/**
 * Telegram Bot Command Handlers
 *
 * Gestisce i comandi del bot Telegram:
 * /start, /status, /portfolio, /scan, /help, /stop
 * e callback query per inline buttons.
 */

import {
  getTelegramClient,
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramUpdate,
} from '@/lib/telegram';
import { getPaperTradingManager } from '@/core/paper-trading/manager';
import { getMarketScanner } from '@/core/paper-trading/scanner';
import { SupabaseTelegramUserStore } from '@/lib/telegram-user-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TelegramUser {
  chatId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  active: boolean;
  registeredAt: string;
}

type CommandHandler = (chatId: number, args: string) => Promise<void>;

interface CommandDefinition {
  description: string;
  handler: CommandHandler;
}

// ---------------------------------------------------------------------------
// Storage interface (Supabase in futuro)
// ---------------------------------------------------------------------------

export interface TelegramUserStore {
  getUser(chatId: number): Promise<TelegramUser | null>;
  saveUser(user: TelegramUser): Promise<void>;
  deactivateUser(chatId: number): Promise<void>;
  getActiveUsers(): Promise<TelegramUser[]>;
}

/**
 * In-memory store temporaneo.
 * Verra sostituito con Supabase quando il DB sara configurato.
 */
class InMemoryUserStore implements TelegramUserStore {
  private users = new Map<number, TelegramUser>();

  async getUser(chatId: number): Promise<TelegramUser | null> {
    return this.users.get(chatId) ?? null;
  }

  async saveUser(user: TelegramUser): Promise<void> {
    this.users.set(user.chatId, user);
  }

  async deactivateUser(chatId: number): Promise<void> {
    const user = this.users.get(chatId);
    if (user) {
      user.active = false;
    }
  }

  async getActiveUsers(): Promise<TelegramUser[]> {
    return Array.from(this.users.values()).filter((u) => u.active);
  }
}

// ---------------------------------------------------------------------------
// Command Handler Registry
// ---------------------------------------------------------------------------

class TelegramCommandHandler {
  private commands: Map<string, CommandDefinition> = new Map();
  private userStore: TelegramUserStore;

  constructor(userStore?: TelegramUserStore) {
    this.userStore = userStore ?? new InMemoryUserStore();
    this.registerCommands();
  }

  private registerCommands(): void {
    this.commands.set('/start', {
      description: 'Registrati per ricevere notifiche',
      handler: this.handleStart.bind(this),
    });

    this.commands.set('/status', {
      description: 'Stato paper trading attivo',
      handler: this.handleStatus.bind(this),
    });

    this.commands.set('/portfolio', {
      description: 'Posizioni e P&L',
      handler: this.handlePortfolio.bind(this),
    });

    this.commands.set('/scan', {
      description: 'Scansiona mercati per opportunita',
      handler: this.handleScan.bind(this),
    });

    this.commands.set('/help', {
      description: 'Lista comandi disponibili',
      handler: this.handleHelp.bind(this),
    });

    this.commands.set('/stop', {
      description: 'Disattiva notifiche',
      handler: this.handleStop.bind(this),
    });
  }

  // -------------------------------------------------------------------------
  // Process incoming update
  // -------------------------------------------------------------------------

  async processUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    if (update.message?.text) {
      await this.handleMessage(update.message);
    }
  }

  private async handleMessage(message: TelegramMessage): Promise<void> {
    const text = message.text?.trim();
    if (!text) return;

    const chatId = message.chat.id;

    // Estrai comando e argomenti
    const parts = text.split(/\s+/);
    const rawCommand = parts[0].toLowerCase();
    // Rimuovi @botname se presente
    const command = rawCommand.split('@')[0];
    const args = parts.slice(1).join(' ');

    const def = this.commands.get(command);
    if (def) {
      try {
        await def.handler(chatId, args);
      } catch (error) {
        console.error(`[Telegram] Errore comando ${command}:`, error);
        const client = getTelegramClient();
        await client.sendMessage(
          chatId,
          '\u26A0\uFE0F Errore durante l\'elaborazione del comando. Riprova piu tardi.'
        );
      }
    }
    // Comandi sconosciuti vengono ignorati silenziosamente
  }

  // -------------------------------------------------------------------------
  // Callback Query (inline buttons)
  // -------------------------------------------------------------------------

  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    const client = getTelegramClient();
    const data = query.data;
    const chatId = query.message?.chat.id;

    if (!data || !chatId) {
      await client.answerCallbackQuery(query.id, 'Azione non valida');
      return;
    }

    const [action, marketId, strategyId] = data.split(':');

    if (action === 'exec') {
      // Per ora conferma solo — in futuro eseguira l'ordine
      await client.answerCallbackQuery(query.id, 'Ordine confermato (paper)');
      await client.sendMessage(
        chatId,
        `\u2705 <b>Ordine confermato</b>\n\nMercato: <code>${marketId}</code>\nStrategia: <code>${strategyId}</code>\n\n<i>Modalita paper trading — nessun ordine reale eseguito.</i>`
      );
    } else if (action === 'skip') {
      await client.answerCallbackQuery(query.id, 'Segnale saltato');
      await client.sendMessage(
        chatId,
        `\u274C <b>Segnale saltato</b>\n\nMercato: <code>${marketId}</code>\nStrategia: <code>${strategyId}</code>`
      );
    } else {
      await client.answerCallbackQuery(query.id, 'Azione sconosciuta');
    }
  }

  // -------------------------------------------------------------------------
  // Command Handlers
  // -------------------------------------------------------------------------

  private async handleStart(chatId: number): Promise<void> {
    const client = getTelegramClient();

    const existing = await this.userStore.getUser(chatId);
    if (existing?.active) {
      await client.sendMessage(
        chatId,
        '\uD83D\uDC4B Sei gia registrato! Usa /help per vedere i comandi disponibili.'
      );
      return;
    }

    await this.userStore.saveUser({
      chatId,
      username: null, // sara arricchito dal message.from
      firstName: 'Utente',
      lastName: null,
      active: true,
      registeredAt: new Date().toISOString(),
    });

    await client.sendMessage(
      chatId,
      [
        '\uD83D\uDE80 <b>Benvenuto su Elio.Market Bot!</b>',
        '',
        'Riceverai notifiche su:',
        '\u2022 Segnali di trading generati',
        '\u2022 Alert circuit breaker',
        '\u2022 Report giornaliero P&L',
        '',
        'Usa /help per vedere tutti i comandi.',
      ].join('\n')
    );
  }

  private async handleStatus(chatId: number): Promise<void> {
    const client = getTelegramClient();

    try {
      const manager = getPaperTradingManager();
      const overview = await manager.getStatus();

      const lines: string[] = [
        '\uD83D\uDFE2 <b>Stato Sistema</b>',
        '',
        `<b>Sessioni attive:</b> ${overview.activeSessions}`,
        `<b>Sessioni in pausa:</b> ${overview.pausedSessions}`,
        `<b>Posizioni aperte:</b> ${overview.totalOpenPositions}`,
        `<b>Capitale totale:</b> $${overview.totalCapital.toFixed(2)}`,
        `<b>P&L totale:</b> ${overview.totalPnl >= 0 ? '+' : ''}$${overview.totalPnl.toFixed(2)}`,
      ];

      if (overview.sessions.length > 0) {
        lines.push('');
        lines.push('<b>Strategie:</b>');
        for (const s of overview.sessions) {
          const statusIcon = s.status === 'running' ? '\uD83D\uDFE2' : '\uD83D\uDFE1';
          const pnlSign = s.metrics.totalPnl >= 0 ? '+' : '';
          lines.push(
            `${statusIcon} ${escapeHtml(s.strategyCode)} — ${pnlSign}$${s.metrics.totalPnl.toFixed(2)} (${pnlSign}${s.metrics.totalPnlPct.toFixed(1)}%)`,
          );
        }
      }

      await client.sendMessage(chatId, lines.join('\n'));
    } catch (error) {
      await client.sendMessage(
        chatId,
        '\u26A0\uFE0F Errore nel recupero dello stato. Nessuna sessione attiva?',
      );
    }
  }

  private async handlePortfolio(chatId: number): Promise<void> {
    const client = getTelegramClient();

    try {
      const manager = getPaperTradingManager();
      const overview = await manager.getStatus();

      if (overview.sessions.length === 0) {
        await client.sendMessage(chatId, '\uD83D\uDCBC Nessuna sessione paper trading attiva.');
        return;
      }

      const lines: string[] = [
        '\uD83D\uDCBC <b>Portfolio Paper Trading</b>',
        '',
        `<b>Capitale totale:</b> $${overview.totalCapital.toFixed(2)}`,
        `<b>P&L totale:</b> ${overview.totalPnl >= 0 ? '+' : ''}$${overview.totalPnl.toFixed(2)}`,
        `<b>Posizioni aperte:</b> ${overview.totalOpenPositions}`,
      ];

      // Show open positions per session
      for (const session of overview.sessions) {
        if (session.openPositions.length === 0) continue;

        lines.push('');
        lines.push(`<b>\u2014 ${escapeHtml(session.strategyCode)} \u2014</b>`);

        for (const pos of session.openPositions) {
          const pnlSign = pos.unrealizedPnl >= 0 ? '+' : '';
          const pnlIcon = pos.unrealizedPnl >= 0 ? '\uD83D\uDFE2' : '\uD83D\uDD34';
          lines.push(
            `${pnlIcon} ${escapeHtml(pos.marketName.substring(0, 40))}`,
          );
          lines.push(
            `   Entry: ${pos.entryPrice.toFixed(4)} | Now: ${pos.currentPrice.toFixed(4)} | ${pnlSign}$${pos.unrealizedPnl.toFixed(2)}`,
          );
        }
      }

      await client.sendMessage(chatId, lines.join('\n'));
    } catch (error) {
      await client.sendMessage(
        chatId,
        '\u26A0\uFE0F Errore nel recupero del portfolio.',
      );
    }
  }

  private async handleScan(chatId: number): Promise<void> {
    const client = getTelegramClient();

    await client.sendMessage(
      chatId,
      '\uD83D\uDD0D <b>Scansione mercati in corso...</b>',
    );

    try {
      const scanner = getMarketScanner();
      const result = await scanner.scan();

      if (result.opportunities.length === 0) {
        await client.sendMessage(
          chatId,
          `\uD83D\uDD0D <b>Scan completato</b>\n\n${result.marketsScanned} mercati analizzati, nessuna opportunit\u00E0 trovata.`,
        );
        return;
      }

      const lines: string[] = [
        `\uD83D\uDD0D <b>Scan completato</b> \u2014 ${result.opportunities.length} opportunit\u00E0`,
        `<i>${result.marketsScanned} mercati | ${result.scanDurationMs}ms</i>`,
        '',
      ];

      const top = result.opportunities.slice(0, 5);
      for (const opp of top) {
        lines.push(`<b>${escapeHtml(opp.marketName.substring(0, 50))}</b>`);
        lines.push(`  ${escapeHtml(opp.strategyCode)} | Score: ${opp.score} | $${opp.suggestedStake.toFixed(2)}`);
        lines.push('');
      }

      if (result.opportunities.length > 5) {
        lines.push(`<i>...e altre ${result.opportunities.length - 5}</i>`);
      }

      await client.sendMessage(chatId, lines.join('\n'));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
      await client.sendMessage(
        chatId,
        `\u26A0\uFE0F <b>Scan fallito</b>\n\n<code>${escapeHtml(msg)}</code>`,
      );
    }
  }

  private async handleHelp(chatId: number): Promise<void> {
    const client = getTelegramClient();

    const lines = [
      '\uD83D\uDCD6 <b>Comandi disponibili</b>',
      '',
    ];

    for (const [cmd, def] of this.commands) {
      lines.push(`${cmd} — ${def.description}`);
    }

    lines.push('');
    lines.push('<i>Elio.Market — Analisi quantitativa multi-mercato</i>');

    await client.sendMessage(chatId, lines.join('\n'));
  }

  private async handleStop(chatId: number): Promise<void> {
    const client = getTelegramClient();

    await this.userStore.deactivateUser(chatId);

    await client.sendMessage(
      chatId,
      [
        '\uD83D\uDD34 <b>Notifiche disattivate</b>',
        '',
        'Non riceverai piu notifiche automatiche.',
        'Usa /start per riattivare.',
      ].join('\n')
    );
  }

  // -------------------------------------------------------------------------
  // Accesso allo store
  // -------------------------------------------------------------------------

  getUserStore(): TelegramUserStore {
    return this.userStore;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let handlerInstance: TelegramCommandHandler | null = null;

export function getTelegramCommandHandler(
  userStore?: TelegramUserStore
): TelegramCommandHandler {
  if (!handlerInstance) {
    handlerInstance = new TelegramCommandHandler(userStore ?? new SupabaseTelegramUserStore());
  }
  return handlerInstance;
}

export { TelegramCommandHandler };

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
