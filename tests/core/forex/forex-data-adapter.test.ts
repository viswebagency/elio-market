import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { ForexDataAdapter, isForexMarketOpen } from '@/plugins/forex/data-adapter';

describe('ForexDataAdapter — Twelve Data', () => {
  let adapter: ForexDataAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ForexDataAdapter({ apiKey: 'test-key' });
  });

  // -------------------------------------------------------------------------
  // Market hours (24/5)
  // -------------------------------------------------------------------------

  describe('isForexMarketOpen', () => {
    it('should return true during weekday', () => {
      // Tuesday 15:00 UTC
      const date = new Date('2026-03-24T15:00:00Z');
      expect(isForexMarketOpen(date)).toBe(true);
    });

    it('should return true on Monday 00:00 UTC', () => {
      const date = new Date('2026-03-23T00:00:00Z');
      expect(isForexMarketOpen(date)).toBe(true);
    });

    it('should return true on Friday before 22:00 UTC', () => {
      const date = new Date('2026-03-27T21:00:00Z');
      expect(isForexMarketOpen(date)).toBe(true);
    });

    it('should return false on Friday at 22:00 UTC', () => {
      const date = new Date('2026-03-27T22:00:00Z');
      expect(isForexMarketOpen(date)).toBe(false);
    });

    it('should return false on Saturday', () => {
      const date = new Date('2026-03-28T12:00:00Z');
      expect(isForexMarketOpen(date)).toBe(false);
    });

    it('should return false on Sunday before 22:00 UTC', () => {
      const date = new Date('2026-03-29T12:00:00Z');
      expect(isForexMarketOpen(date)).toBe(false);
    });

    it('should return true on Sunday at 22:00 UTC (market opens)', () => {
      const date = new Date('2026-03-29T22:00:00Z');
      expect(isForexMarketOpen(date)).toBe(true);
    });

    it('should return true on Sunday at 23:00 UTC', () => {
      const date = new Date('2026-03-29T23:00:00Z');
      expect(isForexMarketOpen(date)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Quotes
  // -------------------------------------------------------------------------

  describe('getQuote', () => {
    it('should fetch a forex quote from Twelve Data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          symbol: 'EUR/USD',
          name: 'Euro/US Dollar',
          close: '1.0850',
          open: '1.0820',
          high: '1.0880',
          low: '1.0810',
          previous_close: '1.0830',
          datetime: '2026-03-24',
        }),
      });

      const quote = await adapter.getQuote('EURUSD');

      expect(quote.symbol).toBe('EURUSD');
      expect(quote.base).toBe('EUR');
      expect(quote.quote).toBe('USD');
      // Price should be close to 1.0850 (bid/ask spread applied)
      expect(quote.bid).toBeGreaterThan(1.08);
      expect(quote.ask).toBeGreaterThan(quote.bid);
    });

    it('should throw on rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      await expect(adapter.getQuote('EURUSD')).rejects.toThrow('Rate limit');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(adapter.getQuote('EURUSD')).rejects.toThrow('API error');
    });
  });

  // -------------------------------------------------------------------------
  // Batch quotes
  // -------------------------------------------------------------------------

  describe('getBatchQuotes', () => {
    it('should fetch quotes for multiple pairs in one call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          'EUR/USD': { symbol: 'EUR/USD', close: '1.0850', open: '1.0820', high: '1.0880', low: '1.0810', previous_close: '1.0830', datetime: '2026-03-24' },
          'GBP/USD': { symbol: 'GBP/USD', close: '1.2650', open: '1.2620', high: '1.2680', low: '1.2600', previous_close: '1.2640', datetime: '2026-03-24' },
          'USD/JPY': { symbol: 'USD/JPY', close: '150.50', open: '150.20', high: '150.80', low: '150.00', previous_close: '150.30', datetime: '2026-03-24' },
        }),
      });

      const quotes = await adapter.getBatchQuotes(['EURUSD', 'GBPUSD', 'USDJPY']);

      expect(quotes).toHaveLength(3);
      expect(quotes[0].symbol).toBe('EURUSD');
      expect(quotes[1].symbol).toBe('GBPUSD');
      expect(quotes[2].symbol).toBe('USDJPY');
    });

    it('should handle single pair batch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          symbol: 'EUR/USD',
          close: '1.0850',
          open: '1.0820',
          high: '1.0880',
          low: '1.0810',
          previous_close: '1.0830',
          datetime: '2026-03-24',
        }),
      });

      const quotes = await adapter.getBatchQuotes(['EURUSD']);
      expect(quotes).toHaveLength(1);
    });

    it('should skip pairs with errors in batch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          'EUR/USD': { symbol: 'EUR/USD', close: '1.0850', open: '1.0820', high: '1.0880', low: '1.0810', previous_close: '1.0830', datetime: '2026-03-24' },
          'INVALID/X': { status: 'error', message: 'Symbol not found' },
          'GBP/USD': { symbol: 'GBP/USD', close: '1.2650', open: '1.2620', high: '1.2680', low: '1.2600', previous_close: '1.2640', datetime: '2026-03-24' },
        }),
      });

      const quotes = await adapter.getBatchQuotes(['EURUSD', 'INVALIDX', 'GBPUSD']);
      expect(quotes).toHaveLength(2);
    });

    it('should return empty array for empty input', async () => {
      const quotes = await adapter.getBatchQuotes([]);
      expect(quotes).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Ping
  // -------------------------------------------------------------------------

  describe('ping', () => {
    it('should return true on successful ping', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ symbol: 'EUR/USD', close: '1.0850', open: '1.0820', high: '1.0880', low: '1.0810', previous_close: '1.0830' }),
      });

      expect(await adapter.ping()).toBe(true);
    });

    it('should return false on failed ping', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      expect(await adapter.ping()).toBe(false);
    });
  });
});
