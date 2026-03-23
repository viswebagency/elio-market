/**
 * Order Reconciliation — polls order status until fill, computes slippage/fees,
 * and updates the trade record in the database.
 */

import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

/** Minimal order status needed for reconciliation (decoupled from CryptoAdapter) */
export interface OrderStatus {
  orderId: string;
  status: string;
  filledAmount: number;
  remainingAmount: number;
  avgFillPrice: number | undefined;
  fees: number;
}

export type GetOrderStatusFn = (orderId: string, symbol: string) => Promise<OrderStatus>;

export interface ReconciliationResult {
  orderId: string;
  status: 'filled' | 'partial_fill' | 'cancelled' | 'expired' | 'timeout' | 'error';
  expectedPrice: number;
  actualPrice: number | undefined;
  slippage: number | undefined;
  fees: number;
  fillTime: number | undefined;
  partialFill: boolean;
  filledAmount: number;
}

const BACKOFF_INTERVALS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RECONCILIATION_TIMEOUT = 2 * 60 * 1000; // 2 minutes

/**
 * Poll order status until fill or terminal state.
 * Uses exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (then repeats 30s).
 * Timeout: 2 minutes max.
 */
export async function reconcileOrder(
  getOrderStatusFn: GetOrderStatusFn,
  orderId: string,
  symbol: string,
  expectedPrice: number,
): Promise<ReconciliationResult> {
  const startTime = Date.now();
  let backoffIndex = 0;

  while (true) {
    let orderStatus: OrderStatus;
    try {
      orderStatus = await getOrderStatusFn(orderId, symbol);
    } catch (err) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= MAX_RECONCILIATION_TIMEOUT) {
        console.error(`[RECONCILIATION] Connection error after timeout for ${orderId}: ${err instanceof Error ? err.message : 'Unknown'}`);
        return {
          orderId,
          status: 'error',
          expectedPrice,
          actualPrice: undefined,
          slippage: undefined,
          fees: 0,
          fillTime: undefined,
          partialFill: false,
          filledAmount: 0,
        };
      }
      console.warn(`[RECONCILIATION] Connection error for ${orderId}, retrying: ${err instanceof Error ? err.message : 'Unknown'}`);
      await sleep(BACKOFF_INTERVALS[Math.min(backoffIndex, BACKOFF_INTERVALS.length - 1)]);
      backoffIndex++;
      continue;
    }

    // Terminal: filled (closed in ccxt)
    if (orderStatus.status === 'closed' || orderStatus.filledAmount > 0 && orderStatus.remainingAmount === 0) {
      const fillTime = Date.now() - startTime;
      const actualPrice = orderStatus.avgFillPrice;
      const slippage = actualPrice != null && expectedPrice > 0
        ? ((actualPrice - expectedPrice) / expectedPrice) * 100
        : undefined;

      return {
        orderId,
        status: 'filled',
        expectedPrice,
        actualPrice,
        slippage,
        fees: orderStatus.fees,
        fillTime,
        partialFill: false,
        filledAmount: orderStatus.filledAmount,
      };
    }

    // Terminal: cancelled
    if (orderStatus.status === 'canceled' || orderStatus.status === 'cancelled') {
      return {
        orderId,
        status: 'cancelled',
        expectedPrice,
        actualPrice: orderStatus.avgFillPrice,
        slippage: undefined,
        fees: orderStatus.fees,
        fillTime: Date.now() - startTime,
        partialFill: orderStatus.filledAmount > 0,
        filledAmount: orderStatus.filledAmount,
      };
    }

    // Terminal: expired
    if (orderStatus.status === 'expired') {
      return {
        orderId,
        status: 'expired',
        expectedPrice,
        actualPrice: orderStatus.avgFillPrice,
        slippage: undefined,
        fees: orderStatus.fees,
        fillTime: Date.now() - startTime,
        partialFill: orderStatus.filledAmount > 0,
        filledAmount: orderStatus.filledAmount,
      };
    }

    // Partial fill: if we've been waiting long enough and it's partially filled, return partial
    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_RECONCILIATION_TIMEOUT) {
      if (orderStatus.filledAmount > 0) {
        const actualPrice = orderStatus.avgFillPrice;
        const slippage = actualPrice != null && expectedPrice > 0
          ? ((actualPrice - expectedPrice) / expectedPrice) * 100
          : undefined;

        return {
          orderId,
          status: 'partial_fill',
          expectedPrice,
          actualPrice,
          slippage,
          fees: orderStatus.fees,
          fillTime: elapsed,
          partialFill: true,
          filledAmount: orderStatus.filledAmount,
        };
      }

      return {
        orderId,
        status: 'timeout',
        expectedPrice,
        actualPrice: undefined,
        slippage: undefined,
        fees: 0,
        fillTime: elapsed,
        partialFill: false,
        filledAmount: 0,
      };
    }

    // Still open — wait with backoff
    const delay = BACKOFF_INTERVALS[Math.min(backoffIndex, BACKOFF_INTERVALS.length - 1)];
    await sleep(delay);
    backoffIndex++;
  }
}

/**
 * Reconcile an order and update the trade record in the database.
 * Logs warnings for slippage > 1%, critical alerts for > 3%.
 */
export async function reconcileAndUpdate(
  getOrderStatusFn: GetOrderStatusFn,
  orderId: string,
  symbol: string,
  expectedPrice: number,
  tradeId: string,
  updateFn?: (tradeId: string, data: Record<string, unknown>) => Promise<void>,
): Promise<ReconciliationResult> {
  const result = await reconcileOrder(getOrderStatusFn, orderId, symbol, expectedPrice);

  // Log slippage warnings
  if (result.slippage != null) {
    const absSlippage = Math.abs(result.slippage);
    if (absSlippage > 3) {
      console.error(`[RECONCILIATION] CRITICAL SLIPPAGE ALERT: ${symbol} slippage=${result.slippage.toFixed(4)}% (orderId=${orderId})`);
    } else if (absSlippage > 1) {
      console.warn(`[RECONCILIATION] Slippage warning: ${symbol} slippage=${result.slippage.toFixed(4)}% (orderId=${orderId})`);
    }
  }

  // Update DB
  const updateData: Record<string, unknown> = {
    actual_price: result.actualPrice,
    slippage: result.slippage,
    fees: result.fees,
    fill_time: result.fillTime,
    reconciliation_status: result.status,
    reconciled_at: new Date().toISOString(),
  };

  try {
    if (updateFn) {
      await updateFn(tradeId, updateData);
    } else {
      await defaultUpdateTrade(tradeId, updateData);
    }
    console.log(`[RECONCILIATION] Trade ${tradeId} updated: status=${result.status}, actualPrice=${result.actualPrice}, slippage=${result.slippage?.toFixed(4)}%`);
  } catch (err) {
    console.error(`[RECONCILIATION] Failed to update trade ${tradeId} in DB: ${err instanceof Error ? err.message : 'Unknown'}`);
    // Don't throw — reconciliation result is still valid, trade stays pending in DB
  }

  return result;
}

async function defaultUpdateTrade(tradeId: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createUntypedAdminClient();
  const { error } = await supabase
    .from('trades')
    .update(data)
    .eq('id', tradeId);

  if (error) {
    throw new Error(`Supabase update failed: ${error.message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
