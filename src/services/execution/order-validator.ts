/**
 * Order validator — validates trades before execution with full risk limits enforcement.
 */

import { Trade } from '@/core/types/trade';
import {
  MAX_SINGLE_TRADE_PERCENT,
  MAX_TOTAL_EXPOSURE_PERCENT,
  DAILY_LOSS_LIMIT_PERCENT,
} from '@/core/constants/risk-limits';
import { BankrollState } from '@/core/types/money-management';
import { auditLogger } from './audit-logger';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Adjusted size after drawdown-based reduction (undefined = no change) */
  adjustedSize?: number;
}

/** Context needed for risk validation */
export interface RiskContext {
  bankroll: BankrollState;
  /** Sum of today's realized losses (positive = loss amount) */
  todayRealizedLoss: number;
  /** Today's drawdown percentage (positive = loss %) */
  todayDrawdownPercent: number;
  /** Current total exposure (sum of open position values) */
  currentExposure: number;
  /** Value of the proposed trade (size * price) */
  tradeValue: number;
}

/** Daily drawdown thresholds for size reduction */
const DAILY_DRAWDOWN_REDUCE_50 = 2;
const DAILY_DRAWDOWN_REDUCE_75 = 4;

export class OrderValidator {
  /** Validate a trade — basic validation only (no risk context) */
  async validate(trade: Trade, riskContext?: RiskContext): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let adjustedSize: number | undefined;

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

    // Size limits (percentage-based, if provided)
    if (trade.sizePercent && trade.sizePercent > MAX_SINGLE_TRADE_PERCENT) {
      errors.push(`Trade size ${trade.sizePercent}% exceeds max ${MAX_SINGLE_TRADE_PERCENT}%`);
    }

    // Risk context checks (only if context is provided)
    if (riskContext) {
      const { bankroll, todayRealizedLoss, todayDrawdownPercent, currentExposure, tradeValue } =
        riskContext;
      const totalBankroll = bankroll.totalCapital;

      // MAX_SINGLE_TRADE check (absolute value based)
      const tradePercent = (tradeValue / totalBankroll) * 100;
      if (tradePercent > MAX_SINGLE_TRADE_PERCENT) {
        const msg = `Trade value ${tradePercent.toFixed(1)}% of bankroll exceeds max ${MAX_SINGLE_TRADE_PERCENT}%`;
        errors.push(msg);
        await auditLogger.logKillSwitch(trade.userId, `Order rejected: ${msg}`);
      }

      // DAILY_LOSS_LIMIT check
      const dailyLossPercent = (todayRealizedLoss / totalBankroll) * 100;
      if (dailyLossPercent >= DAILY_LOSS_LIMIT_PERCENT) {
        const msg = `Daily loss ${dailyLossPercent.toFixed(1)}% exceeds limit ${DAILY_LOSS_LIMIT_PERCENT}%`;
        errors.push(msg);
        await auditLogger.logKillSwitch(trade.userId, `Order rejected: ${msg}`);
      }

      // MAX_EXPOSURE check (current + proposed)
      const newExposure = currentExposure + tradeValue;
      const exposurePercent = (newExposure / totalBankroll) * 100;
      if (exposurePercent > MAX_TOTAL_EXPOSURE_PERCENT) {
        const msg = `Total exposure ${exposurePercent.toFixed(1)}% would exceed max ${MAX_TOTAL_EXPOSURE_PERCENT}%`;
        errors.push(msg);
        await auditLogger.logKillSwitch(trade.userId, `Order rejected: ${msg}`);
      }

      // Drawdown-based size reduction (only if no blocking errors from above daily loss)
      if (dailyLossPercent < DAILY_LOSS_LIMIT_PERCENT) {
        if (todayDrawdownPercent > DAILY_DRAWDOWN_REDUCE_75) {
          adjustedSize = trade.size * 0.25;
          warnings.push(
            `Drawdown ${todayDrawdownPercent.toFixed(1)}% > ${DAILY_DRAWDOWN_REDUCE_75}%: size reduced by 75% (${trade.size} → ${adjustedSize.toFixed(4)})`
          );
          await auditLogger.logKillSwitch(
            trade.userId,
            `Size reduced 75%: drawdown ${todayDrawdownPercent.toFixed(1)}%`
          );
        } else if (todayDrawdownPercent > DAILY_DRAWDOWN_REDUCE_50) {
          adjustedSize = trade.size * 0.5;
          warnings.push(
            `Drawdown ${todayDrawdownPercent.toFixed(1)}% > ${DAILY_DRAWDOWN_REDUCE_50}%: size reduced by 50% (${trade.size} → ${adjustedSize.toFixed(4)})`
          );
          await auditLogger.logKillSwitch(
            trade.userId,
            `Size reduced 50%: drawdown ${todayDrawdownPercent.toFixed(1)}%`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      adjustedSize,
    };
  }
}

export const orderValidator = new OrderValidator();
