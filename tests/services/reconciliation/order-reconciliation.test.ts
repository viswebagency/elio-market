import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase admin client
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({ error: null }),
      }),
    }),
  }),
}));

import {
  reconcileOrder,
  reconcileAndUpdate,
  type GetOrderStatusFn,
  type OrderStatus,
} from '@/services/reconciliation/order-reconciliation';

function makeFilledStatus(orderId: string, avgPrice = 65000, fees = 0.65): OrderStatus {
  return {
    orderId,
    status: 'closed',
    filledAmount: 1.0,
    remainingAmount: 0,
    avgFillPrice: avgPrice,
    fees,
  };
}

function makeOpenStatus(orderId: string): OrderStatus {
  return {
    orderId,
    status: 'open',
    filledAmount: 0,
    remainingAmount: 1.0,
    avgFillPrice: undefined,
    fees: 0,
  };
}

function makePartialFillStatus(orderId: string): OrderStatus {
  return {
    orderId,
    status: 'open',
    filledAmount: 0.3,
    remainingAmount: 0.7,
    avgFillPrice: 64500,
    fees: 0.32,
  };
}

describe('Order Reconciliation — reconcileOrder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should return filled immediately for already-filled orders', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockResolvedValue(makeFilledStatus('order-1'));

    const promise = reconcileOrder(getStatus, 'order-1', 'BTC/USDT', 65000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('filled');
    expect(result.orderId).toBe('order-1');
    expect(result.actualPrice).toBe(65000);
    expect(result.slippage).toBe(0);
    expect(result.fees).toBe(0.65);
    expect(result.partialFill).toBe(false);
    expect(result.filledAmount).toBe(1.0);
    expect(result.fillTime).toBeDefined();
  });

  it('should compute slippage correctly', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockResolvedValue(
      makeFilledStatus('order-1', 65650, 0.65), // 1% slippage up from 65000
    );

    const promise = reconcileOrder(getStatus, 'order-1', 'BTC/USDT', 65000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('filled');
    expect(result.slippage).toBeCloseTo(1.0, 1);
  });

  it('should handle cancelled orders', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockResolvedValue({
      orderId: 'order-1',
      status: 'canceled',
      filledAmount: 0,
      remainingAmount: 1.0,
      avgFillPrice: undefined,
      fees: 0,
    });

    const promise = reconcileOrder(getStatus, 'order-1', 'BTC/USDT', 65000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('cancelled');
    expect(result.partialFill).toBe(false);
  });

  it('should handle expired orders', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockResolvedValue({
      orderId: 'order-1',
      status: 'expired',
      filledAmount: 0,
      remainingAmount: 1.0,
      avgFillPrice: undefined,
      fees: 0,
    });

    const promise = reconcileOrder(getStatus, 'order-1', 'BTC/USDT', 65000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('expired');
  });

  it('should poll with backoff and return on fill', async () => {
    let callCount = 0;
    const getStatus: GetOrderStatusFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) return makeOpenStatus('order-1');
      return makeFilledStatus('order-1');
    });

    const promise = reconcileOrder(getStatus, 'order-1', 'BTC/USDT', 65000);

    // Advance through backoff: 1s, 2s
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(1000); // extra to settle

    const result = await promise;

    expect(result.status).toBe('filled');
    expect(callCount).toBe(3);
  });

  it('should timeout and return partial fill when partially filled', async () => {
    let callCount = 0;
    const getStatus: GetOrderStatusFn = vi.fn().mockImplementation(async () => {
      callCount++;
      return makePartialFillStatus('order-1');
    });

    const promise = reconcileOrder(getStatus, 'order-1', 'BTC/USDT', 65000);

    // Advance past 2 minute timeout
    await vi.advanceTimersByTimeAsync(130_000);

    const result = await promise;

    expect(result.status).toBe('partial_fill');
    expect(result.partialFill).toBe(true);
    expect(result.filledAmount).toBe(0.3);
    expect(result.actualPrice).toBe(64500);
  });

  it('should timeout with no fill', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockResolvedValue(makeOpenStatus('order-1'));

    const promise = reconcileOrder(getStatus, 'order-1', 'BTC/USDT', 65000);

    await vi.advanceTimersByTimeAsync(130_000);

    const result = await promise;

    expect(result.status).toBe('timeout');
    expect(result.filledAmount).toBe(0);
    expect(result.actualPrice).toBeUndefined();
  });

  it('should retry on connection error and succeed on next attempt', async () => {
    let callCount = 0;
    const getStatus: GetOrderStatusFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Network error');
      return makeFilledStatus('order-1');
    });

    const promise = reconcileOrder(getStatus, 'order-1', 'BTC/USDT', 65000);

    await vi.advanceTimersByTimeAsync(1000); // backoff after error
    await vi.advanceTimersByTimeAsync(1000); // settle

    const result = await promise;

    expect(result.status).toBe('filled');
    expect(callCount).toBe(2);
  });

  it('should return error after timeout with persistent connection errors', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockRejectedValue(new Error('Network error'));

    const promise = reconcileOrder(getStatus, 'order-1', 'BTC/USDT', 65000);

    await vi.advanceTimersByTimeAsync(130_000);

    const result = await promise;

    expect(result.status).toBe('error');
    expect(result.filledAmount).toBe(0);
  });
});

describe('Order Reconciliation — reconcileAndUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should reconcile and update trade via custom updateFn', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockResolvedValue(makeFilledStatus('order-1', 65000, 0.65));
    const updateFn = vi.fn().mockResolvedValue(undefined);

    const promise = reconcileAndUpdate(getStatus, 'order-1', 'BTC/USDT', 65000, 'trade-1', updateFn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('filled');
    expect(updateFn).toHaveBeenCalledWith('trade-1', expect.objectContaining({
      actual_price: 65000,
      slippage: 0,
      fees: 0.65,
      reconciliation_status: 'filled',
    }));
  });

  it('should log warning for slippage > 1%', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockResolvedValue(
      makeFilledStatus('order-1', 66300, 0.65), // ~2% slippage
    );
    const updateFn = vi.fn().mockResolvedValue(undefined);

    const promise = reconcileAndUpdate(getStatus, 'order-1', 'BTC/USDT', 65000, 'trade-1', updateFn);
    await vi.runAllTimersAsync();
    await promise;

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Slippage warning'));
  });

  it('should log critical alert for slippage > 3%', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockResolvedValue(
      makeFilledStatus('order-1', 67500, 0.65), // ~3.8% slippage
    );
    const updateFn = vi.fn().mockResolvedValue(undefined);

    const promise = reconcileAndUpdate(getStatus, 'order-1', 'BTC/USDT', 65000, 'trade-1', updateFn);
    await vi.runAllTimersAsync();
    await promise;

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL SLIPPAGE'));
  });

  it('should not throw if DB update fails', async () => {
    const getStatus: GetOrderStatusFn = vi.fn().mockResolvedValue(makeFilledStatus('order-1'));
    const updateFn = vi.fn().mockRejectedValue(new Error('DB connection lost'));

    const promise = reconcileAndUpdate(getStatus, 'order-1', 'BTC/USDT', 65000, 'trade-1', updateFn);
    await vi.runAllTimersAsync();
    const result = await promise;

    // Should still return the reconciliation result, not throw
    expect(result.status).toBe('filled');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to update trade'));
  });
});
