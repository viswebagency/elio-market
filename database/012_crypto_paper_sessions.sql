-- ============================================================================
-- ELIO.MARKET — 012: CRYPTO PAPER TRADING SESSIONS
-- ============================================================================
-- Dedicated table for crypto paper trading sessions.
-- Unlike paper_sessions (Polymarket), crypto sessions reference strategy_code
-- (hardcoded seeds) instead of strategy_id UUID.
-- ============================================================================

CREATE TABLE crypto_paper_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Strategy reference (seed code, not FK — strategies are hardcoded)
    strategy_code TEXT NOT NULL,
    strategy_name TEXT NOT NULL,

    -- Config
    initial_capital DECIMAL(14,2) NOT NULL DEFAULT 100.00,
    current_capital DECIMAL(14,2) NOT NULL DEFAULT 100.00,
    peak_capital DECIMAL(14,2) NOT NULL DEFAULT 100.00,

    -- State
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'stopped')),
    pause_reason TEXT,

    -- Portfolio snapshot (serialized executor state for restore)
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

    -- Pairs traded
    pairs TEXT[] NOT NULL DEFAULT '{}',

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stopped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE crypto_paper_sessions IS 'Crypto paper trading sessions. Each row tracks a crypto strategy running with virtual capital.';

-- Indexes
CREATE INDEX idx_crypto_paper_sessions_status ON crypto_paper_sessions(status);
CREATE INDEX idx_crypto_paper_sessions_strategy ON crypto_paper_sessions(strategy_code);
CREATE INDEX idx_crypto_paper_sessions_started ON crypto_paper_sessions(started_at DESC);
