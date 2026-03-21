import { describe, it, expect, vi } from 'vitest';

// Mock ccxt to avoid Starknet hash error in test environment
vi.mock('ccxt', () => {
  class MockExchange {
    id: string;
    markets: Record<string, unknown> = {};
    constructor(public opts: Record<string, unknown> = {}) {
      this.id = 'mock';
    }
    setSandboxMode() {}
    async loadMarkets() { return {}; }
    async fetchTicker() { return { symbol: 'BTC/USDT', last: 65000, bid: 64990, ask: 65010, high: 66000, low: 64000, baseVolume: 1000, quoteVolume: 65000000, change: 100, percentage: 0.15, datetime: new Date().toISOString() }; }
    async fetchTickers() { return {}; }
    async fetchOHLCV() { return [[Date.now(), 65000, 66000, 64000, 65500, 1000]]; }
    async fetchOrderBook() { return { bids: [[64990, 1]], asks: [[65010, 1]], timestamp: Date.now() }; }
    async fetchBalance() { return { total: { USDT: 1000, BTC: 0.01 }, free: { USDT: 900, BTC: 0.01 }, used: { USDT: 100, BTC: 0 } }; }
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

import { CryptoAdapter, SupportedExchange } from '@/plugins/crypto/adapter';

describe('CryptoAdapter — Unit tests', () => {
  it('should create binance adapter', () => {
    const adapter = new CryptoAdapter({ exchange: 'binance' });
    expect(adapter.id).toBe('binance');
  });

  it('should create bybit adapter', () => {
    const adapter = new CryptoAdapter({ exchange: 'bybit' });
    expect(adapter.id).toBe('bybit');
  });

  it('should throw for unsupported exchange', () => {
    expect(() => new CryptoAdapter({ exchange: 'invalid' as SupportedExchange }))
      .toThrow('Unsupported exchange');
  });

  it('should expose raw exchange instance', () => {
    const adapter = new CryptoAdapter({ exchange: 'binance' });
    const raw = adapter.getRawExchange();
    expect(raw).toBeDefined();
    expect(raw.id).toBe('binance');
  });

  it('should get ticker', async () => {
    const adapter = new CryptoAdapter({ exchange: 'binance' });
    const ticker = await adapter.getTicker('BTC/USDT');
    expect(ticker.price).toBeGreaterThan(0);
    expect(ticker.symbol).toBeTruthy();
  });

  it('should get candles', async () => {
    const adapter = new CryptoAdapter({ exchange: 'binance' });
    const candles = await adapter.getCandles('BTC/USDT', '1h', 1);
    expect(candles).toHaveLength(1);
    expect(candles[0].open).toBeGreaterThan(0);
    expect(candles[0].close).toBeGreaterThan(0);
  });

  it('should get order book', async () => {
    const adapter = new CryptoAdapter({ exchange: 'binance' });
    const book = await adapter.getOrderBook('BTC/USDT', 5);
    expect(book.bids.length).toBeGreaterThan(0);
    expect(book.asks.length).toBeGreaterThan(0);
  });

  it('should get balances', async () => {
    const adapter = new CryptoAdapter({ exchange: 'binance' });
    const balances = await adapter.getBalances();
    expect(balances.length).toBeGreaterThan(0);
    expect(balances[0].asset).toBeTruthy();
  });

  it('should ping', async () => {
    const adapter = new CryptoAdapter({ exchange: 'binance' });
    const result = await adapter.ping();
    expect(result).toBe(true);
  });
});
