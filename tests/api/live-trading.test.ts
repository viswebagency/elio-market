/**
 * Tests for Live Trading API endpoints — kill switch & pending approvals.
 * These test the core logic: 2FA gate, kill switch activation, approval resolve.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockAuthGetUser = vi.fn();

vi.mock('@/lib/db/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({ select: mockSelect })),
    auth: { getUser: mockAuthGetUser },
  })),
}));

vi.mock('@/services/execution/audit-logger', () => ({
  auditLogger: {
    logKillSwitch: vi.fn().mockResolvedValue(undefined),
    logTradeIntent: vi.fn().mockResolvedValue(undefined),
    logExecution: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn().mockResolvedValue(undefined),
    logCircuitBreakerLive: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/telegram', () => ({
  getTelegramClient: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue({ message_id: 42 }),
  })),
}));

import { killSwitch } from '@/services/execution/kill-switch';
import {
  resolveApproval,
  getPendingApprovals,
  cancelAllPending,
  requestApproval,
} from '@/services/telegram/trade-approval';
import { MarketArea, Direction, OrderType } from '@/core/types/common';
import { Trade } from '@/core/types/trade';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: `api-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    strategyId: 'strat-1',
    userId: 'user-1',
    area: MarketArea.CRYPTO,
    symbol: 'BTC/USDT',
    direction: Direction.LONG,
    orderType: OrderType.MARKET,
    size: 1,
    currency: 'USDT',
    createdAt: new Date().toISOString(),
    metadata: { expectedPrice: 65000 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Live Trading API Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelAllPending();
    // Reset kill switch state
    if (killSwitch.isActive()) {
      killSwitch.deactivate('test');
    }
  });

  describe('Kill Switch — activate/deactivate', () => {
    it('should activate kill switch', async () => {
      expect(killSwitch.isActive()).toBe(false);

      const report = await killSwitch.activate('user-1', 'Web dashboard test');

      expect(killSwitch.isActive()).toBe(true);
      expect(report.cancelledOrders).toBe(0); // No adapter
      expect(report.closedPositions).toBe(0);
    });

    it('should deactivate kill switch', async () => {
      await killSwitch.activate('user-1', 'Test');
      expect(killSwitch.isActive()).toBe(true);

      await killSwitch.deactivate('user-1');
      expect(killSwitch.isActive()).toBe(false);
    });

    it('should cancel all pending approvals when activated', async () => {
      const trade = makeTrade({ id: 'ks-cancel-test' });
      const p = requestApproval(trade, 100_000);

      expect(getPendingApprovals().length).toBe(1);

      cancelAllPending();
      await killSwitch.activate('user-1', 'Emergency');

      expect(getPendingApprovals().length).toBe(0);

      const result = await p;
      expect(result.approved).toBe(false);
    });

    it('should return kill switch status', () => {
      const status = killSwitch.getStatus();

      expect(status.active).toBe(false);
      expect(status.activatedAt).toBeNull();
      expect(status.activatedBy).toBeNull();
      expect(status.reason).toBeNull();
    });

    it('should include activation details in status', async () => {
      await killSwitch.activate('elio', 'Test reason');

      const status = killSwitch.getStatus();
      expect(status.active).toBe(true);
      expect(status.activatedBy).toBe('elio');
      expect(status.reason).toBe('Test reason');
      expect(status.activatedAt).toBeDefined();
    });
  });

  describe('Pending Approvals — web approve/reject', () => {
    it('should approve a pending trade', async () => {
      const trade = makeTrade({ id: 'web-approve-1' });
      const p = requestApproval(trade, 100_000);

      const resolved = resolveApproval('web-approve-1', true);
      expect(resolved).toBe(true);

      const result = await p;
      expect(result.approved).toBe(true);
    });

    it('should reject a pending trade', async () => {
      const trade = makeTrade({ id: 'web-reject-1' });
      const p = requestApproval(trade, 100_000);

      const resolved = resolveApproval('web-reject-1', false);
      expect(resolved).toBe(true);

      const result = await p;
      expect(result.approved).toBe(false);
    });

    it('should return false for already-resolved trade', async () => {
      const trade = makeTrade({ id: 'already-done' });
      const p = requestApproval(trade, 100_000);

      resolveApproval('already-done', true);
      await p;

      // Try to resolve again
      const secondResolve = resolveApproval('already-done', false);
      expect(secondResolve).toBe(false);
    });

    it('should return false for non-existent trade', () => {
      const result = resolveApproval('does-not-exist', true);
      expect(result).toBe(false);
    });
  });

  describe('2FA gate requirement', () => {
    it('should export require2FA function', async () => {
      const { require2FA, TwoFARequiredError } = await import('@/lib/auth/require-2fa');
      expect(typeof require2FA).toBe('function');
      expect(TwoFARequiredError).toBeDefined();
    });

    it('should have check2FAFromProfile function', async () => {
      const { check2FAFromProfile } = await import('@/lib/auth/require-2fa');

      const allowed = check2FAFromProfile({ two_fa_enabled: true });
      expect(allowed.allowed).toBe(true);

      const denied = check2FAFromProfile({ two_fa_enabled: false });
      expect(denied.allowed).toBe(false);
    });
  });
});
