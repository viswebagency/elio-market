/**
 * Order validator — validates trades before execution.
 */

import { Trade } from '@/core/types/trade';
import {
  MAX_SINGLE_TRADE_PERCENT,
  MAX_TOTAL_EXPOSURE_PERCENT as _MAX_TOTAL_EXPOSURE_PERCENT,
  MAX_LEVERAGE as _MAX_LEVERAGE,
} from '@/core/constants/risk-limits';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class OrderValidator {
  /** Validate a trade */
  async validate(trade: Trade): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic field validation
    if (!trade.symbol) errors.push('Symbol is required');
    if (trade.size <= 0) errors.push('Size must be positive');
    if (trade.limitPrice !== undefined && trade.limitPrice <= 0) {
      errors.push('Limit price must be positive');
    }

    // Stop loss check
    if (!trade.stopLoss) {
      warnings.push('No stop loss set. Consider adding one.');
    }

    // Size limits
    if (trade.sizePercent && trade.sizePercent > MAX_SINGLE_TRADE_PERCENT) {
      errors.push(`Trade size ${trade.sizePercent}% exceeds max ${MAX_SINGLE_TRADE_PERCENT}%`);
    }

    // TODO: check total exposure against MAX_TOTAL_EXPOSURE_PERCENT
    // TODO: check leverage against MAX_LEVERAGE
    // TODO: check drawdown level and apply size reduction

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export const orderValidator = new OrderValidator();
