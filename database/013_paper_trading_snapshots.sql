-- ============================================================================
-- ELIO.MARKET — 013: PAPER TRADING SNAPSHOTS (tick-level)
-- ============================================================================
-- Per-tick equity snapshots for real-time equity curve visualization.
-- One row per session per tick. Used for:
-- - Live equity curve charts in the unified paper trading dashboard
-- - Intraday P&L tracking
-- - Supports both Polymarket (paper_sessions) and Crypto (crypto_paper_sessions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_trading_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Session reference (generic — works for both paper_sessions and crypto_paper_sessions)
    session_id UUID NOT NULL,

    -- Area discriminator: 'polymarket' or 'crypto'
    area TEXT NOT NULL CHECK (area IN ('polymarket', 'crypto')),

    -- Snapshot data
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    equity DECIMAL(12,2) NOT NULL,
    pnl_pct DECIMAL(8,4) NOT NULL DEFAULT 0,

    -- Optional: number of open positions at this tick
    open_positions INT NOT NULL DEFAULT 0
);

-- Indexes for efficient querying
CREATE INDEX idx_pt_snapshots_session_ts ON paper_trading_snapshots(session_id, timestamp DESC);
CREATE INDEX idx_pt_snapshots_area ON paper_trading_snapshots(area, timestamp DESC);

COMMENT ON TABLE paper_trading_snapshots IS 'Per-tick equity snapshots for real-time equity curve visualization. Supports both Polymarket and Crypto sessions.';
