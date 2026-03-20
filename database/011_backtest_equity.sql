-- ============================================================================
-- ELIO.MARKET — 011: BACKTEST EQUITY SUPPORT
-- ============================================================================
-- Enables storing backtest equity curves in equity_snapshots table.
-- Changes:
-- 1. Allow 'backtest' status on paper_sessions (virtual backtest sessions)
-- 2. Add 'source' column to equity_snapshots to distinguish paper vs backtest
-- ============================================================================

-- 1. Expand paper_sessions status CHECK to include 'backtest'
ALTER TABLE paper_sessions DROP CONSTRAINT IF EXISTS paper_sessions_status_check;
ALTER TABLE paper_sessions ADD CONSTRAINT paper_sessions_status_check
    CHECK (status IN ('running', 'paused', 'stopped', 'backtest'));

-- 2. Add source column to equity_snapshots (default = paper_trading for backwards compat)
ALTER TABLE equity_snapshots
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'paper_trading'
    CHECK (source IN ('paper_trading', 'backtest'));

-- 3. Add backtest_run_id FK to equity_snapshots (nullable, only set for backtest source)
ALTER TABLE equity_snapshots
    ADD COLUMN IF NOT EXISTS backtest_run_id UUID REFERENCES backtest_runs(id) ON DELETE CASCADE;

-- 4. Index for querying backtest equity curves
CREATE INDEX IF NOT EXISTS idx_equity_snapshots_source ON equity_snapshots(source);
CREATE INDEX IF NOT EXISTS idx_equity_snapshots_backtest_run ON equity_snapshots(backtest_run_id)
    WHERE backtest_run_id IS NOT NULL;

COMMENT ON COLUMN equity_snapshots.source IS 'Source of the snapshot: paper_trading (live paper session) or backtest (simulated)';
COMMENT ON COLUMN equity_snapshots.backtest_run_id IS 'Reference to backtest_runs when source=backtest';
