-- ============================================================================
-- ELIO.MARKET — 017: LIVE TRADING TABLES
-- ============================================================================
-- Tabelle dedicate per il live trading crypto.
-- Separate dalle tabelle paper trading per:
--   1. Schema ottimizzato per le query real-time della dashboard
--   2. Nessun rischio di interferenza con il paper trading esistente
--   3. Colonne specifiche per reconciliation, slippage, fees
--
-- Depends on: profiles, strategies
-- ============================================================================

-- ============================================================================
-- 1. LIVE BANKROLL — Bankroll dedicato al live trading per utente
-- ============================================================================

CREATE TABLE IF NOT EXISTS live_bankroll (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    initial_capital DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_capital DECIMAL(14,2) NOT NULL DEFAULT 0,
    peak_capital DECIMAL(14,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USDT',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id)
);

COMMENT ON TABLE live_bankroll IS 'Per-user live trading bankroll. Separate from paper bankrolls table. Tracks real capital on exchange.';

-- ============================================================================
-- 2. LIVE POSITIONS — Posizioni aperte sul broker reale
-- ============================================================================

CREATE TABLE IF NOT EXISTS live_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,

    symbol TEXT NOT NULL,                       -- e.g. 'BTC/USDT'
    direction TEXT NOT NULL DEFAULT 'long',     -- 'long' | 'short'
    size DECIMAL(20,8) NOT NULL,               -- Amount in base asset
    entry_price DECIMAL(20,8) NOT NULL,
    current_price DECIMAL(20,8) NOT NULL DEFAULT 0,
    unrealized_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    unrealized_pnl_pct DECIMAL(8,4) NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'open',        -- 'open' | 'closing' | 'closed'
    broker_order_id TEXT,                       -- Entry order ID from exchange

    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE live_positions IS 'Open live trading positions on the real exchange. Updated every cron tick with current prices.';

-- ============================================================================
-- 3. LIVE TRADES — Storico trade eseguiti (entry + exit completati)
-- ============================================================================

CREATE TABLE IF NOT EXISTS live_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
    position_id UUID REFERENCES live_positions(id) ON DELETE SET NULL,

    symbol TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'long',

    entry_price DECIMAL(20,8),
    exit_price DECIMAL(20,8),
    size DECIMAL(20,8) NOT NULL,

    -- P&L (always net: gross - commission - slippage)
    pnl DECIMAL(14,2) DEFAULT 0,
    commission DECIMAL(14,2) DEFAULT 0,
    slippage DECIMAL(8,4) DEFAULT 0,          -- Slippage in percentage

    -- Reconciliation
    broker_entry_order_id TEXT,
    broker_exit_order_id TEXT,
    reconciliation_status TEXT,                -- 'filled' | 'partial_fill' | 'cancelled' | 'timeout'
    actual_fill_price DECIMAL(20,8),
    fill_time_ms INT,                          -- Time to fill in milliseconds

    status TEXT NOT NULL DEFAULT 'open',        -- 'open' | 'closed' | 'cancelled'
    exit_reason TEXT,                           -- 'take_profit' | 'stop_loss' | 'signal' | 'kill_switch'

    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE live_trades IS 'Completed live trades with full P&L, commission, slippage, and reconciliation data.';

-- ============================================================================
-- 4. LIVE EQUITY SNAPSHOTS — Curva equity per la dashboard
-- ============================================================================

CREATE TABLE IF NOT EXISTS live_equity_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    equity DECIMAL(14,2) NOT NULL,
    pnl_pct DECIMAL(8,4) NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE live_equity_snapshots IS 'Equity curve snapshots for live trading dashboard. One per cron tick or daily snapshot.';

-- ============================================================================
-- 5. ADD broker_name TO strategies (for live execution routing)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'strategies' AND column_name = 'broker_name'
    ) THEN
        ALTER TABLE strategies ADD COLUMN broker_name TEXT DEFAULT 'binance';
    END IF;
END $$;

COMMENT ON COLUMN strategies.broker_name IS 'Broker to use for live execution. Default binance.';

-- ============================================================================
-- 6. RLS — Row Level Security
-- ============================================================================

ALTER TABLE live_bankroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_equity_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY live_bankroll_user_policy ON live_bankroll
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY live_positions_user_policy ON live_positions
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY live_trades_user_policy ON live_trades
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY live_equity_snapshots_user_policy ON live_equity_snapshots
    FOR ALL USING (user_id = auth.uid());

-- ============================================================================
-- 7. INDEXES — Performance optimization
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_live_positions_user_status
    ON live_positions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_live_positions_opened_at
    ON live_positions(opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_trades_user_executed
    ON live_trades(user_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_trades_user_status
    ON live_trades(user_id, status);

CREATE INDEX IF NOT EXISTS idx_live_equity_user_ts
    ON live_equity_snapshots(user_id, timestamp ASC);

CREATE INDEX IF NOT EXISTS idx_live_bankroll_user
    ON live_bankroll(user_id);
