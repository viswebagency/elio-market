import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabaseFrom = vi.fn();
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({ from: mockSupabaseFrom }),
}));

import { BetfairPaperTradingManager, BETFAIR_L1_STRATEGY_CODES, BETFAIR_L1_DEFAULT_CAPITAL } from '@/core/paper-trading/betfair-manager';
import { BETFAIR_STRATEGIES, BETFAIR_STRATEGY_MAP } from '@/core/strategies/betfair-strategies';
import { MarketSnapshot } from '@/core/engine/evaluator';

function createBetfairSnapshots(): MarketSnapshot[] {
  return [
    { marketId: 'BF:SOCCER_FAV1', name: 'Man City ML', price: 1.45, volume24hUsd: 50000, totalVolumeUsd: 250000, expiryDate: null, hasCatalyst: false, catalystDescription: null, category: 'soccer', status: 'open', priceChange24hPct: -3, high24h: 1.55, low24h: 1.40 },
    { marketId: 'BF:SOCCER_OUT', name: 'Bournemouth ML', price: 8.00, volume24hUsd: 10000, totalVolumeUsd: 50000, expiryDate: null, hasCatalyst: false, catalystDescription: null, category: 'soccer', status: 'open', priceChange24hPct: 5, high24h: 9.00, low24h: 7.50 },
    { marketId: 'BF:TENNIS_FAV', name: 'Sinner ML', price: 1.35, volume24hUsd: 25000, totalVolumeUsd: 125000, expiryDate: null, hasCatalyst: false, catalystDescription: null, category: 'tennis', status: 'open', priceChange24hPct: -2, high24h: 1.40, low24h: 1.30 },
  ];
}

function setupMockDb() {
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'betfair_paper_sessions') {
      return {
        insert: (data: Record<string, unknown>) => ({
          select: () => ({
            single: () => Promise.resolve({
              data: { id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, started_at: new Date().toISOString(), ...data },
              error: null,
            }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        select: () => ({ eq: () => ({ then: (resolve: (v: { data: never[] }) => void) => resolve({ data: [] }) }), order: () => Promise.resolve({ data: [], error: null }) }),
      };
    }
    return { insert: () => Promise.resolve({ error: null }), update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }), select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) };
  });
}

describe('BetfairPaperTradingManager', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should start a session for each strategy', async () => {
    setupMockDb();
    const manager = new BetfairPaperTradingManager();
    for (const seed of BETFAIR_STRATEGIES) {
      const session = await manager.startSession(seed, 1000);
      expect(session.sessionId).toBeTruthy();
      expect(session.status).toBe('running');
      expect(session.initialCapital).toBe(1000);
    }
    expect(manager.getActiveSessions()).toHaveLength(BETFAIR_STRATEGIES.length);
  });

  it('should stop a session', async () => {
    setupMockDb();
    const manager = new BetfairPaperTradingManager();
    const session = await manager.startSession(BETFAIR_STRATEGIES[0], 500);
    expect(manager.getActiveSessions()).toHaveLength(1);
    await manager.stopSession(session.sessionId);
    expect(manager.getActiveSessions()).toHaveLength(0);
  });

  it('should tick with snapshots', async () => {
    setupMockDb();
    const manager = new BetfairPaperTradingManager();
    await manager.startSession(BETFAIR_STRATEGY_MAP['BF-C01']!, 1000);
    const results = manager.tickWithSnapshots(createBetfairSnapshots());
    expect(results).toHaveLength(1);
    expect(results[0].strategyCode).toBe('BF-C01');
    expect(results[0].errors).toHaveLength(0);
  });

  it('should get overview', async () => {
    setupMockDb();
    const manager = new BetfairPaperTradingManager();
    await manager.startSession(BETFAIR_STRATEGIES[0], 500);
    await manager.startSession(BETFAIR_STRATEGIES[1], 500);
    const overview = manager.getOverview();
    expect(overview.totalSessions).toBe(2);
    expect(overview.activeSessions).toBe(2);
    expect(overview.totalCapital).toBe(1000);
  });

  it('should auto-start L1 strategies', async () => {
    setupMockDb();
    const manager = new BetfairPaperTradingManager();
    const started = await manager.autoStartL1Sessions();
    expect(started).toHaveLength(BETFAIR_L1_STRATEGY_CODES.length);
  });

  it('should not duplicate already running strategies', async () => {
    setupMockDb();
    const manager = new BetfairPaperTradingManager();
    await manager.autoStartL1Sessions();
    const secondStart = await manager.autoStartL1Sessions();
    expect(secondStart).toHaveLength(0);
  });
});
