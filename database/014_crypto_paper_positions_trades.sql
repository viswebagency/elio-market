-- ============================================================================
-- ELIO.MARKET — 014: CRYPTO PAPER POSITIONS & TRADES
-- ============================================================================
-- Granular position and trade tracking for crypto paper trading.
-- Mirrors paper_positions / paper_trades (Polymarket) but references
-- crypto_paper_sessions instead of paper_sessions.
-- Depends on: 012_crypto_paper_sessions.sql
-- ============================================================================

-- ============================================================================
-- 1. CRYPTO PAPER POSITIONS
-- ============================================================================

CREATE TABLE crypto_paper_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES crypto_paper_sessions(id) ON DELETE CASCADE,

    -- Market
    symbol TEXT NOT NULL,           -- e.g. BTC/USDT
    direction TEXT NOT NULL DEFAULT 'long' CHECK (direction IN ('long', 'short')),

    -- Position data
    entry_price DECIMAL(20,8) NOT NULL,
    current_price DECIMAL(20,8) NOT NULL,
    size DECIMAL(20,8) NOT NULL,    -- quantity in base currency
    stake DECIMAL(14,2) NOT NULL,   -- value in quote currency

    -- P&L
    pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    pnl_pct DECIMAL(10,4) NOT NULL DEFAULT 0,

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

COMMENT ON TABLE crypto_paper_positions IS 'Open and closed positions within a crypto paper trading session.';

CREATE TRIGGER trg_crypto_paper_positions_updated_at BEFORE UPDATE ON crypto_paper_positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 2. CRYPTO PAPER TRADES (audit log)
-- ============================================================================

CREATE TABLE crypto_paper_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES crypto_paper_sessions(id) ON DELETE CASCADE,
    position_id UUID REFERENCES crypto_paper_positions(id) ON DELETE SET NULL,

    -- Market
    symbol TEXT NOT NULL,

    -- Operation
    action TEXT NOT NULL CHECK (action IN ('enter', 'partial_close', 'full_close', 'circuit_breaker')),
    price DECIMAL(20,8) NOT NULL,
    size DECIMAL(20,8) NOT NULL,
    stake DECIMAL(14,2) NOT NULL DEFAULT 0,

    -- P&L (for close operations)
    pnl DECIMAL(14,2) DEFAULT 0,
    pnl_pct DECIMAL(10,4) DEFAULT 0,

    -- Reason
    reason TEXT NOT NULL DEFAULT '',

    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE crypto_paper_trades IS 'Complete log of all crypto paper trading operations.';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_crypto_paper_positions_session ON crypto_paper_positions(session_id);
CREATE INDEX idx_crypto_paper_positions_status ON crypto_paper_positions(status);
CREATE INDEX idx_crypto_paper_positions_symbol ON crypto_paper_positions(symbol);

CREATE INDEX idx_crypto_paper_trades_session ON crypto_paper_trades(session_id);
CREATE INDEX idx_crypto_paper_trades_executed ON crypto_paper_trades(executed_at DESC);
CREATE INDEX idx_crypto_paper_trades_symbol ON crypto_paper_trades(symbol);

-- ============================================================================
-- RLS — service_role only (no user_id on crypto tables)
-- ============================================================================

ALTER TABLE crypto_paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_paper_trades ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (used by cron/API routes via admin client)
CREATE POLICY "service_role_crypto_paper_positions" ON crypto_paper_positions
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_crypto_paper_trades" ON crypto_paper_trades
    FOR ALL USING (true) WITH CHECK (true);
