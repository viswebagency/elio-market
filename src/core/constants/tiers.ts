/**
 * Subscription tier definitions — Free, Pro, Elite.
 */

import { UserTier } from '../types/user';

export interface TierConfig {
  id: UserTier;
  name: string;
  priceMonthlyEur: number;
  priceYearlyEur: number;
  limits: TierLimits;
  features: string[];
}

export interface TierLimits {
  /** Max active strategies */
  maxStrategies: number;
  /** Max areas enabled simultaneously */
  maxAreas: number;
  /** Max backtest level */
  maxBacktestLevel: 'L1' | 'L2' | 'L3';
  /** Max AI requests per month */
  maxAIRequestsMonth: number;
  /** AI budget per month (EUR) */
  aiBudgetMonthEur: number;
  /** Max alerts */
  maxAlerts: number;
  /** Execution mode available */
  executionModes: ('manual' | 'semi_auto' | 'full_auto')[];
  /** Real-time data */
  realtimeData: boolean;
  /** Journal entries */
  maxJournalEntries: number;
  /** Export formats */
  exportFormats: ('pdf' | 'image' | 'csv')[];
  /** Fiscal reports */
  fiscalReports: boolean;
  /** Telegram bot */
  telegramBot: boolean;
  /** API access */
  apiAccess: boolean;
}

export const TIERS: Record<UserTier, TierConfig> = {
  [UserTier.FREE]: {
    id: UserTier.FREE,
    name: 'Free',
    priceMonthlyEur: 0,
    priceYearlyEur: 0,
    limits: {
      maxStrategies: 3,
      maxAreas: 2,
      maxBacktestLevel: 'L1',
      maxAIRequestsMonth: 20,
      aiBudgetMonthEur: 1,
      maxAlerts: 5,
      executionModes: ['manual'],
      realtimeData: false,
      maxJournalEntries: 50,
      exportFormats: ['image'],
      fiscalReports: false,
      telegramBot: false,
      apiAccess: false,
    },
    features: [
      '3 strategie attive',
      '2 aree mercato',
      'Backtest rapido (L1)',
      '20 richieste AI/mese',
      'Esecuzione manuale',
    ],
  },
  [UserTier.PRO]: {
    id: UserTier.PRO,
    name: 'Pro',
    priceMonthlyEur: 29,
    priceYearlyEur: 290,
    limits: {
      maxStrategies: 20,
      maxAreas: 4,
      maxBacktestLevel: 'L2',
      maxAIRequestsMonth: 200,
      aiBudgetMonthEur: 10,
      maxAlerts: 50,
      executionModes: ['manual', 'semi_auto'],
      realtimeData: true,
      maxJournalEntries: 500,
      exportFormats: ['pdf', 'image', 'csv'],
      fiscalReports: true,
      telegramBot: true,
      apiAccess: false,
    },
    features: [
      '20 strategie attive',
      '4 aree mercato',
      'Backtest standard (L2) + Monte Carlo',
      '200 richieste AI/mese',
      'Esecuzione semi-automatica',
      'Dati real-time',
      'Report fiscali',
      'Bot Telegram',
    ],
  },
  [UserTier.ELITE]: {
    id: UserTier.ELITE,
    name: 'Elite',
    priceMonthlyEur: 79,
    priceYearlyEur: 790,
    limits: {
      maxStrategies: -1, // unlimited
      maxAreas: 5,
      maxBacktestLevel: 'L3',
      maxAIRequestsMonth: -1, // unlimited (budget-capped)
      aiBudgetMonthEur: 50,
      maxAlerts: -1, // unlimited
      executionModes: ['manual', 'semi_auto', 'full_auto'],
      realtimeData: true,
      maxJournalEntries: -1, // unlimited
      exportFormats: ['pdf', 'image', 'csv'],
      fiscalReports: true,
      telegramBot: true,
      apiAccess: true,
    },
    features: [
      'Strategie illimitate',
      'Tutte le 5 aree mercato',
      'Backtest profondo (L3) + Walk-Forward',
      'AI illimitata (budget mensile)',
      'Esecuzione completamente automatica',
      'Dati real-time',
      'Report fiscali avanzati',
      'Bot Telegram + API',
    ],
  },
};
