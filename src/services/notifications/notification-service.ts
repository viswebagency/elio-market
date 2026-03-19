/**
 * Notification orchestrator — routes alerts to the appropriate channels.
 */

import { AlertEvent, AlertChannelType } from '@/core/types/alert';
import { sendTelegramAlert } from '@/services/telegram/bot';

export class NotificationService {
  /** Dispatch an alert event to all configured channels */
  async dispatch(event: AlertEvent): Promise<void> {
    const promises = event.deliveryStatus.map(async (delivery) => {
      try {
        await this.sendToChannel(delivery.channel, event);
        delivery.status = 'sent';
        delivery.sentAt = new Date().toISOString();
      } catch (error) {
        delivery.status = 'failed';
        delivery.error = error instanceof Error ? error.message : 'Unknown error';
      }
    });

    await Promise.allSettled(promises);
  }

  private async sendToChannel(channel: AlertChannelType, event: AlertEvent): Promise<void> {
    switch (channel) {
      case 'telegram':
        await this.sendTelegram(event);
        break;
      case 'email':
        await this.sendEmail(event);
        break;
      case 'push':
        await this.sendPush(event);
        break;
      case 'in_app':
        await this.sendInApp(event);
        break;
      case 'webhook':
        await this.sendWebhook(event);
        break;
    }
  }

  private async sendTelegram(event: AlertEvent): Promise<void> {
    const chatId = (event.data as Record<string, string>).telegramChatId;
    if (!chatId) throw new Error('No Telegram chat ID');
    await sendTelegramAlert(chatId, 'Alert', event.message, 'info');
  }

  private async sendEmail(_event: AlertEvent): Promise<void> {
    // TODO: implement email sending (Resend, SendGrid, etc.)
  }

  private async sendPush(_event: AlertEvent): Promise<void> {
    // TODO: implement web push notifications
  }

  private async sendInApp(_event: AlertEvent): Promise<void> {
    // TODO: store in Supabase for in-app notification center
  }

  private async sendWebhook(_event: AlertEvent): Promise<void> {
    // TODO: POST to webhook URL
  }
}

export const notificationService = new NotificationService();
