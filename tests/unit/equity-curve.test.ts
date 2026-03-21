/**
 * Test per il componente EquityCurve.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';

// Mock recharts to avoid canvas issues in test environment
vi.mock('recharts', () => {
  const React = require('react');
  return {
    ResponsiveContainer: ({ children }: any) =>
      React.createElement('div', { 'data-testid': 'responsive-container' }, children),
    LineChart: ({ children, data }: any) =>
      React.createElement('div', { 'data-testid': 'line-chart', 'data-points': data?.length ?? 0 }, children),
    Line: ({ dataKey }: any) =>
      React.createElement('div', { 'data-testid': `line-${dataKey}` }),
    XAxis: () => React.createElement('div', { 'data-testid': 'x-axis' }),
    YAxis: () => React.createElement('div', { 'data-testid': 'y-axis' }),
    Tooltip: () => React.createElement('div', { 'data-testid': 'tooltip' }),
    CartesianGrid: () => React.createElement('div', { 'data-testid': 'grid' }),
    ReferenceLine: ({ y }: any) =>
      React.createElement('div', { 'data-testid': 'reference-line', 'data-y': y }),
  };
});

import { EquityCurve } from '@/components/paper-trading/equity-curve';

describe('EquityCurve', () => {
  const sampleSnapshots = [
    { timestamp: '2026-03-21T10:00:00Z', equity: 100, pnlPct: 0 },
    { timestamp: '2026-03-21T10:02:00Z', equity: 101.5, pnlPct: 1.5 },
    { timestamp: '2026-03-21T10:04:00Z', equity: 99.8, pnlPct: -0.2 },
    { timestamp: '2026-03-21T10:06:00Z', equity: 103, pnlPct: 3 },
  ];

  it('renders empty state when no snapshots', () => {
    render(createElement(EquityCurve, { snapshots: [], initialCapital: 100 }));
    expect(screen.getByText(/Nessun dato/)).toBeInTheDocument();
  });

  it('renders chart when snapshots provided', () => {
    render(createElement(EquityCurve, { snapshots: sampleSnapshots, initialCapital: 100 }));
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart').getAttribute('data-points')).toBe('4');
  });

  it('renders equity line', () => {
    render(createElement(EquityCurve, { snapshots: sampleSnapshots, initialCapital: 100 }));
    expect(screen.getByTestId('line-equity')).toBeInTheDocument();
  });

  it('renders reference line at initial capital', () => {
    render(createElement(EquityCurve, { snapshots: sampleSnapshots, initialCapital: 100 }));
    const ref = screen.getByTestId('reference-line');
    expect(ref.getAttribute('data-y')).toBe('100');
  });

  it('respects custom height', () => {
    const { container } = render(
      createElement(EquityCurve, { snapshots: [], initialCapital: 100, height: 300 }),
    );
    const emptyDiv = container.firstChild as HTMLElement;
    expect(emptyDiv.style.height).toBe('300px');
  });

  it('renders axes and grid', () => {
    render(createElement(EquityCurve, { snapshots: sampleSnapshots, initialCapital: 100 }));
    expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    expect(screen.getByTestId('y-axis')).toBeInTheDocument();
    expect(screen.getByTestId('grid')).toBeInTheDocument();
  });
});
