/**
 * Telegram Bot API Client
 *
 * Client HTTP diretto per l'API Telegram Bot.
 * Rate limiting, retry su 429, formattazione messaggi trading in italiano.
 */

import { Signal, SignalType, TierLevel } from '@/core/engine/signals';
import { MarketArea } from '@/core/types/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TelegramSendOptions {
  parse_mode?: 'HTML' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_markup?: TelegramReplyMarkup;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard?: TelegramInlineKeyboardButton[][];
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: TelegramMessageEntity[];
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
}

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export interface AreaSummary {
  pnl: number;
  pnlPercent: number;
  tradesCount: number;
  winRate: number;
  openPositions: number;
  totalExposure: number;
  bestTrade?: { market: string; pnl: number };
  worstTrade?: { market: string; pnl: number };
}

export interface DailySummary {
  date: string;
  pnl: number;
  pnlPercent: number;
  tradesCount: number;
  winRate: number;
  openPositions: number;
  totalExposure: number;
  bestTrade?: { market: string; pnl: number };
  worstTrade?: { market: string; pnl: number };
  polymarket?: AreaSummary;
  crypto?: AreaSummary;
}

export interface CircuitBreakerDetails {
  strategyId: string;
  strategyName: string;
  currentDrawdown: number;
  maxDrawdown: number;
  action: string;
  timestamp: string;
}

export interface PerformanceWarningDetails {
  strategyCode: string;
  strategyName: string;
  area: 'crypto' | 'polymarket';
  warningLevel: 1 | 2;
  currentDrawdownPct: number;
  circuitBreakerLimitPct: number;
  sessionStartedAt: string;
}

// ---------------------------------------------------------------------------
// Rate Limiter (30 msg/sec Telegram limit)
// ---------------------------------------------------------------------------

class TelegramRateLimiter {
  private timestamps: number[] = [];
  private readonly maxPerSecond = 30;

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 1000);

    if (this.timestamps.length >= this.maxPerSecond) {
      const oldest = this.timestamps[0];
      const waitTime = 1000 - (now - oldest) + 10;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.timestamps.push(Date.now());
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.telegram.org/bot';
const MAX_RETRIES = 3;

class TelegramClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private rateLimiter = new TelegramRateLimiter();

  constructor(token?: string) {
    const t = token ?? process.env.TELEGRAM_BOT_TOKEN;
    if (!t) {
      throw new Error('TELEGRAM_BOT_TOKEN non configurato');
    }
    this.token = t;
    this.baseUrl = `${BASE_URL}${this.token}`;
  }

  // -------------------------------------------------------------------------
  // API call generico con retry
  // -------------------------------------------------------------------------

  private async callApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    await this.rateLimiter.waitForSlot();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/${method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });

        const data = (await response.json()) as TelegramApiResponse<T>;

        if (data.ok && data.result !== undefined) {
          return data.result;
        }

        // Rate limited (429)
        if (data.error_code === 429) {
          const retryAfter = data.parameters?.retry_after ?? 1;
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }

        throw new Error(
          `Telegram API ${method} fallita: ${data.error_code} — ${data.description}`
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < MAX_RETRIES) {
          const delay = 500 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error(`Telegram API ${method} fallita dopo ${MAX_RETRIES} tentativi`);
  }

  // -------------------------------------------------------------------------
  // Metodi pubblici
  // -------------------------------------------------------------------------

  async sendMessage(
    chatId: number | string,
    text: string,
    options?: TelegramSendOptions
  ): Promise<TelegramMessage> {
    return this.callApi<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode ?? 'HTML',
      disable_web_page_preview: options?.disable_web_page_preview ?? true,
      disable_notification: options?.disable_notification ?? false,
      ...(options?.reply_markup ? { reply_markup: options.reply_markup } : {}),
    });
  }

  async sendSignalAlert(chatId: number | string, signal: Signal): Promise<TelegramMessage> {
    const text = formatSignalMessage(signal);
    const replyMarkup = buildSignalButtons(signal);
    return this.sendMessage(chatId, text, { reply_markup: replyMarkup });
  }

  async sendDailySummary(chatId: number | string, summary: DailySummary): Promise<TelegramMessage> {
    const text = formatDailySummary(summary);
    return this.sendMessage(chatId, text);
  }

  async sendCircuitBreakerAlert(
    chatId: number | string,
    details: CircuitBreakerDetails
  ): Promise<TelegramMessage> {
    const text = formatCircuitBreakerAlert(details);
    return this.sendMessage(chatId, text, { disable_notification: false });
  }

  async sendPerformanceWarning(
    chatId: number | string,
    details: PerformanceWarningDetails
  ): Promise<TelegramMessage> {
    const text = formatPerformanceWarning(details);
    return this.sendMessage(chatId, text, { disable_notification: false });
  }

  async setWebhook(url: string): Promise<boolean> {
    return this.callApi<boolean>('setWebhook', {
      url,
      allowed_updates: ['message', 'callback_query'],
    });
  }

  async deleteWebhook(): Promise<boolean> {
    return this.callApi<boolean>('deleteWebhook', {});
  }

  async getUpdates(offset?: number, limit = 100): Promise<TelegramUpdate[]> {
    return this.callApi<TelegramUpdate[]>('getUpdates', {
      offset,
      limit,
      timeout: 30,
      allowed_updates: ['message', 'callback_query'],
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    return this.callApi<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
    });
  }
}

// ---------------------------------------------------------------------------
// Formattazione messaggi
// ---------------------------------------------------------------------------

const AREA_LABELS: Record<MarketArea, string> = {
  [MarketArea.PREDICTION]: 'Prediction',
  [MarketArea.EXCHANGE_BETTING]: 'Exchange Betting',
  [MarketArea.STOCKS]: 'Azioni',
  [MarketArea.FOREX]: 'Forex',
  [MarketArea.CRYPTO]: 'Crypto',
};

const TIER_LABELS: Record<TierLevel, string> = {
  [TierLevel.TIER1]: 'Tier 1 (alto)',
  [TierLevel.TIER2]: 'Tier 2 (medio)',
  [TierLevel.TIER3]: 'Tier 3 (basso)',
};

function confidenceBar(confidence: number): string {
  const filled = Math.round(confidence * 10);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
}

export function formatSignalMessage(signal: Signal): string {
  const isEntry = signal.type === SignalType.ENTER_LONG;
  const isExit =
    signal.type === SignalType.EXIT_FULL ||
    signal.type === SignalType.EXIT_PARTIAL;
  const isStopLoss = signal.type === SignalType.STOP_LOSS;

  let emoji = '\u2139\uFE0F'; // info
  let typeLabel: string = signal.type;
  if (isEntry) {
    emoji = '\uD83D\uDFE2'; // green circle
    typeLabel = 'ENTRA LONG';
  } else if (signal.type === SignalType.EXIT_FULL) {
    emoji = '\uD83D\uDD34'; // red circle
    typeLabel = 'ESCI TOTALE';
  } else if (signal.type === SignalType.EXIT_PARTIAL) {
    emoji = '\uD83D\uDFE1'; // yellow circle
    typeLabel = `ESCI PARZIALE (${(signal.sellFraction * 100).toFixed(0)}%)`;
  } else if (isStopLoss) {
    emoji = '\u26A0\uFE0F'; // warning
    typeLabel = 'STOP LOSS';
  }

  const lines: string[] = [
    `${emoji} <b>${typeLabel}</b>`,
    '',
    `<b>Mercato:</b> ${escapeHtml(signal.marketName)}`,
    `<b>Area:</b> ${AREA_LABELS[signal.area] ?? signal.area}`,
    `<b>Strategia:</b> ${escapeHtml(signal.strategyCode)}`,
    `<b>Prezzo:</b> ${signal.currentPrice.toFixed(4)}`,
  ];

  if (isEntry) {
    lines.push(`<b>Stake suggerito:</b> $${signal.suggestedStake.toFixed(2)}`);
    lines.push(`<b>Tier:</b> ${TIER_LABELS[signal.suggestedTier] ?? signal.suggestedTier}`);
  }

  lines.push('');
  lines.push(`<b>Confidence:</b> ${(signal.confidence * 100).toFixed(0)}%`);
  lines.push(`<code>${confidenceBar(signal.confidence)}</code>`);
  lines.push('');
  lines.push(`<b>Motivo:</b> ${escapeHtml(signal.reason)}`);
  lines.push('');
  lines.push(`<i>${new Date(signal.timestamp).toLocaleString('it-IT')}</i>`);

  return lines.join('\n');
}

export function formatDailySummary(summary: DailySummary): string {
  const lines: string[] = [
    `\uD83D\uDCCA <b>Report Giornaliero</b> — ${summary.date}`,
  ];

  // Per-area sections
  if (summary.polymarket) {
    lines.push('', ...formatAreaSection('Polymarket', summary.polymarket));
  }

  if (summary.crypto) {
    lines.push('', ...formatAreaSection('Crypto', summary.crypto));
  }

  // Aggregated totals
  const pnlEmoji = summary.pnl >= 0 ? '\uD83D\uDCC8' : '\uD83D\uDCC9';
  const pnlFormatted = summary.pnl >= 0
    ? `+$${summary.pnl.toFixed(2)}`
    : `-$${Math.abs(summary.pnl).toFixed(2)}`;
  const pnlPercentFormatted = summary.pnlPercent >= 0
    ? `+${summary.pnlPercent.toFixed(2)}%`
    : `${summary.pnlPercent.toFixed(2)}%`;

  lines.push(
    '',
    `\u2014\u2014\u2014 <b>TOTALE</b> \u2014\u2014\u2014`,
    `${pnlEmoji} <b>P&L:</b> ${pnlFormatted} (${pnlPercentFormatted})`,
    `\uD83D\uDD04 <b>Operazioni:</b> ${summary.tradesCount}`,
    `\u2705 <b>Win rate:</b> ${(summary.winRate * 100).toFixed(1)}%`,
    `\uD83D\uDCBC <b>Posizioni aperte:</b> ${summary.openPositions}`,
    `\uD83D\uDCB0 <b>Esposizione totale:</b> $${summary.totalExposure.toFixed(2)}`,
  );

  if (summary.bestTrade) {
    lines.push('');
    lines.push(
      `\uD83C\uDFC6 <b>Miglior trade:</b> ${escapeHtml(summary.bestTrade.market)} (+$${summary.bestTrade.pnl.toFixed(2)})`
    );
  }

  if (summary.worstTrade) {
    lines.push(
      `\uD83D\uDCA9 <b>Peggior trade:</b> ${escapeHtml(summary.worstTrade.market)} (-$${Math.abs(summary.worstTrade.pnl).toFixed(2)})`
    );
  }

  return lines.join('\n');
}

function formatAreaSection(label: string, area: AreaSummary): string[] {
  const pnlEmoji = area.pnl >= 0 ? '\uD83D\uDCC8' : '\uD83D\uDCC9';
  const pnlFormatted = area.pnl >= 0
    ? `+$${area.pnl.toFixed(2)}`
    : `-$${Math.abs(area.pnl).toFixed(2)}`;
  const pnlPercentFormatted = area.pnlPercent >= 0
    ? `+${area.pnlPercent.toFixed(2)}%`
    : `${area.pnlPercent.toFixed(2)}%`;

  const lines = [
    `<b>${label}</b>`,
    `${pnlEmoji} P&L: ${pnlFormatted} (${pnlPercentFormatted})`,
    `\uD83D\uDD04 Operazioni: ${area.tradesCount}`,
    `\u2705 Win rate: ${(area.winRate * 100).toFixed(1)}%`,
    `\uD83D\uDCBC Posizioni aperte: ${area.openPositions}`,
  ];

  if (area.bestTrade) {
    lines.push(`\uD83C\uDFC6 Best: ${escapeHtml(area.bestTrade.market)} (+$${area.bestTrade.pnl.toFixed(2)})`);
  }
  if (area.worstTrade) {
    lines.push(`\uD83D\uDCA9 Worst: ${escapeHtml(area.worstTrade.market)} (-$${Math.abs(area.worstTrade.pnl).toFixed(2)})`);
  }

  return lines;
}

export function formatPerformanceWarning(details: PerformanceWarningDetails): string {
  const isLevel2 = details.warningLevel === 2;
  const emoji = isLevel2 ? '\uD83D\uDFE0\uD83D\uDFE0' : '\uD83D\uDFE1\uD83D\uDFE1'; // orange or yellow circles
  const levelLabel = isLevel2 ? 'WARNING LEVEL 2' : 'WARNING LEVEL 1';
  const areaLabel = details.area === 'crypto' ? 'Crypto' : 'Polymarket';

  // Calcola da quanto la sessione è attiva
  const sessionDurationMs = Date.now() - new Date(details.sessionStartedAt).getTime();
  const sessionHours = Math.floor(sessionDurationMs / (1000 * 60 * 60));
  const sessionDays = Math.floor(sessionHours / 24);
  const remainingHours = sessionHours % 24;
  const durationStr = sessionDays > 0
    ? `${sessionDays}g ${remainingHours}h`
    : `${sessionHours}h`;

  const lines: string[] = [
    `${emoji} <b>${levelLabel}</b> ${emoji}`,
    '',
    `<b>Strategia:</b> ${escapeHtml(details.strategyName)} (${escapeHtml(details.strategyCode)})`,
    `<b>Area:</b> ${areaLabel}`,
    '',
    `<b>Drawdown attuale:</b> -${details.currentDrawdownPct.toFixed(2)}%`,
    `<b>Limite circuit breaker:</b> -${details.circuitBreakerLimitPct.toFixed(2)}%`,
    `<b>Sessione attiva da:</b> ${durationStr}`,
    '',
    `\u26A0\uFE0F Il circuit breaker scattera a -${details.circuitBreakerLimitPct.toFixed(1)}%`,
    '',
    `<i>${new Date().toLocaleString('it-IT')}</i>`,
  ];

  return lines.join('\n');
}

export function formatCircuitBreakerAlert(details: CircuitBreakerDetails): string {
  const lines: string[] = [
    `\uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8 <b>CIRCUIT BREAKER ATTIVATO</b> \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8`,
    '',
    `<b>Strategia:</b> ${escapeHtml(details.strategyName)} (${escapeHtml(details.strategyId)})`,
    `<b>Drawdown attuale:</b> ${(details.currentDrawdown * 100).toFixed(2)}%`,
    `<b>Drawdown massimo:</b> ${(details.maxDrawdown * 100).toFixed(2)}%`,
    '',
    `<b>Azione:</b> ${escapeHtml(details.action)}`,
    '',
    `<i>${new Date(details.timestamp).toLocaleString('it-IT')}</i>`,
    '',
    '\u26A0\uFE0F Intervieni il prima possibile.',
  ];

  return lines.join('\n');
}

function buildSignalButtons(signal: Signal): TelegramReplyMarkup | undefined {
  const isEntry = signal.type === SignalType.ENTER_LONG;
  if (!isEntry) return undefined;

  return {
    inline_keyboard: [
      [
        {
          text: '\u2705 Esegui',
          callback_data: `exec:${signal.marketId}:${signal.strategyId}`,
        },
        {
          text: '\u274C Salta',
          callback_data: `skip:${signal.marketId}:${signal.strategyId}`,
        },
      ],
    ],
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let clientInstance: TelegramClient | null = null;

export function getTelegramClient(): TelegramClient {
  if (!clientInstance) {
    clientInstance = new TelegramClient();
  }
  return clientInstance;
}

export { TelegramClient };
