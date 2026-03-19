/**
 * Execution service — orchestrates order placement across all plugins.
 * Validates, sizes, logs, and executes trades.
 */

import { Trade, TradeExecution } from '@/core/types/trade';
import { pluginRegistry } from '@/plugins/registry';
import { orderValidator } from './order-validator';
import { killSwitch } from './kill-switch';
import { auditLogger } from './audit-logger';

export class ExecutionService {
  /** Execute a trade through the appropriate plugin */
  async execute(trade: Trade): Promise<TradeExecution> {
    // Step 1: Kill switch check
    if (killSwitch.isActive()) {
      throw new Error('Kill switch is active. All trading is halted.');
    }

    // Step 2: Validate the order
    const validation = await orderValidator.validate(trade);
    if (!validation.valid) {
      throw new Error(`Order validation failed: ${validation.errors.join(', ')}`);
    }

    // Step 3: Log the trade intent
    await auditLogger.logTradeIntent(trade);

    // Step 4: Get the appropriate plugin
    const plugins = pluginRegistry.getPluginsByArea(trade.area);
    const plugin = plugins.find((p) => p.capabilities.execution && p.status === 'ready');
    if (!plugin) {
      throw new Error(`No execution-capable plugin available for area: ${trade.area}`);
    }

    // Step 5: Execute
    try {
      const execution = await plugin.placeTrade!(trade);
      await auditLogger.logExecution(execution);
      return execution;
    } catch (error) {
      await auditLogger.logError(trade.id, error instanceof Error ? error.message : 'Unknown');
      throw error;
    }
  }
}

export const executionService = new ExecutionService();
