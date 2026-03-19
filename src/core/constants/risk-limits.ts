/**
 * Risk limits — hard-coded drawdown thresholds and exposure limits.
 * These are safety rails that CANNOT be overridden by the user.
 */

import { DrawdownLevel, DrawdownThresholds } from '../types/money-management';

/** Default drawdown thresholds */
export const DEFAULT_DRAWDOWN_THRESHOLDS: DrawdownThresholds = {
  warningPercent: 20,    // -20% → reduce size by 50%
  criticalPercent: 25,   // -25% → reduce to 25%, alert
  emergencyPercent: 30,  // -30% → STOP all trading
};

/** Maximum single trade size as percentage of bankroll */
export const MAX_SINGLE_TRADE_PERCENT = 10;

/** Maximum total exposure as percentage of bankroll */
export const MAX_TOTAL_EXPOSURE_PERCENT = 80;

/** Maximum number of concurrent trades per area */
export const MAX_CONCURRENT_TRADES_PER_AREA = 20;

/** Maximum total concurrent trades */
export const MAX_CONCURRENT_TRADES_TOTAL = 50;

/** Size reduction factor per drawdown level */
export const SIZE_REDUCTION: Record<DrawdownLevel, number> = {
  [DrawdownLevel.NORMAL]: 1.0,      // 100% — no reduction
  [DrawdownLevel.WARNING]: 0.5,     // 50% — halved
  [DrawdownLevel.CRITICAL]: 0.25,   // 25% — quarter
  [DrawdownLevel.EMERGENCY]: 0.0,   // 0% — no trading
};

/** Minimum bankroll to start trading (EUR) */
export const MIN_BANKROLL_EUR = 100;

/** Daily loss limit as percentage of bankroll */
export const DAILY_LOSS_LIMIT_PERCENT = 5;

/** Maximum leverage allowed */
export const MAX_LEVERAGE = 10;
