/**
 * Sistema di Notifiche Centralizzato
 *
 * Smista eventi a canali configurati (Telegram, in futuro email, push, ecc.)
 * con configurazione per utente su quali eventi ricevere.
 */

import { Signal } from '@/core/engine/signals';
import {
  getTelegramClient,
  DailySummary,
  CircuitBreakerDetails,
} from '@/lib/telegram';
import { getTelegramCommandHandler } from '@/lib/telegram-commands';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum NotificationEvent {
  SIGNAL_GENERATED = 'signal_generated',
  CIRCUIT_BREAKER = 'circuit_breaker',
  DAILY_SUMMARY = 'daily_summary',
  STRATEGY_STARTED = 'strategy_started',
  STRATEGY_STOPPED = 'strategy_stopped',
  SCAN_COMPLETE = 'scan_complete',
}

export enum NotificationChannelType {
  TELEGRAM = 'telegram',
  EMAIL = 'email',
  PUSH = 'push',
}

export interface NotificationPayload {
  event: NotificationEvent;
  data: NotificationData;
  timestamp: string;
}

export type NotificationData =
  | { type: 'signal'; signal: Signal }
  | { type: 'circuit_breaker'; details: CircuitBreakerDetails }
  | { type: 'daily_summary'; summary: DailySummary }
  | { type: 'strategy_update'; strategyId: string; strategyName: string; action: 'started' | 'stopped' }
  | { type: 'scan_complete'; marketsScanned: number; opportunitiesFound: number; topOpportunities: string[] };

export interface UserNotificationConfig {
  chatId: number;
  channels: NotificationChannelType[];
  events: NotificationEvent[];
}

export interface NotificationChannel {
  type: NotificationChannelType;
  send(chatId: number | string, payload: NotificationPayload): Promise<void>;
  isAvailable(): boolean;
}

// ---------------------------------------------------------------------------
// Telegram Channel
// ---------------------------------------------------------------------------

class TelegramNotificationChannel implements NotificationChannel {
  type = NotificationChannelType.TELEGRAM as const;

  isAvailable(): boolean {
    return !!process.env.TELEGRAM_BOT_TOKEN;
  }

  async send(chatId: number | string, payload: NotificationPayload): Promise<void> {
    const client = getTelegramClient();

    switch (payload.data.type) {
      case 'signal':
        await client.sendSignalAlert(chatId, payload.data.signal);
        break;

      case 'circuit_breaker':
        await client.sendCircuitBreakerAlert(chatId, payload.data.details);
        break;

      case 'daily_summary':
        await client.sendDailySummary(chatId, payload.data.summary);
        break;

      case 'strategy_update': {
        const { strategyName, action } = payload.data;
        const emoji = action === 'started' ? '\u25B6\uFE0F' : '\u23F9\uFE0F';
        const label = action === 'started' ? 'Avviata' : 'Fermata';
        await client.sendMessage(
          chatId,
          `${emoji} <b>Strategia ${label}</b>\n\n<b>Nome:</b> ${strategyName}`
        );
        break;
      }

      case 'scan_complete': {
        const { marketsScanned, opportunitiesFound, topOpportunities } = payload.data;
        const oppList = topOpportunities.length > 0
          ? topOpportunities.map((o) => `  \u2022 ${o}`).join('\n')
          : '  Nessuna';
        await client.sendMessage(
          chatId,
          [
            '\uD83D\uDD0D <b>Scan Completato</b>',
            '',
            `<b>Mercati analizzati:</b> ${marketsScanned}`,
            `<b>Opportunita trovate:</b> ${opportunitiesFound}`,
            '',
            `<b>Top opportunita:</b>`,
            oppList,
          ].join('\n')
        );
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Notification Manager
// ---------------------------------------------------------------------------

class NotificationManager {
  private channels: Map<NotificationChannelType, NotificationChannel> = new Map();
  private userConfigs: Map<number, UserNotificationConfig> = new Map();

  constructor() {
    // Registra Telegram come canale di default
    const telegram = new TelegramNotificationChannel();
    if (telegram.isAvailable()) {
      this.channels.set(NotificationChannelType.TELEGRAM, telegram);
    }
  }

  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.type, channel);
  }

  setUserConfig(config: UserNotificationConfig): void {
    this.userConfigs.set(config.chatId, config);
  }

  removeUserConfig(chatId: number): void {
    this.userConfigs.delete(chatId);
  }

  /**
   * Invia notifica a tutti gli utenti configurati per quell'evento.
   * Se non ci sono configurazioni utente, invia a tutti gli utenti Telegram attivi.
   */
  async notify(event: NotificationEvent, data: NotificationData): Promise<void> {
    const payload: NotificationPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    // Se ci sono config per utente, usa quelle
    if (this.userConfigs.size > 0) {
      const promises: Promise<void>[] = [];

      for (const [chatId, config] of this.userConfigs) {
        if (!config.events.includes(event)) continue;

        for (const channelType of config.channels) {
          const channel = this.channels.get(channelType);
          if (channel?.isAvailable()) {
            promises.push(
              channel.send(chatId, payload).catch((error) => {
                console.error(
                  `[Notifications] Errore invio ${channelType} a ${chatId}:`,
                  error
                );
              })
            );
          }
        }
      }

      await Promise.allSettled(promises);
      return;
    }

    // Fallback: invia a tutti gli utenti Telegram attivi
    const telegramChannel = this.channels.get(NotificationChannelType.TELEGRAM);
    if (!telegramChannel?.isAvailable()) return;

    try {
      const store = getTelegramCommandHandler().getUserStore();
      const activeUsers = await store.getActiveUsers();

      const promises = activeUsers.map((user) =>
        telegramChannel.send(user.chatId, payload).catch((error) => {
          console.error(
            `[Notifications] Errore invio Telegram a ${user.chatId}:`,
            error
          );
        })
      );

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('[Notifications] Errore recupero utenti attivi:', error);
    }
  }

  /**
   * Invia notifica a un singolo utente.
   */
  async notifyUser(
    chatId: number,
    event: NotificationEvent,
    data: NotificationData,
    channelType = NotificationChannelType.TELEGRAM
  ): Promise<void> {
    const channel = this.channels.get(channelType);
    if (!channel?.isAvailable()) {
      console.warn(`[Notifications] Canale ${channelType} non disponibile`);
      return;
    }

    const payload: NotificationPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    await channel.send(chatId, payload);
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let managerInstance: NotificationManager | null = null;

export function getNotificationManager(): NotificationManager {
  if (!managerInstance) {
    managerInstance = new NotificationManager();
  }
  return managerInstance;
}

export { NotificationManager, TelegramNotificationChannel };
