/**
 * Test per l'endpoint cron equity-snapshot.
 *
 * Verifica:
 * - Auth check
 * - Polymarket sessions → equity_snapshots (con circuit_breaker nel P&L)
 * - Crypto sessions → paper_trading_snapshots (area='crypto')
 * - Gestione errori
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock('@/lib/cron-auth', () => ({
  verifyCronAuth: vi.fn(),
}));

// Track all DB operations
interface MockCall {
  table: string;
  method: string;
  args: unknown[];
}

const dbCalls: MockCall[] = [];
const upsertData: Record<string, unknown>[] = [];
const insertData: Record<string, unknown>[] = [];

function createChain(tableName: string) {
  const chain: Record<string, any> = {};

  const methods = ['select', 'eq', 'in', 'gte', 'lte', 'upsert', 'insert'];
  for (const m of methods) {
    chain[m] = vi.fn((...args: unknown[]) => {
      dbCalls.push({ table: tableName, method: m, args });

      if (m === 'upsert') {
        upsertData.push(args[0] as Record<string, unknown>);
        return Promise.resolve({ error: null });
      }
      if (m === 'insert') {
        insertData.push(args[0] as Record<string, unknown>);
        return Promise.resolve({ error: null });
      }

      return chain;
    });
  }

  // Default return values
  chain.data = null;
  chain.count = 0;

  return chain;
}

// Session data
const polymarketSessions = [
  {
    id: 'pm-session-1',
    strategy_id: 'strat-1',
    current_capital: 1050,
    initial_capital: 1000,
    realized_pnl: 50,
    unrealized_pnl: 10,
    total_pnl: 60,
    total_pnl_pct: 6,
    max_drawdown_pct: 2,
  },
];

const cryptoSessions = [
  {
    id: 'crypto-session-1',
    current_capital: 105,
    total_pnl_pct: 5,
    total_pnl: 5,
    realized_pnl: 3,
    unrealized_pnl: 2,
    max_drawdown_pct: 1.5,
  },
];

const todayTrades = [
  { net_pnl: 20, action: 'full_close' },
  { net_pnl: -5, action: 'partial_close' },
  { net_pnl: -15, action: 'circuit_breaker' },
  { net_pnl: 0, action: 'open' }, // should be excluded from P&L
];

const mockFrom = vi.fn();
vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: () => ({ from: mockFrom }),
}));

import { verifyCronAuth } from '@/lib/cron-auth';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createMockRequest(): any {
  return {
    headers: {
      get: (key: string) => (key === 'authorization' ? 'Bearer test' : null),
    },
    nextUrl: { searchParams: new URLSearchParams() },
    url: 'http://localhost:3000/api/cron/equity-snapshot',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/equity-snapshot', () => {
  let handler: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCalls.length = 0;
    upsertData.length = 0;
    insertData.length = 0;

    // Setup mock chain that returns appropriate data per table
    mockFrom.mockImplementation((table: string) => {
      const chain = createChain(table);

      if (table === 'paper_sessions') {
        chain.data = polymarketSessions;
        const origIn = chain.in;
        chain.in = vi.fn((...args: unknown[]) => {
          origIn(...args);
          return { ...chain, data: polymarketSessions };
        });
        const origSelect = chain.select;
        chain.select = vi.fn((...args: unknown[]) => {
          origSelect(...args);
          return chain;
        });
      }

      if (table === 'paper_positions') {
        chain.count = 2;
        const origSelect = chain.select;
        chain.select = vi.fn((...args: unknown[]) => {
          origSelect(...args);
          return chain;
        });
        chain.eq = vi.fn((...args: unknown[]) => {
          dbCalls.push({ table, method: 'eq', args });
          return { ...chain, count: 2 };
        });
      }

      if (table === 'paper_trades') {
        chain.data = todayTrades;
        const origSelect = chain.select;
        chain.select = vi.fn((...args: unknown[]) => {
          origSelect(...args);
          return chain;
        });
        chain.eq = vi.fn((...args: unknown[]) => {
          dbCalls.push({ table, method: 'eq', args });
          return chain;
        });
        chain.gte = vi.fn((...args: unknown[]) => {
          dbCalls.push({ table, method: 'gte', args });
          return chain;
        });
        chain.lte = vi.fn((...args: unknown[]) => {
          dbCalls.push({ table, method: 'lte', args });
          return { ...chain, data: todayTrades };
        });
      }

      if (table === 'crypto_paper_sessions') {
        chain.data = cryptoSessions;
        const origIn = chain.in;
        chain.in = vi.fn((...args: unknown[]) => {
          origIn(...args);
          return { ...chain, data: cryptoSessions };
        });
        const origSelect = chain.select;
        chain.select = vi.fn((...args: unknown[]) => {
          origSelect(...args);
          return chain;
        });
      }

      if (table === 'equity_snapshots') {
        chain.upsert = vi.fn((...args: unknown[]) => {
          dbCalls.push({ table, method: 'upsert', args });
          upsertData.push(args[0] as Record<string, unknown>);
          return Promise.resolve({ error: null });
        });
      }

      if (table === 'paper_trading_snapshots') {
        chain.insert = vi.fn((...args: unknown[]) => {
          dbCalls.push({ table, method: 'insert', args });
          insertData.push(args[0] as Record<string, unknown>);
          return Promise.resolve({ error: null });
        });
      }

      return chain;
    });

    const mod = await import('@/app/api/cron/equity-snapshot/route');
    handler = mod.GET;
  });

  it('returns 401 if auth fails', async () => {
    (verifyCronAuth as any).mockReturnValue(false);
    const res = await handler(createMockRequest());
    expect(res.status).toBe(401);
  });

  it('saves polymarket snapshots to equity_snapshots', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // Should have queried paper_sessions
    const paperSessionCalls = dbCalls.filter((c) => c.table === 'paper_sessions');
    expect(paperSessionCalls.length).toBeGreaterThan(0);

    // Should have upserted to equity_snapshots
    const upsertCalls = dbCalls.filter((c) => c.table === 'equity_snapshots' && c.method === 'upsert');
    expect(upsertCalls.length).toBe(1);
  });

  it('includes circuit_breaker trades in polymarket P&L', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    await handler(createMockRequest());

    // The upserted data should include circuit_breaker in pnl_today
    // todayTrades: full_close(+20) + partial_close(-5) + circuit_breaker(-15) = 0
    expect(upsertData.length).toBeGreaterThan(0);
    const pmSnapshot = upsertData[0];
    expect(pmSnapshot.pnl_today).toBe(0); // 20 - 5 - 15 = 0
    expect(pmSnapshot.trades_today).toBe(3); // 3 closed trades (including circuit_breaker)
  });

  it('saves crypto snapshots to paper_trading_snapshots with area=crypto', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    await handler(createMockRequest());

    const cryptoInserts = dbCalls.filter(
      (c) => c.table === 'paper_trading_snapshots' && c.method === 'insert',
    );
    expect(cryptoInserts.length).toBe(1);

    expect(insertData.length).toBeGreaterThan(0);
    const cryptoSnapshot = insertData[0];
    expect(cryptoSnapshot.area).toBe('crypto');
    expect(cryptoSnapshot.session_id).toBe('crypto-session-1');
    expect(cryptoSnapshot.equity).toBe(105);
    expect(cryptoSnapshot.pnl_pct).toBe(5);
  });

  it('returns correct snapshot count for both areas', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    const res = await handler(createMockRequest());
    const body = await res.json();

    // 1 polymarket + 1 crypto = 2
    expect(body.snapshots).toBe(2);
    expect(body.skipped).toBe(0);
  });

  it('handles empty sessions gracefully', async () => {
    (verifyCronAuth as any).mockReturnValue(true);

    // Override to return empty sessions
    mockFrom.mockImplementation((table: string) => {
      const chain = createChain(table);
      if (table === 'paper_sessions' || table === 'crypto_paper_sessions') {
        chain.data = [];
        chain.select = vi.fn(() => chain);
        chain.in = vi.fn(() => ({ ...chain, data: [] }));
      }
      return chain;
    });

    const res = await handler(createMockRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.snapshots).toBe(0);
  });
});
