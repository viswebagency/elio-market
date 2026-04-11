import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase admin client
const mockSupabaseFrom = vi.fn();
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({
    from: mockSupabaseFrom,
  }),
}));

import { StockPaperTradingManager, STOCK_L1_STRATEGY_CODES, STOCK_L1_DEFAULT_CAPITAL } from '@/core/paper-trading/stock-manager';
import { STOCK_STRATEGIES, STOCK_STRATEGY_MAP } from '@/core/strategies/stock-strategies';
import { MarketSnapshot } from '@/core/engine/evaluator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStockSnapshots(): MarketSnapshot[] {
  return [
    {
      marketId: 'STK:AAPL',
      name: 'AAPL',
      price: 195,
      volume24hUsd: 300_000_000,
      totalVolumeUsd: 3_000_000_000,
      expiryDate: null,
      hasCatalyst: false,
      catalystDescription: null,
      category: 'mega_cap',
      status: 'open',
      priceChange24hPct: -2.5,
      high24h: 198,
      low24h: 192,
    },
    {
      marketId: 'STK:MSFT',
      name: 'MSFT',
      price: 420,
      volume24hUsd: 250_000_000,
      totalVolumeUsd: 2_500_000_000,
      expiryDate: null,
      hasCatalyst: false,
      catalystDescription: null,
      category: 'mega_cap',
      status: 'open',
      priceChange24hPct: -3.0,
      high24h: 430,
      low24h: 415,
    },
    {
      marketId: 'STK:NVDA',
      name: 'NVDA',
      price: 880,
      volume24hUsd: 200_000_000,
      totalVolumeUsd: 2_000_000_000,
      expiryDate: null,
      hasCatalyst: false,
      catalystDescription: null,
      category: 'growth',
      status: 'open',
      priceChange24hPct: 5,
      high24h: 900,
      low24h: 850,
    },
  ];
}

interface DbCallLog {
  inserts: Map<string, Record<string, unknown>[]>;
  updates: Map<string, Record<string, unknown>[]>;
}

function createDbCallLog(): DbCallLog {
  return { inserts: new Map(), updates: new Map() };
}

function setupMockDb(options: { existingRows?: Record<string, unknown>[]; callLog?: DbCallLog } = {}) {
  const { existingRows = [], callLog } = options;

  mockSupabaseFrom.mockImplementation((table: string) => {
    const chainableUpdate = (data: Record<string, unknown>) => {
      if (callLog) {
        const arr = callLog.updates.get(table) ?? [];
        arr.push(data);
        callLog.updates.set(table, arr);
      }
      return {
        eq: () => chainableUpdate(data),
      };
    };

    if (table === 'stock_paper_sessions') {
      return {
        insert: (data: Record<string, unknown>) => {
          if (callLog) {
            const arr = callLog.inserts.get(table) ?? [];
            arr.push(data);
            callLog.inserts.set(table, arr);
          }
          return {
            select: () => ({
              single: () => Promise.resolve({
                data: { id: `mock-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, started_at: new Date().toISOString(), ...data },
                error: null,
              }),
            }),
          };
        },
        update: (data: Record<string, unknown>) => {
          if (callLog) {
            const arr = callLog.updates.get(table) ?? [];
            arr.push(data);
            callLog.updates.set(table, arr);
          }
          return {
            eq: () => Promise.resolve({ error: null }),
          };
        },
        select: () => ({
          eq: () => ({
            then: (resolve: (v: { data: Record<string, unknown>[] }) => void) => resolve({ data: existingRows }),
          }),
          order: () => Promise.resolve({ data: existingRows, error: null }),
        }),
      };
    }

    if (table === 'stock_paper_positions' || table === 'stock_paper_trades' || table === 'paper_trading_snapshots') {
      return {
        insert: (data: Record<string, unknown>) => {
          if (callLog) {
            const arr = callLog.inserts.get(table) ?? [];
            arr.push(data);
            callLog.inserts.set(table, arr);
          }
          return Promise.resolve({ error: null });
        },
        update: (data: Record<string, unknown>) => chainableUpdate(data),
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      };
    }

    return { select: () => ({ eq: () => Promise.resolve({ data: null }) }) };
  });
}

// ---------------------------------------------------------------------------
// Tests — Core functionality
// ---------------------------------------------------------------------------

describe('StockPaperTradingManager — Core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start a session for each strategy', async () => {
    setupMockDb();
    const manager = new StockPaperTradingManager();

    for (const seed of STOCK_STRATEGIES) {
      const session = await manager.startSession(seed, 1000);
      expect(session.sessionId).toBeTruthy();
      expect(session.status).toBe('running');
      expect(session.initialCapital).toBe(1000);
      expect(session.tickers).toEqual(seed.tickers);
    }

    expect(manager.getActiveSessions()).toHaveLength(STOCK_STRATEGIES.length);
  });

  it('should stop a session', async () => {
    setupMockDb();
    const manager = new StockPaperTradingManager();

    const session = await manager.startSession(STOCK_STRATEGIES[0], 500);
    expect(manager.getActiveSessions()).toHaveLength(1);

    await manager.stopSession(session.sessionId);
    expect(manager.getActiveSessions()).toHaveLength(0);
  });

  it('should tick with snapshots (sync, no DB)', async () => {
    setupMockDb();
    const manager = new StockPaperTradingManager();

    const seed = STOCK_STRATEGY_MAP['ST-C01'];
    await manager.startSession(seed!, 1000);

    const snapshots = createStockSnapshots();
    const results = manager.tickWithSnapshots(snapshots);

    expect(results).toHaveLength(1);
    expect(results[0].strategyCode).toBe('ST-C01');
    expect(results[0].tickersEvaluated).toBeGreaterThan(0);
    expect(results[0].portfolioValue).toBeGreaterThan(0);
    expect(results[0].errors).toHaveLength(0);
  });

  it('should get overview', async () => {
    setupMockDb();
    const manager = new StockPaperTradingManager();

    await manager.startSession(STOCK_STRATEGIES[0], 500);
    await manager.startSession(STOCK_STRATEGIES[1], 500);

    const overview = manager.getOverview();
    expect(overview.totalSessions).toBe(2);
    expect(overview.activeSessions).toBe(2);
    expect(overview.totalCapital).toBe(1000);
    expect(overview.sessions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Tests — Auto-start L1
// ---------------------------------------------------------------------------

describe('StockPaperTradingManager — Auto-start L1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should auto-start L1 strategy sessions', async () => {
    setupMockDb();
    const manager = new StockPaperTradingManager();

    const started = await manager.autoStartL1Sessions();

    expect(started).toHaveLength(STOCK_L1_STRATEGY_CODES.length);
    expect(manager.getActiveSessions()).toHaveLength(STOCK_L1_STRATEGY_CODES.length);
  });

  it('should not duplicate already running strategies', async () => {
    setupMockDb();
    const manager = new StockPaperTradingManager();

    await manager.autoStartL1Sessions();
    const secondStart = await manager.autoStartL1Sessions();

    expect(secondStart).toHaveLength(0);
    expect(manager.getActiveSessions()).toHaveLength(STOCK_L1_STRATEGY_CODES.length);
  });

  it('should use default capital of 100', async () => {
    const callLog = createDbCallLog();
    setupMockDb({ callLog });
    const manager = new StockPaperTradingManager();

    await manager.autoStartL1Sessions();

    const inserts = callLog.inserts.get('stock_paper_sessions') ?? [];
    expect(inserts.length).toBe(STOCK_L1_STRATEGY_CODES.length);
    for (const insert of inserts) {
      expect(insert.initial_capital).toBe(STOCK_L1_DEFAULT_CAPITAL);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — DB persistence
// ---------------------------------------------------------------------------

describe('StockPaperTradingManager — DB Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should persist session on startSession', async () => {
    const callLog = createDbCallLog();
    setupMockDb({ callLog });
    const manager = new StockPaperTradingManager();

    await manager.startSession(STOCK_STRATEGIES[0], 500);

    const inserts = callLog.inserts.get('stock_paper_sessions') ?? [];
    expect(inserts).toHaveLength(1);
    expect(inserts[0].strategy_code).toBe(STOCK_STRATEGIES[0].code);
    expect(inserts[0].initial_capital).toBe(500);
    expect(inserts[0].status).toBe('running');
  });

  it('should update session on stopSession', async () => {
    const callLog = createDbCallLog();
    setupMockDb({ callLog });
    const manager = new StockPaperTradingManager();

    const session = await manager.startSession(STOCK_STRATEGIES[0], 500);
    await manager.stopSession(session.sessionId);

    const updates = callLog.updates.get('stock_paper_sessions') ?? [];
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const stopUpdate = updates.find((u) => u.status === 'stopped');
    expect(stopUpdate).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — Tick with multiple strategies
// ---------------------------------------------------------------------------

describe('StockPaperTradingManager — Multi-strategy tick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should tick all active sessions', async () => {
    setupMockDb();
    const manager = new StockPaperTradingManager();

    await manager.startSession(STOCK_STRATEGIES[0], 1000);
    await manager.startSession(STOCK_STRATEGIES[1], 1000);

    const snapshots = createStockSnapshots();
    const results = manager.tickWithSnapshots(snapshots);

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.errors).toHaveLength(0);
      expect(r.portfolioValue).toBeGreaterThan(0);
    }
  });

  it('should skip stopped sessions', async () => {
    setupMockDb();
    const manager = new StockPaperTradingManager();

    const s1 = await manager.startSession(STOCK_STRATEGIES[0], 1000);
    await manager.startSession(STOCK_STRATEGIES[1], 1000);
    await manager.stopSession(s1.sessionId);

    const snapshots = createStockSnapshots();
    const results = manager.tickWithSnapshots(snapshots);

    expect(results).toHaveLength(1);
    expect(results[0].strategyCode).toBe(STOCK_STRATEGIES[1].code);
  });

  it('should increment totalTicks after tick', async () => {
    setupMockDb();
    const manager = new StockPaperTradingManager();

    const session = await manager.startSession(STOCK_STRATEGIES[0], 1000);
    expect(session.totalTicks).toBe(0);

    manager.tickWithSnapshots(createStockSnapshots());
    expect(session.totalTicks).toBe(1);

    manager.tickWithSnapshots(createStockSnapshots());
    expect(session.totalTicks).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tests — Rotated session
// ---------------------------------------------------------------------------

describe('StockPaperTradingManager — Auto-rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create rotated session with incremented rotation count', async () => {
    const callLog = createDbCallLog();
    setupMockDb({ callLog });
    const manager = new StockPaperTradingManager();

    const session = await manager.startSession(STOCK_STRATEGIES[0], 1000);
    const newId = await manager.startRotatedSession(
      session.sessionId,
      STOCK_STRATEGIES[0].code,
      0,
      STOCK_L1_DEFAULT_CAPITAL,
    );

    expect(newId).toBeTruthy();
    expect(manager.getActiveSessions()).toHaveLength(1);

    const inserts = callLog.inserts.get('stock_paper_sessions') ?? [];
    const rotatedInsert = inserts.find((i) => i.auto_rotation_count === 1);
    expect(rotatedInsert).toBeDefined();
    expect(rotatedInsert!.parent_session_id).toBe(session.sessionId);
  });
});
