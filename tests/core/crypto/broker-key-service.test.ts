import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ccxt
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

// Mock encryption
vi.mock('@/lib/auth/encryption', () => ({
  decrypt: vi.fn(async (val: string) => `decrypted-${val}`),
}));

// Mock supabase admin
const mockSingle = vi.fn();
const mockLimit = vi.fn(() => ({ single: mockSingle }));
const mockEqActive = vi.fn(() => ({ limit: mockLimit }));
const mockEqBroker = vi.fn(() => ({ eq: mockEqActive }));
const mockEqArea = vi.fn(() => ({ eq: mockEqBroker }));
const mockSelect = vi.fn(() => ({ eq: mockEqArea }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/lib/db/supabase/admin', () => ({
  createUntypedAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

import { BrokerKeyService } from '@/services/broker/broker-key-service';

describe('BrokerKeyService', () => {
  let service: BrokerKeyService;

  beforeEach(() => {
    service = new BrokerKeyService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    service.clearCache();
  });

  it('should return an authenticated adapter for binance', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        encrypted_key: 'enc-key',
        encrypted_secret: 'enc-secret',
        extra_config: {},
      },
      error: null,
    });

    const adapter = await service.getBrokerAdapter('crypto', 'binance');
    expect(adapter).toBeDefined();
    expect(adapter.id).toBe('binance');
    expect(mockFrom).toHaveBeenCalledWith('broker_api_keys');
  });

  it('should use cache on second call within TTL', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        encrypted_key: 'enc-key',
        encrypted_secret: 'enc-secret',
        extra_config: {},
      },
      error: null,
    });

    const adapter1 = await service.getBrokerAdapter('crypto', 'binance');
    const adapter2 = await service.getBrokerAdapter('crypto', 'binance');

    expect(adapter1).toBe(adapter2); // same instance
    expect(mockFrom).toHaveBeenCalledTimes(1); // DB called only once
  });

  it('should refetch after cache is cleared', async () => {
    mockSingle
      .mockResolvedValueOnce({
        data: { encrypted_key: 'enc-key', encrypted_secret: 'enc-secret', extra_config: {} },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { encrypted_key: 'enc-key-2', encrypted_secret: 'enc-secret-2', extra_config: {} },
        error: null,
      });

    await service.getBrokerAdapter('crypto', 'binance');
    service.clearCache();
    await service.getBrokerAdapter('crypto', 'binance');

    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('should throw if no active API key found', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'No rows returned' },
    });

    await expect(service.getBrokerAdapter('crypto', 'binance'))
      .rejects.toThrow('No active API key found');
  });

  it('should throw for unsupported area', async () => {
    await expect(service.getBrokerAdapter('stocks', 'binance'))
      .rejects.toThrow("Area 'stocks' not supported");
  });

  it('should throw for unsupported broker', async () => {
    await expect(service.getBrokerAdapter('crypto', 'kraken'))
      .rejects.toThrow("Broker 'kraken' not supported");
  });

  it('should force sandbox mode when configured', async () => {
    const sandboxService = new BrokerKeyService({ forceSandbox: true });

    mockSingle.mockResolvedValueOnce({
      data: {
        encrypted_key: 'enc-key',
        encrypted_secret: 'enc-secret',
        extra_config: {},
      },
      error: null,
    });

    const adapter = await sandboxService.getBrokerAdapter('crypto', 'binance');
    expect(adapter).toBeDefined();
    expect(adapter.id).toBe('binance');
  });

  it('should handle missing encrypted_secret gracefully', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        encrypted_key: 'enc-key',
        encrypted_secret: null,
        extra_config: {},
      },
      error: null,
    });

    const adapter = await service.getBrokerAdapter('crypto', 'binance');
    expect(adapter).toBeDefined();
  });
});
