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

    // TODO: integrare con il motore di paper trading reale
    await client.sendMessage(
      chatId,
      [
        '\uD83D\uDFE2 <b>Stato Sistema</b>',
        '',
        '<b>Paper Trading:</b> Attivo',
        '<b>Strategie caricate:</b> —',
        '<b>Ultimo scan:</b> —',
        '<b>Uptime:</b> —',
        '',
        '<i>Integrazione completa in arrivo.</i>',
      ].join('\n')
    );
  }

  private async handlePortfolio(chatId: number): Promise<void> {
    const client = getTelegramClient();

    // TODO: integrare con portfolio manager reale
    await client.sendMessage(
      chatId,
      [
        '\uD83D\uDCBC <b>Portfolio</b>',
        '',
        '<b>Capitale:</b> —',
        '<b>Posizioni aperte:</b> 0',
        '<b>P&L giornaliero:</b> —',
        '<b>P&L totale:</b> —',
        '',
        '<i>Integrazione completa in arrivo.</i>',
      ].join('\n')
    );
  }

  private async handleScan(chatId: number): Promise<void> {
    const client = getTelegramClient();

    await client.sendMessage(
      chatId,
      '\uD83D\uDD0D <b>Scansione mercati in corso...</b>\n\n<i>Riceverai i risultati a breve.</i>'
    );

    // TODO: lanciare scan reale e inviare risultati
    // Per ora placeholder
    await client.sendMessage(
      chatId,
      [
        '\uD83D\uDD0D <b>Risultati Scan</b>',
        '',
        'Nessuna opportunita trovata al momento.',
        '',
        '<i>Integrazione con engine di scan in arrivo.</i>',
      ].join('\n')
    );
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
    handlerInstance = new TelegramCommandHandler(userStore);
  }
  return handlerInstance;
}

export { TelegramCommandHandler };
