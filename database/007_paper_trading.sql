-- ============================================================================
-- ELIO.MARKET — 007: PAPER TRADING TABLES
-- ============================================================================
-- Tables for paper trading sessions, positions, trades, and scan results.
-- Depends on: 002_supabase_tables.sql
-- ============================================================================

-- ============================================================================
-- 1. PAPER TRADING SESSIONS
-- ============================================================================
-- Each session represents a strategy running in paper trading mode.

CREATE TABLE paper_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,

    -- Config
    initial_capital DECIMAL(14,2) NOT NULL DEFAULT 1000.00,
    current_capital DECIMAL(14,2) NOT NULL DEFAULT 1000.00,
    peak_capital DECIMAL(14,2) NOT NULL DEFAULT 1000.00,

    -- State
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'stopped')),
    pause_reason TEXT,

    -- Portfolio snapshot (JSON serialized VirtualPortfolio state)
    portfolio_state JSONB NOT NULL DEFAULT '{}',

    -- Metrics
    realized_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    unrealized_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_pnl_pct DECIMAL(10,4) NOT NULL DEFAULT 0,
    max_drawdown_pct DECIMAL(10,4) NOT NULL DEFAULT 0,
    total_ticks INT NOT NULL DEFAULT 0,
    last_tick_at TIMESTAMPTZ,

    -- Circuit breaker
    is_circuit_broken BOOLEAN NOT NULL DEFAULT FALSE,
    circuit_broken_reason TEXT,
    circuit_broken_at TIMESTAMPTZ,

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stopped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE paper_sessions IS 'Paper trading sessions. Each session tracks a strategy running with virtual capital.';

CREATE TRIGGER trg_paper_sessions_updated_at BEFORE UPDATE ON paper_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 2. PAPER POSITIONS (open positions within a session)
-- ============================================================================

CREATE TABLE paper_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES paper_sessions(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,

    -- Market
    market_id TEXT NOT NULL,
    market_name TEXT NOT NULL,

    -- Position data
    tier TEXT NOT NULL DEFAULT 'tier3',
    entry_price DECIMAL(20,8) NOT NULL,
    current_price DECIMAL(20,8) NOT NULL,
    quantity DECIMAL(20,8) NOT NULL,
    remaining_quantity DECIMAL(20,8) NOT NULL,
    stake DECIMAL(14,2) NOT NULL,

    -- P&L
    unrealized_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    unrealized_pnl_pct DECIMAL(10,4) NOT NULL DEFAULT 0,

    -- Reason
    entry_reason TEXT NOT NULL,
    signal_confidence DECIMAL(5,2),

    -- Status
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),

    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE paper_positions IS 'Open and closed positions within a paper trading session.';

CREATE TRIGGER trg_paper_positions_updated_at BEFORE UPDATE ON paper_positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 3. PAPER TRADES (completed operations log)
-- ============================================================================

CREATE TABLE paper_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES paper_sessions(id) ON DELETE CASCADE,
    position_id UUID REFERENCES paper_positions(id) ON DELETE SET NULL,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,

    -- Market
    market_id TEXT NOT NULL,
    market_name TEXT NOT NULL,

    -- Operation
    action TEXT NOT NULL CHECK (action IN ('open', 'partial_close', 'full_close', 'circuit_breaker')),
    tier TEXT NOT NULL DEFAULT 'tier3',
    price DECIMAL(20,8) NOT NULL,
    quantity DECIMAL(20,8) NOT NULL,
    stake DECIMAL(14,2) NOT NULL DEFAULT 0,

    -- P&L (for close operations)
    gross_pnl DECIMAL(14,2) DEFAULT 0,
    net_pnl DECIMAL(14,2) DEFAULT 0,
    return_pct DECIMAL(10,4) DEFAULT 0,

    -- Reason
    reason TEXT NOT NULL,
    signal_confidence DECIMAL(5,2),

    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE paper_trades IS 'Complete log of all paper trading operations with reasons.';

-- ============================================================================
-- 4. PAPER SCAN RESULTS (scanner opportunities)
-- ============================================================================

CREATE TABLE paper_scan_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES paper_sessions(id) ON DELETE SET NULL,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,

    -- Market
    market_id TEXT NOT NULL,
    market_name TEXT NOT NULL,
    market_category TEXT,

    -- Score
    score INT NOT NULL CHECK (score >= 0 AND score <= 100),
    motivation TEXT NOT NULL,
    suggested_stake DECIMAL(14,2),

    -- Price at scan
    current_price DECIMAL(20,8) NOT NULL,
    volume_24h DECIMAL(14,2) DEFAULT 0,

    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE paper_scan_results IS 'Scanner results: markets evaluated with score > 60.';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_paper_sessions_user ON paper_sessions(user_id);
CREATE INDEX idx_paper_sessions_strategy ON paper_sessions(strategy_id);
CREATE INDEX idx_paper_sessions_status ON paper_sessions(status);

CREATE INDEX idx_paper_positions_session ON paper_positions(session_id);
CREATE INDEX idx_paper_positions_status ON paper_positions(status);
CREATE INDEX idx_paper_positions_market ON paper_positions(market_id);

CREATE INDEX idx_paper_trades_session ON paper_trades(session_id);
CREATE INDEX idx_paper_trades_strategy ON paper_trades(strategy_id);
CREATE INDEX idx_paper_trades_executed ON paper_trades(executed_at DESC);

CREATE INDEX idx_paper_scan_results_strategy ON paper_scan_results(strategy_id);
CREATE INDEX idx_paper_scan_results_score ON paper_scan_results(score DESC);
CREATE INDEX idx_paper_scan_results_scanned ON paper_scan_results(scanned_at DESC);
