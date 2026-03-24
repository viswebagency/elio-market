/**
 * Tests for KillSwitch — real activation with order cancellation and position closing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KillSwitch } from '@/services/execution/kill-switch';

// Mock audit logger
vi.mock('@/services/execution/audit-logger', () => ({
  auditLogger: {
    logKillSwitch: vi.fn().mockResolvedValue(undefined),
    logTradeIntent: vi.fn().mockResolvedValue(undefined),
    logExecution: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock DB for hydrate/persist
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  }),
}));

function createMockAdapter(overrides: Record<string, unknown> = {}) {
  return {
    getOpenOrders: vi.fn().mockResolvedValue([
      { id: 'order-1', symbol: 'BTC/USDT', side: 'buy', amount: 0.01 },
      { id: 'order-2', symbol: 'ETH/USDT', side: 'buy', amount: 1.5 },
    ]),
    cancelOrder: vi.fn().mockResolvedValue({ success: true, orderId: '', message: 'ok' }),
    getPositions: vi.fn().mockResolvedValue([
      { symbol: 'BTC/USDT', amount: 0.05, currentPrice: 60000, pnl: 100 },
    ]),
    placeTrade: vi.fn().mockResolvedValue({
      orderId: 'close-1',
      status: 'filled',
      filledAmount: 0.05,
    }),
    ...overrides,
  } as any;
}

describe('KillSwitch', () => {
  let ks: KillSwitch;

  beforeEach(() => {
    ks = new KillSwitch();
  });

  it('should start inactive', async () => {
    expect(await ks.isActive()).toBe(false);
    expect(ks.getStatus().active).toBe(false);
  });

  it('should activate without adapter (flag-only)', async () => {
    const report = await ks.activate('user-1', 'test reason');

    expect(await ks.isActive()).toBe(true);
    expect(ks.getStatus().activatedBy).toBe('user-1');
    expect(ks.getStatus().reason).toBe('test reason');
    expect(report.cancelledOrders).toBe(0);
    expect(report.closedPositions).toBe(0);
    expect(report.errors).toHaveLength(0);
  });

  it('should activate and cancel all open orders + close all positions', async () => {
    const adapter = createMockAdapter();
    const report = await ks.activate('user-1', 'emergency', adapter);

    expect(await ks.isActive()).toBe(true);
    expect(report.cancelledOrders).toBe(2);
    expect(report.closedPositions).toBe(1);
    expect(report.errors).toHaveLength(0);

    // Verify adapter calls
    expect(adapter.getOpenOrders).toHaveBeenCalledOnce();
    expect(adapter.cancelOrder).toHaveBeenCalledTimes(2);
    expect(adapter.cancelOrder).toHaveBeenCalledWith('order-1', 'BTC/USDT');
    expect(adapter.cancelOrder).toHaveBeenCalledWith('order-2', 'ETH/USDT');
    expect(adapter.getPositions).toHaveBeenCalledOnce();
    expect(adapter.placeTrade).toHaveBeenCalledWith({
      symbol: 'BTC/USDT',
      side: 'sell',
      type: 'market',
      amount: 0.05,
    });
  });

  it('should continue on partial errors and collect them', async () => {
    const adapter = createMockAdapter({
      cancelOrder: vi.fn()
        .mockResolvedValueOnce({ success: true, orderId: 'order-1', message: 'ok' })
        .mockRejectedValueOnce(new Error('Network timeout')),
      placeTrade: vi.fn().mockRejectedValue(new Error('Insufficient balance')),
    });

    const report = await ks.activate('user-1', 'partial fail', adapter);

    expect(await ks.isActive()).toBe(true);
    expect(report.cancelledOrders).toBe(1);
    expect(report.closedPositions).toBe(0);
    expect(report.errors).toHaveLength(2);
    expect(report.errors[0]).toContain('Network timeout');
    expect(report.errors[1]).toContain('Insufficient balance');
  });

  it('should handle getOpenOrders failure gracefully', async () => {
    const adapter = createMockAdapter({
      getOpenOrders: vi.fn().mockRejectedValue(new Error('API down')),
    });

    const report = await ks.activate('user-1', 'api down', adapter);

    expect(await ks.isActive()).toBe(true);
    expect(report.cancelledOrders).toBe(0);
    expect(report.errors.some((e: string) => e.includes('API down'))).toBe(true);
    // Positions should still be attempted
    expect(adapter.getPositions).toHaveBeenCalledOnce();
  });

  it('should handle getPositions failure gracefully', async () => {
    const adapter = createMockAdapter({
      getPositions: vi.fn().mockRejectedValue(new Error('Position fetch failed')),
    });

    const report = await ks.activate('user-1', 'pos fail', adapter);

    expect(report.cancelledOrders).toBe(2); // Orders still cancelled
    expect(report.closedPositions).toBe(0);
    expect(report.errors.some((e: string) => e.includes('Position fetch failed'))).toBe(true);
  });

  it('should query per-symbol when activeSymbols is provided', async () => {
    const adapter = createMockAdapter({
      getOpenOrders: vi.fn()
        .mockResolvedValueOnce([{ id: 'order-1', symbol: 'BTC/USDT', side: 'buy', amount: 0.01 }])
        .mockResolvedValueOnce([{ id: 'order-2', symbol: 'ETH/USDT', side: 'buy', amount: 1.5 }]),
    });

    const report = await ks.activate('user-1', 'per-symbol', adapter, ['BTC/USDT', 'ETH/USDT']);

    expect(report.cancelledOrders).toBe(2);
    expect(adapter.getOpenOrders).toHaveBeenCalledTimes(2);
    expect(adapter.getOpenOrders).toHaveBeenCalledWith('BTC/USDT');
    expect(adapter.getOpenOrders).toHaveBeenCalledWith('ETH/USDT');
  });

  it('should continue other symbols if one symbol fails in per-symbol mode', async () => {
    const adapter = createMockAdapter({
      getOpenOrders: vi.fn()
        .mockRejectedValueOnce(new Error('BTC pair down'))
        .mockResolvedValueOnce([{ id: 'order-2', symbol: 'ETH/USDT', side: 'buy', amount: 1.5 }]),
    });

    const report = await ks.activate('user-1', 'partial', adapter, ['BTC/USDT', 'ETH/USDT']);

    expect(report.cancelledOrders).toBe(1);
    expect(report.errors.some((e: string) => e.includes('BTC pair down'))).toBe(true);
  });

  it('should deactivate and reset state', async () => {
    await ks.activate('user-1', 'test');
    expect(await ks.isActive()).toBe(true);

    await ks.deactivate('user-1');
    expect(await ks.isActive()).toBe(false);
    expect(ks.getStatus().activatedAt).toBeNull();
    expect(ks.getStatus().activatedBy).toBeNull();
    expect(ks.getStatus().reason).toBeNull();
  });
});
