import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { StocksAdapter, isMarketOpen } from '@/plugins/stocks/adapter';

describe('StocksAdapter — Twelve Data', () => {
  let adapter: StocksAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new StocksAdapter({ apiKey: 'test-key' });
  });

  // -------------------------------------------------------------------------
  // Market hours
  // -------------------------------------------------------------------------

  describe('isMarketOpen', () => {
    it('should return true during NYSE hours on weekday', () => {
      const date = new Date('2026-03-24T16:00:00Z');
      expect(isMarketOpen(date)).toBe(true);
    });

    it('should return false before market open', () => {
      const date = new Date('2026-03-24T13:00:00Z');
      expect(isMarketOpen(date)).toBe(false);
    });

    it('should return false after market close', () => {
      const date = new Date('2026-03-24T22:00:00Z');
      expect(isMarketOpen(date)).toBe(false);
    });

    it('should return false on Saturday', () => {
      const date = new Date('2026-03-28T16:00:00Z');
      expect(isMarketOpen(date)).toBe(false);
    });

    it('should return false on Sunday', () => {
      const date = new Date('2026-03-29T16:00:00Z');
      expect(isMarketOpen(date)).toBe(false);
    });

    it('should return true at market open time', () => {
      const date = new Date('2026-03-24T14:30:00Z');
      expect(isMarketOpen(date)).toBe(true);
    });

    it('should return false at market close time', () => {
      const date = new Date('2026-03-24T21:00:00Z');
      expect(isMarketOpen(date)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Quotes
  // -------------------------------------------------------------------------

  describe('getQuote', () => {
    it('should fetch a quote from Twelve Data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          symbol: 'AAPL',
          name: 'Apple Inc',
          exchange: 'NASDAQ',
          close: '195.50',
          open: '194.00',
          high: '197.00',
          low: '193.20',
          previous_close: '194.80',
          volume: '45000000',
          datetime: '2026-03-24',
        }),
      });

      const quote = await adapter.getQuote('AAPL');

      expect(quote.symbol).toBe('AAPL');
      expect(quote.price).toBe(195.50);
      expect(quote.high).toBe(197.00);
      expect(quote.low).toBe(193.20);
      expect(quote.open).toBe(194.00);
      expect(quote.previousClose).toBe(194.80);
      expect(quote.volume).toBe(45000000);
    });

    it('should throw on rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      await expect(adapter.getQuote('AAPL')).rejects.toThrow('Rate limit');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(adapter.getQuote('AAPL')).rejects.toThrow('API error');
    });
  });

  // -------------------------------------------------------------------------
  // Batch quotes
  // -------------------------------------------------------------------------

  describe('getBatchQuotes', () => {
    it('should fetch quotes for multiple symbols in one call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          AAPL: { symbol: 'AAPL', name: 'Apple', close: '195.50', open: '194', high: '197', low: '193', previous_close: '194.80', volume: '45000000', datetime: '2026-03-24' },
          MSFT: { symbol: 'MSFT', name: 'Microsoft', close: '420.00', open: '418', high: '422', low: '417', previous_close: '419.50', volume: '30000000', datetime: '2026-03-24' },
          GOOGL: { symbol: 'GOOGL', name: 'Alphabet', close: '175.00', open: '174', high: '176', low: '173', previous_close: '174.20', volume: '25000000', datetime: '2026-03-24' },
        }),
      });

      const quotes = await adapter.getBatchQuotes(['AAPL', 'MSFT', 'GOOGL']);

      expect(quotes).toHaveLength(3);
      expect(quotes[0].symbol).toBe('AAPL');
      expect(quotes[0].price).toBe(195.50);
      expect(quotes[1].symbol).toBe('MSFT');
      expect(quotes[1].price).toBe(420.00);
      expect(quotes[2].symbol).toBe('GOOGL');
      expect(quotes[2].price).toBe(175.00);
    });

    it('should handle single symbol batch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          symbol: 'AAPL', name: 'Apple', close: '195.50', open: '194', high: '197', low: '193', previous_close: '194.80', volume: '45000000', datetime: '2026-03-24',
        }),
      });

      const quotes = await adapter.getBatchQuotes(['AAPL']);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].price).toBe(195.50);
    });

    it('should skip symbols with errors in batch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          AAPL: { symbol: 'AAPL', close: '195.50', open: '194', high: '197', low: '193', previous_close: '194.80', volume: '45000000', datetime: '2026-03-24' },
          INVALID: { status: 'error', message: 'Symbol not found' },
          MSFT: { symbol: 'MSFT', close: '420', open: '418', high: '422', low: '417', previous_close: '419.50', volume: '30000000', datetime: '2026-03-24' },
        }),
      });

      const quotes = await adapter.getBatchQuotes(['AAPL', 'INVALID', 'MSFT']);
      expect(quotes).toHaveLength(2);
    });

    it('should return empty array for empty input', async () => {
      const quotes = await adapter.getBatchQuotes([]);
      expect(quotes).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Candles
  // -------------------------------------------------------------------------

  describe('getCandles', () => {
    it('should fetch candles from Twelve Data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          values: [
            { datetime: '2026-03-24', open: '194.00', high: '197.00', low: '193.20', close: '195.50', volume: '50000000' },
            { datetime: '2026-03-23', open: '193.00', high: '195.00', low: '192.00', close: '194.00', volume: '45000000' },
          ],
        }),
      });

      const candles = await adapter.getCandles('AAPL', '1day', 2);

      expect(candles).toHaveLength(2);
      expect(candles[0].close).toBe(195.50);
      expect(candles[0].volume).toBe(50000000);
      expect(candles[1].close).toBe(194.00);
    });

    it('should return empty array on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'error', message: 'No data' }),
      });

      const candles = await adapter.getCandles('INVALID');
      expect(candles).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Market status
  // -------------------------------------------------------------------------

  describe('getMarketStatus', () => {
    it('should return isOpen and exchange info', () => {
      const status = adapter.getMarketStatus();
      expect(status.exchange).toBe('NYSE');
      expect(typeof status.isOpen).toBe('boolean');
    });
  });

  // -------------------------------------------------------------------------
  // Ping
  // -------------------------------------------------------------------------

  describe('ping', () => {
    it('should return true on successful ping', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ symbol: 'AAPL', close: '195.50', open: '194', high: '197', low: '193', previous_close: '194.80', volume: '45000000' }),
      });

      expect(await adapter.ping()).toBe(true);
    });

    it('should return false on failed ping', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      expect(await adapter.ping()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Company profile
  // -------------------------------------------------------------------------

  describe('getCompanyProfile', () => {
    it('should fetch company profile', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({
          name: 'Apple Inc',
          exchange: 'NASDAQ',
          market_capitalization: '3000000',
          sector: 'Technology',
          currency: 'USD',
        }),
      });

      const profile = await adapter.getCompanyProfile('AAPL');
      expect(profile).not.toBeNull();
      expect(profile!.name).toBe('Apple Inc');
      expect(profile!.exchange).toBe('NASDAQ');
    });

    it('should return null for unknown symbol', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({}),
      });

      const profile = await adapter.getCompanyProfile('UNKNOWN');
      expect(profile).toBeNull();
    });

    it('should return null on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const profile = await adapter.getCompanyProfile('FAIL');
      expect(profile).toBeNull();
    });
  });
});
