-- ============================================================================
-- 018: Stock Paper Trading Tables
-- Mirrors crypto_paper_sessions/positions/trades for equities area (M4)
-- ============================================================================

-- Stock paper trading sessions
CREATE TABLE IF NOT EXISTS stock_paper_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_code TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  initial_capital NUMERIC(12,2) NOT NULL DEFAULT 1000,
  current_capital NUMERIC(12,2) NOT NULL DEFAULT 1000,
  peak_capital NUMERIC(12,2) NOT NULL DEFAULT 1000,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'stopped')),
  pause_reason TEXT,
  realized_pnl NUMERIC(12,4) DEFAULT 0,
  unrealized_pnl NUMERIC(12,4) DEFAULT 0,
  total_pnl NUMERIC(12,4) DEFAULT 0,
  total_pnl_pct NUMERIC(8,4) DEFAULT 0,
  max_drawdown_pct NUMERIC(8,4) DEFAULT 0,
  total_ticks INTEGER DEFAULT 0,
  last_tick_at TIMESTAMPTZ,
  is_circuit_broken BOOLEAN DEFAULT false,
  circuit_broken_reason TEXT,
  circuit_broken_at TIMESTAMPTZ,
  tickers TEXT[] DEFAULT '{}',
  portfolio_state JSONB DEFAULT '{}',
  -- Auto-rotation
  cooldown_until TIMESTAMPTZ,
  auto_rotation_count INTEGER DEFAULT 0,
  parent_session_id UUID REFERENCES stock_paper_sessions(id),
  -- Performance warnings
  last_warning_level INTEGER,
  last_warning_at TIMESTAMPTZ,
  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ
);

-- Stock paper trading positions (granular tracking)
CREATE TABLE IF NOT EXISTS stock_paper_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES stock_paper_sessions(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'long' CHECK (direction IN ('long', 'short')),
  entry_price NUMERIC(12,4) NOT NULL,
  current_price NUMERIC(12,4) NOT NULL,
  size NUMERIC(16,8) NOT NULL,
  stake NUMERIC(12,4) NOT NULL,
  pnl NUMERIC(12,4) DEFAULT 0,
  pnl_pct NUMERIC(8,4) DEFAULT 0,
  entry_reason TEXT,
  signal_confidence INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- Stock paper trading trades (log of every action)
CREATE TABLE IF NOT EXISTS stock_paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES stock_paper_sessions(id) ON DELETE CASCADE,
  position_id UUID REFERENCES stock_paper_positions(id),
  symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('enter', 'partial_close', 'full_close', 'circuit_breaker')),
  price NUMERIC(12,4) NOT NULL,
  size NUMERIC(16,8) NOT NULL,
  stake NUMERIC(12,4) DEFAULT 0,
  pnl NUMERIC(12,4) DEFAULT 0,
  pnl_pct NUMERIC(8,4) DEFAULT 0,
  reason TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_paper_sessions_status ON stock_paper_sessions(status);
CREATE INDEX IF NOT EXISTS idx_stock_paper_sessions_strategy_code ON stock_paper_sessions(strategy_code);
CREATE INDEX IF NOT EXISTS idx_stock_paper_positions_session_id ON stock_paper_positions(session_id);
CREATE INDEX IF NOT EXISTS idx_stock_paper_positions_status ON stock_paper_positions(status);
CREATE INDEX IF NOT EXISTS idx_stock_paper_trades_session_id ON stock_paper_trades(session_id);
CREATE INDEX IF NOT EXISTS idx_stock_paper_trades_executed_at ON stock_paper_trades(executed_at);

-- RLS (disable for service role — same pattern as crypto tables)
ALTER TABLE stock_paper_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_paper_trades ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_stock_sessions" ON stock_paper_sessions
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_stock_positions" ON stock_paper_positions
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_stock_trades" ON stock_paper_trades
  FOR ALL USING (auth.role() = 'service_role');
