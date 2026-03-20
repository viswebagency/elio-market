-- ============================================================================
-- ELIO.MARKET — 009: EQUITY SNAPSHOTS
-- ============================================================================
-- Daily snapshots of paper trading session capital for equity curve tracking.
-- One row per session per day. Used for:
-- - Equity curve visualization in the strategies page
-- - Daily P&L calculation (today vs yesterday)
-- - Long-term performance analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS equity_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES paper_sessions(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,

    -- Snapshot date (one per day per session)
    snapshot_date DATE NOT NULL,

    -- Capital and P&L at snapshot time
    capital DECIMAL(12,2) NOT NULL,
    realized_pnl DECIMAL(12,2) NOT NULL DEFAULT 0,
    unrealized_pnl DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_pnl DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_pnl_pct DECIMAL(8,4) NOT NULL DEFAULT 0,
    max_drawdown_pct DECIMAL(8,4) NOT NULL DEFAULT 0,

    -- Position count at snapshot
    open_positions INT NOT NULL DEFAULT 0,

    -- Trades executed on this day
    trades_today INT NOT NULL DEFAULT 0,
    pnl_today DECIMAL(12,2) NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One snapshot per session per day
    UNIQUE(session_id, snapshot_date)
);

CREATE INDEX idx_equity_snapshots_strategy ON equity_snapshots(strategy_id, snapshot_date);
CREATE INDEX idx_equity_snapshots_session ON equity_snapshots(session_id, snapshot_date);

COMMENT ON TABLE equity_snapshots IS 'Daily capital snapshots for equity curve tracking. One row per paper trading session per day.';
