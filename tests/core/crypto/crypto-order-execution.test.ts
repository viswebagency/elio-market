import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ccxt with order execution support
vi.mock('ccxt', () => {
  class MockExchange {
    id: string;
    apiKey: string | undefined;
    markets: Record<string, unknown> = {};

    constructor(public opts: Record<string, unknown> = {}) {
      this.id = 'mock';
      this.apiKey = opts.apiKey as string | undefined;
    }

    setSandboxMode() {}
    async loadMarkets() { return {}; }

    async fetchTicker() {
      return {
        symbol: 'BTC/USDT', last: 65000, bid: 64990, ask: 65010,
        high: 66000, low: 64000, baseVolume: 1000, quoteVolume: 65000000,
        change: 100, percentage: 0.15, datetime: new Date().toISOString(),
      };
    }

    async fetchBalance() {
      return {
        total: { USDT: 1000, BTC: 0.5, ETH: 2.0 },
        free: { USDT: 900, BTC: 0.5, ETH: 2.0 },
        used: { USDT: 100, BTC: 0, ETH: 0 },
      };
    }

    async createOrder(symbol: string, type: string, side: string, amount: number, price?: number) {
      return {
        id: 'order-123',
        symbol,
        type,
        side,
        amount,
        price: type === 'market' ? 65000 : price,
        filled: type === 'market' ? amount : 0,
        remaining: type === 'market' ? 0 : amount,
        average: type === 'market' ? 65000 : undefined,
        status: type === 'market' ? 'closed' : 'open',
        fee: { cost: 0.65, currency: 'USDT' },
        fees: [],
        datetime: new Date().toISOString(),
      };
    }

    async cancelOrder(orderId: string) {
      if (orderId === 'invalid-id') throw new Error('Order not found');
      return { id: orderId, status: 'canceled' };
    }

    async fetchOrder(orderId: string) {
      if (orderId === 'partial-fill') {
        return {
          id: orderId, status: 'open', filled: 0.3, remaining: 0.7,
          average: 64500, price: 64000, amount: 1.0,
          fee: { cost: 0.32, currency: 'USDT' }, fees: [],
        };
      }
      return {
        id: orderId, status: 'closed', filled: 1.0, remaining: 0,
        average: 65000, price: 65000, amount: 1.0,
        fee: { cost: 0.65, currency: 'USDT' }, fees: [],
      };
    }

    async fetchOpenOrders() {
      return [
        { id: 'open-1', symbol: 'BTC/USDT', type: 'limit', side: 'buy', amount: 0.5, price: 60000, status: 'open' },
        { id: 'open-2', symbol: 'ETH/USDT', type: 'limit', side: 'sell', amount: 1.0, price: 4000, status: 'open' },
      ];
    }
  }

  return {
    default: {
      binance: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'binance'; } },
      bybit: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'bybit'; } },
    },
    binance: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'binance'; } },
    bybit: class extends MockExchange { constructor(opts: Record<string, unknown>) { super(opts); this.id = 'bybit'; } },
  };
});

import { CryptoAdapter } from '@/plugins/crypto/adapter';

describe('CryptoAdapter — Order Execution', () => {
  let adapter: CryptoAdapter;

  beforeEach(() => {
    adapter = new CryptoAdapter({
      exchange: 'binance',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    });
  });

  // --- Authentication guard ---

  it('should throw if not authenticated on placeTrade', async () => {
    const noAuth = new CryptoAdapter({ exchange: 'binance' });
    await expect(noAuth.placeTrade({ symbol: 'BTC/USDT', side: 'buy', type: 'market', amount: 0.1 }))
      .rejects.toThrow('not authenticated');
  });

  it('should throw if not authenticated on cancelOrder', async () => {
    const noAuth = new CryptoAdapter({ exchange: 'binance' });
    await expect(noAuth.cancelOrder('order-123', 'BTC/USDT'))
      .rejects.toThrow('not authenticated');
  });

  it('should throw if not authenticated on getOrderStatus', async () => {
    const noAuth = new CryptoAdapter({ exchange: 'binance' });
    await expect(noAuth.getOrderStatus('order-123', 'BTC/USDT'))
      .rejects.toThrow('not authenticated');
  });

  it('should throw if not authenticated on getOpenOrders', async () => {
    const noAuth = new CryptoAdapter({ exchange: 'binance' });
    await expect(noAuth.getOpenOrders())
      .rejects.toThrow('not authenticated');
  });

  it('should throw if not authenticated on getPositions', async () => {
    const noAuth = new CryptoAdapter({ exchange: 'binance' });
    await expect(noAuth.getPositions())
      .rejects.toThrow('not authenticated');
  });

  // --- placeTrade ---

  it('should place a market order', async () => {
    const result = await adapter.placeTrade({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      amount: 0.1,
    });

    expect(result.orderId).toBe('order-123');
    expect(result.symbol).toBe('BTC/USDT');
    expect(result.side).toBe('buy');
    expect(result.type).toBe('market');
    expect(result.amount).toBe(0.1);
    expect(result.filledAmount).toBe(0.1);
    expect(result.avgFillPrice).toBe(65000);
    expect(result.status).toBe('closed');
    expect(result.fees).toBe(0.65);
    expect(result.timestamp).toBeTruthy();
  });

  it('should place a limit order', async () => {
    const result = await adapter.placeTrade({
      symbol: 'BTC/USDT',
      side: 'sell',
      type: 'limit',
      amount: 0.5,
      price: 70000,
    });

    expect(result.orderId).toBe('order-123');
    expect(result.side).toBe('sell');
    expect(result.type).toBe('limit');
    expect(result.price).toBe(70000);
    expect(result.filledAmount).toBe(0);
    expect(result.status).toBe('open');
  });

  it('should throw if limit order has no price', async () => {
    await expect(adapter.placeTrade({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.1,
    })).rejects.toThrow('Limit orders require a price');
  });

  // --- cancelOrder ---

  it('should cancel an order successfully', async () => {
    const result = await adapter.cancelOrder('order-123', 'BTC/USDT');
    expect(result.success).toBe(true);
    expect(result.orderId).toBe('order-123');
  });

  it('should return failure when cancel fails', async () => {
    const result = await adapter.cancelOrder('invalid-id', 'BTC/USDT');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Order not found');
  });

  // --- getOrderStatus ---

  it('should get order status for a filled order', async () => {
    const result = await adapter.getOrderStatus('order-123', 'BTC/USDT');
    expect(result.orderId).toBe('order-123');
    expect(result.status).toBe('closed');
    expect(result.filledAmount).toBe(1.0);
    expect(result.remainingAmount).toBe(0);
    expect(result.avgFillPrice).toBe(65000);
    expect(result.fees).toBe(0.65);
  });

  it('should get order status for a partial fill', async () => {
    const result = await adapter.getOrderStatus('partial-fill', 'BTC/USDT');
    expect(result.orderId).toBe('partial-fill');
    expect(result.status).toBe('open');
    expect(result.filledAmount).toBe(0.3);
    expect(result.remainingAmount).toBe(0.7);
    expect(result.avgFillPrice).toBe(64500);
    expect(result.fees).toBe(0.32);
  });

  // --- getOpenOrders ---

  it('should list open orders', async () => {
    const orders = await adapter.getOpenOrders();
    expect(orders).toHaveLength(2);
    expect(orders[0].id).toBe('open-1');
    expect(orders[1].id).toBe('open-2');
  });

  // --- getPositions ---

  it('should return spot positions (excluding USDT)', async () => {
    const positions = await adapter.getPositions();
    // BTC and ETH should be there, USDT should be excluded
    expect(positions.length).toBeGreaterThanOrEqual(1);
    const btcPos = positions.find(p => p.symbol === 'BTC/USDT');
    expect(btcPos).toBeDefined();
    expect(btcPos!.amount).toBe(0.5);
    expect(btcPos!.currentPrice).toBe(65000);
    // avgEntryPrice is undefined for spot
    expect(btcPos!.avgEntryPrice).toBeUndefined();
  });

  // --- Sandbox mode ---

  it('should work in sandbox mode', async () => {
    const sandboxAdapter = new CryptoAdapter({
      exchange: 'binance',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      sandbox: true,
    });

    const result = await sandboxAdapter.placeTrade({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      amount: 0.01,
    });

    expect(result.orderId).toBe('order-123');
    expect(result.status).toBe('closed');
  });
});
