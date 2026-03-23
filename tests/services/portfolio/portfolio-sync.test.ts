/**
 * Tests for Portfolio Sync — DB vs exchange position comparison.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock audit logger
vi.mock('@/services/execution/audit-logger', () => ({
  auditLogger: {
    logKillSwitch: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Telegram
const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
vi.mock('@/lib/telegram', () => ({
  getTelegramClient: () => ({
    sendMessage: mockSendMessage,
  }),
}));

import {
  syncPortfolio,
  alertDivergence,
  PortfolioDbClient,
  DbPosition,
  PortfolioSyncResult,
} from '@/services/portfolio/portfolio-sync';
import { auditLogger } from '@/services/execution/audit-logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Record<string, unknown> = {}) {
  return {
    getPositions: vi.fn().mockResolvedValue([
      { symbol: 'BTC/USDT', amount: 0.05, avgEntryPrice: undefined, currentPrice: 60000, pnl: undefined },
      { symbol: 'ETH/USDT', amount: 2.5, avgEntryPrice: undefined, currentPrice: 3000, pnl: undefined },
    ]),
    getBalances: vi.fn().mockResolvedValue([
      { asset: 'BTC', free: 0.05, locked: 0, total: 0.05, btcValue: 0 },
      { asset: 'ETH', free: 2.5, locked: 0, total: 2.5, btcValue: 0 },
      { asset: 'USDT', free: 5000, locked: 0, total: 5000, btcValue: 0 },
    ]),
    ...overrides,
  } as any;
}

function createMockDbClient(positions: DbPosition[]): PortfolioDbClient {
  return {
    getOpenLivePositions: vi.fn().mockResolvedValue(positions),
  };
}

const dbPositionsMatching: DbPosition[] = [
  { id: 'pos-1', asset_symbol: 'BTCUSDT', quantity: 0.05, status: 'open', direction: 'long' },
  { id: 'pos-2', asset_symbol: 'ETH/USDT', quantity: 2.5, status: 'open', direction: 'long' },
];

// ---------------------------------------------------------------------------
// Tests — syncPortfolio
// ---------------------------------------------------------------------------

describe('syncPortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should report in sync when DB and exchange match', async () => {
    const adapter = createMockAdapter();
    const dbClient = createMockDbClient(dbPositionsMatching);

    const result = await syncPortfolio(adapter, 'user-1', dbClient);

    expect(result.inSync).toBe(true);
    expect(result.phantomPositions).toHaveLength(0);
    expect(result.untrackedPositions).toHaveLength(0);
    expect(result.mismatches).toHaveLength(0);
    expect(result.usdtBalance.actual).toBe(5000);
  });

  it('should detect phantom positions (in DB but not on exchange)', async () => {
    const adapter = createMockAdapter({
      getPositions: vi.fn().mockResolvedValue([
        // Only BTC, no ETH
        { symbol: 'BTC/USDT', amount: 0.05, avgEntryPrice: undefined, currentPrice: 60000, pnl: undefined },
      ]),
      getBalances: vi.fn().mockResolvedValue([
        { asset: 'BTC', free: 0.05, locked: 0, total: 0.05, btcValue: 0 },
        { asset: 'USDT', free: 5000, locked: 0, total: 5000, btcValue: 0 },
      ]),
    });
    const dbClient = createMockDbClient(dbPositionsMatching);

    const result = await syncPortfolio(adapter, 'user-1', dbClient);

    expect(result.inSync).toBe(false);
    expect(result.phantomPositions).toHaveLength(1);
    expect(result.phantomPositions[0].asset_symbol).toBe('ETH/USDT');
  });

  it('should detect untracked positions (on exchange but not in DB)', async () => {
    const adapter = createMockAdapter();
    // Only BTC in DB, but ETH also on exchange
    const dbClient = createMockDbClient([
      { id: 'pos-1', asset_symbol: 'BTCUSDT', quantity: 0.05, status: 'open', direction: 'long' },
    ]);

    const result = await syncPortfolio(adapter, 'user-1', dbClient);

    expect(result.inSync).toBe(false);
    expect(result.untrackedPositions).toHaveLength(1);
    expect(result.untrackedPositions[0].symbol).toBe('ETH/USDT');
  });

  it('should detect quantity mismatch', async () => {
    const adapter = createMockAdapter({
      getPositions: vi.fn().mockResolvedValue([
        { symbol: 'BTC/USDT', amount: 0.08, avgEntryPrice: undefined, currentPrice: 60000, pnl: undefined },
        { symbol: 'ETH/USDT', amount: 2.5, avgEntryPrice: undefined, currentPrice: 3000, pnl: undefined },
      ]),
      getBalances: vi.fn().mockResolvedValue([
        { asset: 'BTC', free: 0.08, locked: 0, total: 0.08, btcValue: 0 },
        { asset: 'ETH', free: 2.5, locked: 0, total: 2.5, btcValue: 0 },
        { asset: 'USDT', free: 5000, locked: 0, total: 5000, btcValue: 0 },
      ]),
    });
    const dbClient = createMockDbClient(dbPositionsMatching);

    const result = await syncPortfolio(adapter, 'user-1', dbClient);

    expect(result.inSync).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].symbol).toBe('BTC');
    expect(result.mismatches[0].dbQuantity).toBe(0.05);
    expect(result.mismatches[0].exchangeQuantity).toBe(0.08);
  });

  it('should ignore dust differences below 0.1% tolerance', async () => {
    const adapter = createMockAdapter({
      getPositions: vi.fn().mockResolvedValue([
        // 0.05 * 0.001 = 0.00005 → diff = 0.00005/0.05 = 0.1% exactly
        { symbol: 'BTC/USDT', amount: 0.050005, avgEntryPrice: undefined, currentPrice: 60000, pnl: undefined },
        { symbol: 'ETH/USDT', amount: 2.5, avgEntryPrice: undefined, currentPrice: 3000, pnl: undefined },
      ]),
      getBalances: vi.fn().mockResolvedValue([
        { asset: 'BTC', free: 0.050005, locked: 0, total: 0.050005, btcValue: 0 },
        { asset: 'ETH', free: 2.5, locked: 0, total: 2.5, btcValue: 0 },
        { asset: 'USDT', free: 5000, locked: 0, total: 5000, btcValue: 0 },
      ]),
    });
    const dbClient = createMockDbClient(dbPositionsMatching);

    const result = await syncPortfolio(adapter, 'user-1', dbClient);

    // 0.00005 / 0.050005 = 0.0999% < 0.1% → dust, should be in sync
    expect(result.inSync).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it('should handle empty DB and empty exchange', async () => {
    const adapter = createMockAdapter({
      getPositions: vi.fn().mockResolvedValue([]),
      getBalances: vi.fn().mockResolvedValue([
        { asset: 'USDT', free: 1000, locked: 0, total: 1000, btcValue: 0 },
      ]),
    });
    const dbClient = createMockDbClient([]);

    const result = await syncPortfolio(adapter, 'user-1', dbClient);

    expect(result.inSync).toBe(true);
    expect(result.usdtBalance.actual).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Tests — alertDivergence
// ---------------------------------------------------------------------------

describe('alertDivergence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not send alert when in sync', async () => {
    const syncResult: PortfolioSyncResult = {
      inSync: true,
      phantomPositions: [],
      untrackedPositions: [],
      mismatches: [],
      dbPositions: [],
      exchangePositions: [],
      usdtBalance: { expected: 0, actual: 5000 },
    };

    await alertDivergence(syncResult, 'user-1');

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(auditLogger.logKillSwitch).not.toHaveBeenCalled();
  });

  it('should send alert and log when divergences exist', async () => {
    const syncResult: PortfolioSyncResult = {
      inSync: false,
      phantomPositions: [
        { id: 'p1', asset_symbol: 'SOL/USDT', quantity: 10, status: 'open', direction: 'long' },
      ],
      untrackedPositions: [
        { symbol: 'DOGE/USDT', amount: 1000, avgEntryPrice: undefined, currentPrice: 0.15, pnl: undefined },
      ],
      mismatches: [
        { symbol: 'BTC', dbQuantity: 0.05, exchangeQuantity: 0.08, diffPct: 60 },
      ],
      dbPositions: [],
      exchangePositions: [],
      usdtBalance: { expected: 0, actual: 5000 },
    };

    await alertDivergence(syncResult, 'user-1');

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const message = mockSendMessage.mock.calls[0][1] as string;
    expect(message).toContain('DIVERGENZA RILEVATA');
    expect(message).toContain('SOL/USDT');
    expect(message).toContain('DOGE/USDT');
    expect(message).toContain('BTC');

    expect(auditLogger.logKillSwitch).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('1 phantom'),
    );
  });
});
