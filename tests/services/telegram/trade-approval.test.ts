/**
 * Tests for Telegram Trade Approval Flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports — singleton client so assertions work
const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 42 });
const mockTelegramClient = { sendMessage: mockSendMessage };

vi.mock('@/lib/telegram', () => ({
  getTelegramClient: vi.fn(() => mockTelegramClient),
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

import {
  requestApproval,
  executeWithApproval,
  resolveApproval,
  getPendingApprovals,
  cancelAllPending,
  APPROVAL_THRESHOLD_PCT,
  APPROVAL_TIMEOUT_MS,
} from '@/services/telegram/trade-approval';
import { getTelegramClient } from '@/lib/telegram';
import { auditLogger } from '@/services/execution/audit-logger';
import { MarketArea, Direction, OrderType } from '@/core/types/common';
import { Trade } from '@/core/types/trade';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    strategyId: 'strat-1',
    userId: 'user-1',
    area: MarketArea.CRYPTO,
    symbol: 'BTC/USDT',
    direction: Direction.LONG,
    orderType: OrderType.MARKET,
    size: 0.1,
    currency: 'USDT',
    createdAt: new Date().toISOString(),
    metadata: { expectedPrice: 65000 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Trade Approval Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any pending approvals from previous tests
    cancelAllPending();
  });

  afterEach(() => {
    cancelAllPending();
  });

  describe('executeWithApproval — threshold check', () => {
    it('should execute directly when trade < 5% of bankroll', async () => {
      const trade = makeTrade({
        size: 0.01,
        metadata: { expectedPrice: 65000 }, // value = 650, bankroll = 100000 → 0.65%
      });
      const executeFn = vi.fn().mockResolvedValue({ success: true });

      const result = await executeWithApproval(trade, 100_000, executeFn);

      expect(result.executed).toBe(true);
      expect(result.result).toEqual({ success: true });
      expect(executeFn).toHaveBeenCalledOnce();
      // No Telegram message for small trades
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should request approval when trade >= 5% of bankroll', async () => {
      const trade = makeTrade({
        size: 1,
        metadata: { expectedPrice: 65000 }, // value = 65000, bankroll = 100000 → 65%
      });
      const executeFn = vi.fn().mockResolvedValue({ success: true });

      // Start executeWithApproval (will block on approval)
      const promise = executeWithApproval(trade, 100_000, executeFn, 'Test strategy');

      // The trade should be in pending approvals
      const pending = getPendingApprovals();
      expect(pending.length).toBe(1);
      expect(pending[0].trade.symbol).toBe('BTC/USDT');

      // Telegram message should have been sent
      expect(mockSendMessage).toHaveBeenCalledOnce();

      // Approve it
      resolveApproval(trade.id, true);

      const result = await promise;
      expect(result.executed).toBe(true);
      expect(result.approvalResult?.approved).toBe(true);
      expect(executeFn).toHaveBeenCalledOnce();
    });

    it('should NOT execute when approval is rejected', async () => {
      const trade = makeTrade({
        size: 1,
        metadata: { expectedPrice: 65000 },
      });
      const executeFn = vi.fn().mockResolvedValue({ success: true });

      const promise = executeWithApproval(trade, 100_000, executeFn);

      // Reject
      resolveApproval(trade.id, false);

      const result = await promise;
      expect(result.executed).toBe(false);
      expect(result.approvalResult?.approved).toBe(false);
      expect(executeFn).not.toHaveBeenCalled();
    });
  });

  describe('requestApproval', () => {
    it('should send Telegram message with inline buttons', async () => {
      const trade = makeTrade({
        size: 1,
        metadata: { expectedPrice: 65000 },
      });

      const promise = requestApproval(trade, 100_000, 'CR-001');

      // Should have sent message
      expect(mockSendMessage).toHaveBeenCalledWith(
        8659384895,
        expect.stringContaining('APPROVAZIONE TRADE RICHIESTA'),
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [
              [
                expect.objectContaining({ text: 'Approva', callback_data: `approve_trade:${trade.id}` }),
                expect.objectContaining({ text: 'Rifiuta', callback_data: `reject_trade:${trade.id}` }),
              ],
            ],
          },
        }),
      );

      // Resolve to clean up
      resolveApproval(trade.id, false);
      await promise;
    });

    it('should resolve with approved=true when user approves', async () => {
      const trade = makeTrade({ size: 1, metadata: { expectedPrice: 65000 } });

      const promise = requestApproval(trade, 100_000);

      resolveApproval(trade.id, true);

      const result = await promise;
      expect(result.approved).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.respondedAt).toBeDefined();
    });

    it('should resolve with approved=false when user rejects', async () => {
      const trade = makeTrade({ size: 1, metadata: { expectedPrice: 65000 } });

      const promise = requestApproval(trade, 100_000);

      resolveApproval(trade.id, false);

      const result = await promise;
      expect(result.approved).toBe(false);
      expect(result.timedOut).toBe(false);
    });

    it('should auto-reject on timeout', async () => {
      vi.useFakeTimers();

      const trade = makeTrade({ size: 1, metadata: { expectedPrice: 65000 } });

      const promise = requestApproval(trade, 100_000);

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS + 100);

      const result = await promise;
      expect(result.approved).toBe(false);
      expect(result.timedOut).toBe(true);

      // Audit logged
      expect(auditLogger.logKillSwitch).toHaveBeenCalledWith(
        'system',
        expect.stringContaining('timeout'),
      );

      vi.useRealTimers();
    });
  });

  describe('resolveApproval', () => {
    it('should return false for non-existent trade', () => {
      const result = resolveApproval('non-existent-id', true);
      expect(result).toBe(false);
    });

    it('should return true and resolve the pending approval', async () => {
      const trade = makeTrade({ size: 1, metadata: { expectedPrice: 65000 } });

      const promise = requestApproval(trade, 100_000);

      const resolved = resolveApproval(trade.id, true);
      expect(resolved).toBe(true);

      const result = await promise;
      expect(result.approved).toBe(true);

      // Should be removed from pending
      expect(getPendingApprovals().length).toBe(0);
    });

    it('should log to audit on resolve', async () => {
      const trade = makeTrade({ size: 1, metadata: { expectedPrice: 65000 } });

      const promise = requestApproval(trade, 100_000);
      resolveApproval(trade.id, true);
      await promise;

      expect(auditLogger.logKillSwitch).toHaveBeenCalledWith(
        'user',
        expect.stringContaining('APPROVED'),
      );
    });
  });

  describe('cancelAllPending', () => {
    it('should reject all pending approvals', async () => {
      const trade1 = makeTrade({ id: 'trade-cancel-1', size: 1, metadata: { expectedPrice: 65000 } });
      const trade2 = makeTrade({ id: 'trade-cancel-2', size: 2, metadata: { expectedPrice: 65000 } });

      const p1 = requestApproval(trade1, 100_000);
      const p2 = requestApproval(trade2, 100_000);

      expect(getPendingApprovals().length).toBe(2);

      cancelAllPending();

      expect(getPendingApprovals().length).toBe(0);

      const r1 = await p1;
      const r2 = await p2;

      expect(r1.approved).toBe(false);
      expect(r2.approved).toBe(false);
    });

    it('should log to audit for each cancelled approval', async () => {
      vi.clearAllMocks();

      const trade = makeTrade({ id: 'trade-cancel-audit', size: 1, metadata: { expectedPrice: 65000 } });

      const p = requestApproval(trade, 100_000);
      cancelAllPending();
      await p;

      expect(auditLogger.logKillSwitch).toHaveBeenCalledWith(
        'system',
        expect.stringContaining('kill switch'),
      );
    });
  });

  describe('getPendingApprovals', () => {
    it('should return empty array when no approvals pending', () => {
      expect(getPendingApprovals()).toEqual([]);
    });

    it('should return all pending approvals', async () => {
      const trade1 = makeTrade({ id: 'pending-1', size: 1, metadata: { expectedPrice: 65000 } });
      const trade2 = makeTrade({ id: 'pending-2', size: 2, metadata: { expectedPrice: 65000 } });

      const p1 = requestApproval(trade1, 100_000);
      const p2 = requestApproval(trade2, 100_000);

      const pending = getPendingApprovals();
      expect(pending.length).toBe(2);
      expect(pending[0].id).toBe('pending-1');
      expect(pending[1].id).toBe('pending-2');

      // Clean up
      cancelAllPending();
      await p1;
      await p2;
    });
  });

  describe('APPROVAL_THRESHOLD_PCT', () => {
    it('should be 5%', () => {
      expect(APPROVAL_THRESHOLD_PCT).toBe(5);
    });
  });
});
