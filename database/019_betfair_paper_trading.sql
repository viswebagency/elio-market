-- ============================================================================
-- 019: Betfair Paper Trading Tables
-- Mirrors crypto/stock paper sessions/positions/trades for exchange betting (M2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS betfair_paper_sessions (
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
  event_types TEXT[] DEFAULT '{}',
  portfolio_state JSONB DEFAULT '{}',
  cooldown_until TIMESTAMPTZ,
  auto_rotation_count INTEGER DEFAULT 0,
  parent_session_id UUID REFERENCES betfair_paper_sessions(id),
  last_warning_level INTEGER,
  last_warning_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS betfair_paper_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES betfair_paper_sessions(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  selection_name TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'back' CHECK (direction IN ('back', 'lay')),
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

CREATE TABLE IF NOT EXISTS betfair_paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES betfair_paper_sessions(id) ON DELETE CASCADE,
  position_id UUID REFERENCES betfair_paper_positions(id),
  market_id TEXT NOT NULL,
  selection_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('enter', 'partial_close', 'full_close', 'circuit_breaker')),
  price NUMERIC(12,4) NOT NULL,
  size NUMERIC(16,8) NOT NULL,
  stake NUMERIC(12,4) DEFAULT 0,
  pnl NUMERIC(12,4) DEFAULT 0,
  pnl_pct NUMERIC(8,4) DEFAULT 0,
  reason TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_betfair_paper_sessions_status ON betfair_paper_sessions(status);
CREATE INDEX IF NOT EXISTS idx_betfair_paper_sessions_strategy_code ON betfair_paper_sessions(strategy_code);
CREATE INDEX IF NOT EXISTS idx_betfair_paper_positions_session_id ON betfair_paper_positions(session_id);
CREATE INDEX IF NOT EXISTS idx_betfair_paper_positions_status ON betfair_paper_positions(status);
CREATE INDEX IF NOT EXISTS idx_betfair_paper_trades_session_id ON betfair_paper_trades(session_id);
CREATE INDEX IF NOT EXISTS idx_betfair_paper_trades_executed_at ON betfair_paper_trades(executed_at);

ALTER TABLE betfair_paper_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE betfair_paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE betfair_paper_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_betfair_sessions" ON betfair_paper_sessions
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_betfair_positions" ON betfair_paper_positions
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_betfair_trades" ON betfair_paper_trades
  FOR ALL USING (auth.role() = 'service_role');
