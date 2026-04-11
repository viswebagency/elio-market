-- ============================================================================
-- ELIO.MARKET — Forex Paper Trading Tables
-- ============================================================================
-- Adds forex_paper_sessions, forex_paper_positions, forex_paper_trades.
-- Follows the same pattern as stock_paper_* tables.
-- ============================================================================

-- ============================================================================
-- 1. FOREX PAPER SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS forex_paper_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Strategy info
    strategy_code TEXT NOT NULL,
    strategy_name TEXT NOT NULL,

    -- Capital tracking
    initial_capital DECIMAL(12,2) NOT NULL DEFAULT 100,
    current_capital DECIMAL(12,2) NOT NULL DEFAULT 100,
    peak_capital DECIMAL(12,2) NOT NULL DEFAULT 100,

    -- Session state
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'stopped')),
    pairs TEXT[] NOT NULL DEFAULT '{}',

    -- PnL metrics
    realized_pnl DECIMAL(12,4) DEFAULT 0,
    unrealized_pnl DECIMAL(12,4) DEFAULT 0,
    total_pnl DECIMAL(12,4) DEFAULT 0,
    total_pnl_pct DECIMAL(8,4) DEFAULT 0,
    max_drawdown_pct DECIMAL(8,4) DEFAULT 0,

    -- Tick tracking
    total_ticks INT NOT NULL DEFAULT 0,
    last_tick_at TIMESTAMPTZ,

    -- Timestamps
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stopped_at TIMESTAMPTZ,

    -- Circuit breaker
    is_circuit_broken BOOLEAN NOT NULL DEFAULT FALSE,
    circuit_broken_reason TEXT,
    circuit_broken_at TIMESTAMPTZ,
    cooldown_until TIMESTAMPTZ,
    pause_reason TEXT,

    -- Auto-rotation
    auto_rotation_count INT NOT NULL DEFAULT 0,
    parent_session_id UUID REFERENCES forex_paper_sessions(id),

    -- Performance warnings
    last_warning_level TEXT,
    last_warning_at TIMESTAMPTZ,

    -- Portfolio state snapshot (JSONB)
    portfolio_state JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE forex_paper_sessions IS 'Forex paper trading sessions — tracks each strategy instance.';

-- ============================================================================
-- 2. FOREX PAPER POSITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS forex_paper_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES forex_paper_sessions(id) ON DELETE CASCADE,

    -- Position info
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'long',
    entry_price DECIMAL(16,6) NOT NULL,
    current_price DECIMAL(16,6) NOT NULL,
    size DECIMAL(16,6) NOT NULL DEFAULT 0,
    stake DECIMAL(12,4) NOT NULL DEFAULT 0,

    -- PnL
    pnl DECIMAL(12,4) DEFAULT 0,
    pnl_pct DECIMAL(8,4) DEFAULT 0,

    -- Metadata
    entry_reason TEXT,
    signal_confidence DECIMAL(5,2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),

    -- Timestamps
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

COMMENT ON TABLE forex_paper_positions IS 'Individual positions within forex paper trading sessions.';

-- ============================================================================
-- 3. FOREX PAPER TRADES
-- ============================================================================

CREATE TABLE IF NOT EXISTS forex_paper_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES forex_paper_sessions(id) ON DELETE CASCADE,

    -- Trade info
    symbol TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('enter', 'full_close', 'circuit_breaker')),
    price DECIMAL(16,6) NOT NULL,
    size DECIMAL(16,6) NOT NULL DEFAULT 0,
    stake DECIMAL(12,4) NOT NULL DEFAULT 0,

    -- PnL (0 for entry trades)
    pnl DECIMAL(12,4) DEFAULT 0,
    pnl_pct DECIMAL(8,4) DEFAULT 0,

    -- Metadata
    reason TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE forex_paper_trades IS 'Trade log for forex paper trading — every enter/exit/circuit_breaker action.';

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_forex_paper_sessions_status ON forex_paper_sessions(status);
CREATE INDEX IF NOT EXISTS idx_forex_paper_sessions_strategy ON forex_paper_sessions(strategy_code);
CREATE INDEX IF NOT EXISTS idx_forex_paper_positions_session ON forex_paper_positions(session_id);
CREATE INDEX IF NOT EXISTS idx_forex_paper_positions_status ON forex_paper_positions(session_id, status);
CREATE INDEX IF NOT EXISTS idx_forex_paper_trades_session ON forex_paper_trades(session_id);
CREATE INDEX IF NOT EXISTS idx_forex_paper_trades_executed ON forex_paper_trades(session_id, executed_at);
