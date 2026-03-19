/**
 * Alert types — rules, triggers, and delivery channels for notifications.
 */

import { MarketArea } from './common';

/** An alert rule configured by the user */
export interface AlertRule {
  id: string;
  userId: string;
  name: string;
  /** What triggers this alert */
  trigger: AlertTrigger;
  /** Where to send the alert */
  channels: AlertChannel[];
  /** Whether this alert is enabled */
  enabled: boolean;
  /** Cooldown between triggers (ms) */
  cooldownMs: number;
  /** Last time this alert fired */
  lastTriggeredAt?: string;
  /** Total times fired */
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

/** What condition triggers an alert */
export interface AlertTrigger {
  type: AlertTriggerType;
  /** Market area (optional — null means all areas) */
  area?: MarketArea;
  /** Specific symbol */
  symbol?: string;
  /** Strategy ID (for strategy-based alerts) */
  strategyId?: string;
  /** Condition */
  condition: AlertCondition;
}

export type AlertTriggerType =
  | 'price_level'       // Price crosses a level
  | 'price_change'      // Price changes by X%
  | 'volume_spike'      // Unusual volume
  | 'signal_generated'  // Strategy generates a signal
  | 'trade_executed'    // A trade was executed
  | 'drawdown'          // Drawdown reaches a level
  | 'pnl_threshold'     // P&L reaches a threshold
  | 'conflict_detected' // Cross-area conflict detected
  | 'kill_switch'       // Kill switch triggered
  | 'system_error'      // System error
  ;

export interface AlertCondition {
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'crosses_above' | 'crosses_below';
  value: number;
  /** Secondary value (for 'between' ranges) */
  value2?: number;
}

/** Delivery channel for alerts */
export interface AlertChannel {
  type: AlertChannelType;
  /** Channel-specific config */
  config: AlertChannelConfig;
  /** Whether this channel is enabled */
  enabled: boolean;
}

export type AlertChannelType =
  | 'push'        // Browser push notification
  | 'telegram'    // Telegram bot message
  | 'email'       // Email
  | 'in_app'      // In-app notification
  | 'webhook'     // Custom webhook
  ;

export interface AlertChannelConfig {
  /** Telegram chat ID */
  telegramChatId?: string;
  /** Email address */
  email?: string;
  /** Webhook URL */
  webhookUrl?: string;
  /** Template for the message */
  messageTemplate?: string;
}

/** A fired alert instance */
export interface AlertEvent {
  id: string;
  ruleId: string;
  userId: string;
  trigger: AlertTrigger;
  /** Human-readable message */
  message: string;
  /** Data that triggered the alert */
  data: Record<string, unknown>;
  /** Delivery status per channel */
  deliveryStatus: {
    channel: AlertChannelType;
    status: 'sent' | 'failed' | 'pending';
    sentAt?: string;
    error?: string;
  }[];
  createdAt: string;
}
