/**
 * User types — profiles, tiers, and onboarding data.
 */

import { MarketArea, Currency } from './common';

/** User subscription tier */
export enum UserTier {
  FREE = 'free',
  PRO = 'pro',
  ELITE = 'elite',
}

/** User profile */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  /** Subscription tier */
  tier: UserTier;
  /** Preferred currency */
  currency: Currency;
  /** Which areas the user has enabled */
  enabledAreas: MarketArea[];
  /** Country code (ISO 3166-1 alpha-2) */
  country: string;
  /** Timezone */
  timezone: string;
  /** Preferred language */
  locale: string;
  /** Whether onboarding is completed */
  onboardingCompleted: boolean;
  /** Telegram chat ID (if connected) */
  telegramChatId?: string;
  /** Risk profile from onboarding */
  riskProfile?: RiskProfile;
  /** Connected broker/exchange accounts */
  connectedAccounts: ConnectedAccount[];
  /** Age verification completed */
  ageVerified: boolean;
  /** Accepted disclaimer version */
  disclaimerVersion?: string;
  createdAt: string;
  updatedAt: string;
}

/** Risk profile determined during onboarding */
export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

/** A connected broker/exchange account */
export interface ConnectedAccount {
  id: string;
  area: MarketArea;
  /** Platform name (e.g., "Polymarket", "Interactive Brokers") */
  platform: string;
  /** Whether the connection is active */
  isActive: boolean;
  /** Permissions granted */
  permissions: ('read' | 'trade' | 'withdraw')[];
  /** Last successful sync */
  lastSyncAt?: string;
  connectedAt: string;
}

/** Onboarding wizard data */
export interface OnboardingData {
  /** Step 1: Basic info */
  step1?: {
    displayName: string;
    country: string;
    currency: Currency;
  };
  /** Step 2: Experience level */
  step2?: {
    experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'professional';
    yearsTrading: number;
    areasOfInterest: MarketArea[];
  };
  /** Step 3: Risk assessment */
  step3?: {
    riskProfile: RiskProfile;
    initialCapital: number;
    maxAcceptableLoss: number;
  };
  /** Step 4: Legal */
  step4?: {
    ageVerified: boolean;
    disclaimerAccepted: boolean;
    gamblingWarningAcknowledged: boolean;
  };
  /** Current step */
  currentStep: number;
  /** Completed */
  completed: boolean;
}
