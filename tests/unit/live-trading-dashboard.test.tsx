/**
 * Tests for Live Trading Dashboard component render.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock recharts to avoid SSR issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  ReferenceLine: () => <div data-testid="reference-line" />,
}));

import LiveTradingDashboard from '@/app/(dashboard)/dashboard/live-trading/page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockApiResponses(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    '/api/live-trading/stats': {
      ok: true,
      stats: {
        bankroll: 10000,
        initialBankroll: 9500,
        peakBankroll: 10500,
        currency: 'USDT',
        dailyPnl: 150,
        dailyPnlPct: 1.5,
        totalPnl: 500,
        totalPnlPct: 5.26,
        totalTrades: 42,
        todayTrades: 3,
        killSwitch: { active: false, activatedAt: null, activatedBy: null, reason: null },
        circuitBreaker: { tripped: false, trippedAt: null, reason: null, consecutiveLosses: 0, dailyLossPct: 0, recentErrors: 0 },
      },
    },
    '/api/live-trading/positions': {
      ok: true,
      positions: [
        {
          id: 'pos-1',
          symbol: 'BTC/USDT',
          direction: 'long',
          size: 0.01,
          entry_price: 64000,
          current_price: 65000,
          unrealized_pnl: 10,
          unrealized_pnl_pct: 1.56,
          opened_at: '2026-03-22T10:00:00Z',
        },
      ],
    },
    '/api/live-trading/equity': {
      ok: true,
      snapshots: [
        { timestamp: '2026-03-22T08:00:00Z', equity: 9500, pnlPct: 0 },
        { timestamp: '2026-03-22T12:00:00Z', equity: 10000, pnlPct: 5.26 },
      ],
    },
    '/api/live-trading/pending-approvals': {
      ok: true,
      pending: [],
    },
    '/api/live-trading/trades': {
      ok: true,
      trades: [
        {
          id: 'trade-1',
          symbol: 'ETH/USDT',
          direction: 'long',
          entry_price: 3200,
          exit_price: 3250,
          pnl: 25,
          commission: 0.5,
          slippage: 0.1,
          executed_at: '2026-03-22T09:30:00Z',
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  };

  mockFetch.mockImplementation(async (url: string) => {
    // Extract path from URL (handle relative URLs)
    const path = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0];
    const data = overrides[path] ?? defaults[path] ?? { ok: true };
    return {
      ok: true,
      json: async () => data,
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LiveTradingDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiResponses();
  });

  it('should render loading state initially', () => {
    render(<LiveTradingDashboard />);
    expect(screen.getByText('Caricamento live trading...')).toBeDefined();
  });

  it('should render dashboard after data loads', async () => {
    render(<LiveTradingDashboard />);

    // Wait for loading to complete
    const title = await screen.findByText('Live Trading', {}, { timeout: 3000 });
    expect(title).toBeDefined();
  });

  it('should display bankroll and P&L metrics', async () => {
    render(<LiveTradingDashboard />);

    await screen.findByText('Live Trading', {}, { timeout: 3000 });

    // Check metric cards are rendered
    expect(screen.getByText('Bankroll')).toBeDefined();
    expect(screen.getByText('P&L Totale')).toBeDefined();
    expect(screen.getByText('P&L Oggi')).toBeDefined();
  });

  it('should display open positions', async () => {
    render(<LiveTradingDashboard />);

    await screen.findByText('Live Trading', {}, { timeout: 3000 });

    // Position table
    expect(screen.getByText('Posizioni Aperte (1)')).toBeDefined();
    expect(screen.getByText('BTC/USDT')).toBeDefined();
  });

  it('should display trade history', async () => {
    render(<LiveTradingDashboard />);

    await screen.findByText('Live Trading', {}, { timeout: 3000 });

    expect(screen.getByText('Trade History')).toBeDefined();
    expect(screen.getByText('ETH/USDT')).toBeDefined();
  });

  it('should show kill switch as inactive by default', async () => {
    render(<LiveTradingDashboard />);

    await screen.findByText('Live Trading', {}, { timeout: 3000 });

    expect(screen.getByText('Kill Switch')).toBeDefined();
    expect(screen.getByText('Disattivo')).toBeDefined();
  });

  it('should show circuit breaker status', async () => {
    render(<LiveTradingDashboard />);

    await screen.findByText('Live Trading', {}, { timeout: 3000 });

    expect(screen.getByText('Circuit Breaker')).toBeDefined();
    expect(screen.getByText('OK')).toBeDefined();
  });

  it('should show pending approvals when present', async () => {
    mockApiResponses({
      '/api/live-trading/pending-approvals': {
        ok: true,
        pending: [
          {
            id: 'approval-1',
            symbol: 'BTC/USDT',
            direction: 'long',
            size: 1,
            tradeValueUsd: 65000,
            bankrollPct: 65,
            reason: 'CR-001',
            requestedAt: '2026-03-22T12:00:00Z',
          },
        ],
      },
    });

    render(<LiveTradingDashboard />);

    await screen.findByText('Live Trading', {}, { timeout: 3000 });

    // Should show approval banner
    const approvalHeader = await screen.findByText(/Trade in attesa di approvazione/, {}, { timeout: 3000 });
    expect(approvalHeader).toBeDefined();
  });

  it('should render equity curve component', async () => {
    render(<LiveTradingDashboard />);

    await screen.findByText('Live Trading', {}, { timeout: 3000 });

    expect(screen.getByText('Equity Curve')).toBeDefined();
  });

  it('should show trade filter buttons', async () => {
    render(<LiveTradingDashboard />);

    await screen.findByText('Live Trading', {}, { timeout: 3000 });

    expect(screen.getByText('Oggi')).toBeDefined();
    expect(screen.getByText('Settimana')).toBeDefined();
    expect(screen.getByText('Mese')).toBeDefined();
    expect(screen.getByText('Tutti')).toBeDefined();
  });
});
