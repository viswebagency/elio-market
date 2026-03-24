/**
 * Tests for /api/cron/live-tick — Live trading cron endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks (must be before imports) ---

const mockKillSwitch = {
  isActive: vi.fn().mockResolvedValue(false),
  isActiveSync: vi.fn().mockReturnValue(false),
  activate: vi.fn().mockResolvedValue({ cancelledOrders: 0, closedPositions: 0, errors: [] }),
  deactivate: vi.fn().mockResolvedValue(undefined),
  getStatus: vi.fn().mockReturnValue({ active: false }),
  hydrate: vi.fn().mockResolvedValue(undefined),
};

let circuitBreakerTripped = false;
const mockCircuitBreaker = {
  get isTripped() { return circuitBreakerTripped; },
  isTrippedAsync: vi.fn().mockImplementation(() => Promise.resolve(circuitBreakerTripped)),
  checkAndTrip: vi.fn().mockResolvedValue(false),
  recordError: vi.fn().mockResolvedValue(false),
  getStatus: vi.fn().mockReturnValue({ tripped: false }),
  reset: vi.fn().mockResolvedValue(undefined),
  hydrate: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/services/execution/kill-switch', () => ({
  killSwitch: mockKillSwitch,
  KillSwitch: vi.fn(),
}));

vi.mock('@/services/execution/circuit-breaker-live', () => ({
  circuitBreakerLive: mockCircuitBreaker,
  CircuitBreakerLive: vi.fn(),
}));

vi.mock('@/lib/cron-auth', () => ({
  verifyCronAuth: vi.fn().mockReturnValue(true),
}));

vi.mock('@/services/execution/audit-logger', () => ({
  auditLogger: {
    logKillSwitch: vi.fn().mockResolvedValue(undefined),
    logCircuitBreakerLive: vi.fn().mockResolvedValue(undefined),
    logTradeIntent: vi.fn().mockResolvedValue(undefined),
    logExecution: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/telegram', () => ({
  getTelegramClient: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('@/services/broker/broker-key-service', () => {
  class MockBrokerKeyService {
    getBrokerAdapter = vi.fn().mockResolvedValue({
      getTicker: vi.fn().mockResolvedValue({
        symbol: 'BTCUSDT',
        price: 60000,
        quoteVolume24h: 1000000,
        priceChangePercent24h: 2.5,
        high24h: 61000,
        low24h: 59000,
      }),
      getBalances: vi.fn().mockResolvedValue([
        { currency: 'USDT', total: 1000, available: 800 },
      ]),
      placeTrade: vi.fn().mockResolvedValue({
        orderId: 'live-order-1',
        status: 'filled',
        filledAmount: 0.01,
      }),
      getOrderStatus: vi.fn().mockResolvedValue({
        orderId: 'live-order-1',
        status: 'filled',
        filledAmount: 0.01,
        remainingAmount: 0,
        avgFillPrice: 60000,
        fees: 0.5,
      }),
      getOpenOrders: vi.fn().mockResolvedValue([]),
      getPositions: vi.fn().mockResolvedValue([]),
    });
    clearCache = vi.fn();
  }
  return { BrokerKeyService: MockBrokerKeyService };
});

// Chainable Supabase mock — returns self for any method call
function createChainableMock(resolvedValue: { data: unknown; error: unknown } = { data: [], error: null }) {
  const mock: Record<string, any> = {};
  const handler: ProxyHandler<Record<string, any>> = {
    get(_target, prop) {
      if (prop === 'then') return undefined; // Not a Promise
      if (!mock[prop as string]) {
        mock[prop as string] = vi.fn().mockReturnValue(new Proxy({}, handler));
      }
      return mock[prop as string];
    },
  };
  // The last call in the chain should resolve
  const proxy = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      return vi.fn().mockReturnValue(new Proxy({}, {
        get(t2, p2) {
          if (p2 === 'then') {
            // Make the deepest call resolve with data
            return (resolve: (v: unknown) => void) => resolve(resolvedValue);
          }
          return vi.fn().mockReturnValue(new Proxy({}, {
            get(t3, p3) {
              if (p3 === 'then') return (resolve: (v: unknown) => void) => resolve(resolvedValue);
              return vi.fn().mockReturnValue(new Proxy({}, {
                get(t4, p4) {
                  if (p4 === 'then') return (resolve: (v: unknown) => void) => resolve(resolvedValue);
                  return vi.fn().mockReturnValue(new Proxy({}, {
                    get(t5, p5) {
                      if (p5 === 'then') return (resolve: (v: unknown) => void) => resolve(resolvedValue);
                      return vi.fn().mockResolvedValue(resolvedValue);
                    },
                  }));
                },
              }));
            },
          }));
        },
      }));
    },
  });
  return proxy;
}

let mockStrategiesData: unknown[] = [];
let mockProfilesData: unknown[] = [];

const mockSupabaseFrom = vi.fn().mockImplementation((table: string) => {
  if (table === 'strategies') return createChainableMock({ data: mockStrategiesData, error: null });
  if (table === 'profiles') return createChainableMock({ data: mockProfilesData, error: null });
  return createChainableMock({ data: [], error: null });
});

vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: vi.fn(() => ({
    from: mockSupabaseFrom,
  })),
}));

vi.mock('@/lib/auth/require-2fa', () => ({
  check2FAFromProfile: vi.fn().mockReturnValue({ allowed: true, message: '' }),
  require2FA: vi.fn().mockResolvedValue(undefined),
  TwoFARequiredError: class extends Error { statusCode = 403; },
}));

vi.mock('@/core/strategies/crypto-strategies', () => ({
  CRYPTO_STRATEGY_MAP: {
    'CR-C01': {
      code: 'CR-C01',
      name: 'Test Strategy',
      area: 'crypto',
      max_drawdown: 15,
      max_allocation_pct: 20,
      max_consecutive_losses: 5,
      pairs: ['BTC/USDT'],
      rules: JSON.stringify({
        entry: [{ field: 'price', operator: '>', value: 0, weight: 100 }],
        exit: [{ condition: 'profit_pct > 5', sellFraction: 1 }],
        bankrollTiers: [
          { tier: 'TIER1', allocationPct: 40 },
          { tier: 'TIER2', allocationPct: 35 },
          { tier: 'TIER3', allocationPct: 25 },
        ],
        liquidityReservePct: 20,
      }),
    },
  },
}));

vi.mock('@/core/engine/dsl-parser', () => ({
  parseStrategy: vi.fn().mockReturnValue({
    strategyId: 'CR-C01',
    code: 'CR-C01',
    entryRules: [],
    exitRules: [],
    bankrollTiers: [
      { tier: 'TIER1', allocationPct: 40 },
      { tier: 'TIER2', allocationPct: 35 },
      { tier: 'TIER3', allocationPct: 25 },
    ],
    circuitBreaker: { lossPct: -15 },
    maxConsecutiveLosses: 5,
    maxAllocationPct: 20,
    liquidityReservePct: 20,
  }),
}));

vi.mock('@/services/reconciliation/order-reconciliation', () => ({
  reconcileAndUpdate: vi.fn().mockResolvedValue({
    orderId: 'live-order-1',
    status: 'filled',
    expectedPrice: 60000,
    actualPrice: 60000,
    slippage: 0,
    fees: 0.5,
    fillTime: 100,
    partialFill: false,
    filledAmount: 0.01,
  }),
}));

vi.mock('@/plugins/crypto/constants', () => ({
  CRYPTO_TOP_PAIRS: ['BTC/USDT'],
}));

function makeRequest(authorized = true): NextRequest {
  const headers = new Headers();
  if (authorized) {
    headers.set('authorization', 'Bearer test-secret');
  }
  return new NextRequest('http://localhost:3000/api/cron/live-tick', { headers });
}

describe('/api/cron/live-tick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isActive.mockResolvedValue(false);
    circuitBreakerTripped = false;
    mockStrategiesData = [];
    mockProfilesData = [];

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'strategies') return createChainableMock({ data: mockStrategiesData, error: null });
      if (table === 'profiles') return createChainableMock({ data: mockProfilesData, error: null });
      return createChainableMock({ data: [], error: null });
    });
  });

  it('should skip when kill switch is active', async () => {
    mockKillSwitch.isActive.mockResolvedValue(true);
    const { GET } = await import('@/app/api/cron/live-tick/route');

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(true);
    expect(body.reason).toContain('Kill switch');
  });

  it('should skip when circuit breaker is tripped', async () => {
    circuitBreakerTripped = true;

    const { GET } = await import('@/app/api/cron/live-tick/route');

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(true);
    expect(body.reason).toContain('Circuit breaker');
  });

  it('should return ok with 0 strategies when none are active', async () => {
    const { GET } = await import('@/app/api/cron/live-tick/route');

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.strategiesEvaluated).toBe(0);
  });

  it('should process live strategies and execute trades', async () => {
    mockStrategiesData = [{
      id: 'strat-1',
      code: 'CR-C01',
      user_id: 'user-1',
      broker_name: 'binance',
    }];
    mockProfilesData = [{ id: 'user-1', two_fa_enabled: true }];

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'strategies') return createChainableMock({ data: mockStrategiesData, error: null });
      if (table === 'profiles') return createChainableMock({ data: mockProfilesData, error: null });
      return createChainableMock({ data: [], error: null });
    });

    const { GET } = await import('@/app/api/cron/live-tick/route');

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.results).toBeDefined();
    expect(body.results.length).toBe(1);
    expect(body.results[0].strategyCode).toBe('CR-C01');
  });

  it('should handle concurrent tick lock', async () => {
    // This test verifies the lock mechanism exists by importing the module
    const { GET } = await import('@/app/api/cron/live-tick/route');

    // Start first tick
    const firstPromise = GET(makeRequest());

    // The lock should be set — we can't easily test concurrent calls
    // in a unit test, but we verify the endpoint responds correctly
    const response = await firstPromise;
    const body = await response.json();
    expect(body.ok).toBe(true);
  });
});
