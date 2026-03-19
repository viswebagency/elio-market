-- ============================================================================
-- ELIO.MARKET — 010: TIMESCALEDB HYPERTABLES & CONTINUOUS AGGREGATES
-- ============================================================================
-- Time series database for all high-frequency temporal data.
-- Separated from Supabase for performance (FILE_SACRO section 12.2).
--
-- Principles (FILE_SACRO section 12.3):
--   - Normalized format independent from data source
--   - Permanent historicization: APIs change, data stays
--   - Aggressive compression for old data
--   - Continuous aggregates for common queries
--   - NO retention policy: data is stored forever
--
-- Hypertables:
--   1. market_prices       — Normalized prices for all 5 areas
--   2. strategy_performance — Equity curve per strategy
--   3. area_performance     — Aggregated per-area metrics
--   4. market_volumes       — Volume and liquidity tracking
--   5. global_performance   — Cross-area meta-dashboard
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS & ENUMS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enums duplicated from Supabase for database independence.
-- TimescaleDB runs on a separate instance (FILE_SACRO section 12.2).

CREATE TYPE ts_area_type AS ENUM (
    'polymarket',
    'betfair',
    'stocks',
    'forex',
    'crypto'
);

CREATE TYPE ts_data_source AS ENUM (
    'polymarket_api',    -- Polymarket API (gratuita, completa, WebSocket real-time)
    'betfair_api',       -- Betfair Exchange API (autenticazione SSL)
    'yahoo_finance',     -- Yahoo Finance (gratis)
    'alpha_vantage',     -- Alpha Vantage (gratis)
    'twelve_data',       -- Twelve Data (premium se necessario)
    'mt5_api',           -- MetaTrader 5 API (forex)
    'binance_api',       -- Binance API (spot 0.1%)
    'bybit_api',         -- Bybit API (futures 0.02-0.04%)
    'api_football',      -- API-Football (dati sport)
    'manual'             -- Dati inseriti manualmente
);

CREATE TYPE ts_price_type AS ENUM (
    'odds',          -- Polymarket/Betfair: quote/probabilita
    'back',          -- Betfair: quota back
    'lay',           -- Betfair: quota lay
    'ohlcv',         -- Azioni/Forex/Crypto: candele OHLCV
    'spot',          -- Crypto spot price
    'futures',       -- Crypto futures / derivati
    'perpetual',     -- Crypto perpetual contracts
    'bid',           -- Forex bid price
    'ask',           -- Forex ask price
    'mid',           -- Mid-price (average bid/ask)
    'index',         -- Index value (es. S&P 500, benchmark)
    'nav'            -- Net Asset Value (ETF/fondi)
);

-- ============================================================================
-- 1. MARKET PRICES (main hypertable)
-- ============================================================================
-- Normalized format for ALL data sources (FILE_SACRO section 12.3).
-- One record = one price/odds datapoint at a specific moment.
--
-- Chunk interval: 1 day.
-- Rationale: tick-level data for Betfair in-play and 1-min candles for
-- crypto/forex produce millions of rows/day. Daily chunks are optimal
-- for "last N days" queries.

CREATE TABLE market_prices (
    time TIMESTAMPTZ NOT NULL,

    -- Market identification
    area ts_area_type NOT NULL,
    source ts_data_source NOT NULL,
    symbol TEXT NOT NULL,                            -- Normalized symbol: 'TRUMP_WIN', 'MAN_UTD-LIV_MATCH_ODDS', 'AAPL', 'EURUSD', 'BTCUSDT'
    market_id TEXT,                                  -- Native platform ID (es. Betfair market ID, Polymarket condition ID)
    selection_id TEXT,                               -- Sub-market ID (es. Betfair selection, Polymarket outcome)
    price_type ts_price_type NOT NULL,

    -- OHLCV prices (for candles: stocks/forex/crypto)
    open DECIMAL(20,8),
    high DECIMAL(20,8),
    low DECIMAL(20,8),
    close DECIMAL(20,8),
    volume DECIMAL(20,4),

    -- Single prices (for odds, spot, bid/ask)
    price DECIMAL(20,8),                             -- Current price/odds
    price_implied_prob DECIMAL(7,4),                 -- Implied probability (for odds)

    -- Spread/book (for Betfair exchange, order book)
    best_back DECIMAL(20,8),
    best_lay DECIMAL(20,8),
    spread DECIMAL(20,8),
    available_back_volume DECIMAL(20,4),
    available_lay_volume DECIMAL(20,4),

    -- Metadata
    interval TEXT,                                   -- Granularity: 'tick', '1s', '1m', '5m', '15m', '1h', '4h', '1d', '1w'
    currency CHAR(3) DEFAULT 'EUR',
    is_live BOOLEAN DEFAULT FALSE,                   -- TRUE if in-play (Betfair) or live market
    extra JSONB DEFAULT '{}'                         -- Source-specific extra data
);

-- Create hypertable with 1-day chunks
SELECT create_hypertable('market_prices', 'time', chunk_time_interval => INTERVAL '1 day');

-- Indexes for most common queries
CREATE INDEX idx_mp_symbol_time ON market_prices (symbol, time DESC);
CREATE INDEX idx_mp_area_symbol ON market_prices (area, symbol, time DESC);
CREATE INDEX idx_mp_area_symbol_type ON market_prices (area, symbol, price_type, time DESC);
CREATE INDEX idx_mp_source ON market_prices (source, time DESC);
CREATE INDEX idx_mp_market_id ON market_prices (market_id, time DESC) WHERE market_id IS NOT NULL;
CREATE INDEX idx_mp_selection ON market_prices (market_id, selection_id, time DESC) WHERE selection_id IS NOT NULL;
CREATE INDEX idx_mp_live ON market_prices (area, symbol, time DESC) WHERE is_live = TRUE;

-- Compression: after 7 days, compress.
-- Recent data stays uncompressed for fast queries.
-- Historical data compressed ~90% space savings.
ALTER TABLE market_prices SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'area, symbol, price_type',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('market_prices', INTERVAL '7 days');

-- NO retention policy: permanent historicization (FILE_SACRO section 12.3)
-- "Storicizzazione: ogni dato salvato permanentemente. Le API cambiano, i dati spariscono"

-- ============================================================================
-- 2. STRATEGY PERFORMANCE (equity curve)
-- ============================================================================
-- Equity curve for each strategy over time (FILE_SACRO section 11.1).
-- One record per strategy per day (or per trade for higher granularity).
--
-- Chunk interval: 7 days.
-- Rationale: much lower volume than prices (1 record/strategy/day).

CREATE TABLE strategy_performance (
    time TIMESTAMPTZ NOT NULL,

    -- References (UUID as text to avoid cross-DB dependency)
    user_id TEXT NOT NULL,
    strategy_id TEXT NOT NULL,
    strategy_code TEXT NOT NULL,                      -- es. 'PM-003 v2'
    area ts_area_type NOT NULL,

    -- Equity tracking
    equity DECIMAL(14,2) NOT NULL,                   -- Current portfolio value for this strategy
    cash DECIMAL(14,2),                              -- Available cash
    invested DECIMAL(14,2),                          -- Currently invested capital

    -- Cumulative performance (FILE_SACRO section 11.1)
    total_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,      -- Cumulative net P&L
    total_trades INT NOT NULL DEFAULT 0,
    winning_trades INT NOT NULL DEFAULT 0,
    losing_trades INT NOT NULL DEFAULT 0,

    -- Rolling metrics
    win_rate DECIMAL(5,2),
    roi DECIMAL(10,2),
    profit_factor DECIMAL(10,4),
    max_drawdown DECIMAL(5,2),
    current_drawdown DECIMAL(5,2),
    sharpe_ratio DECIMAL(10,4),
    sortino_ratio DECIMAL(10,4),
    avg_edge DECIMAL(5,2),                           -- Average edge (FILE_SACRO section 11.1)
    avg_holding_time INTERVAL,

    -- Slippage tracking (FILE_SACRO section 11.1)
    -- "Lo slippage reale viene tracciato nel live e confrontato con quello simulato"
    avg_slippage_simulated DECIMAL(5,4),
    avg_slippage_real DECIMAL(5,4),

    -- Benchmark comparison (FILE_SACRO section 11.2)
    -- "Se non batte il benchmark, non serve — anche se e in positivo"
    benchmark_return DECIMAL(10,2),
    alpha DECIMAL(10,2)                              -- Return vs benchmark
);

SELECT create_hypertable('strategy_performance', 'time', chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_sp_strategy ON strategy_performance (strategy_id, time DESC);
CREATE INDEX idx_sp_user_area ON strategy_performance (user_id, area, time DESC);
CREATE INDEX idx_sp_user ON strategy_performance (user_id, time DESC);
CREATE INDEX idx_sp_strategy_code ON strategy_performance (strategy_code, time DESC);

ALTER TABLE strategy_performance SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'user_id, strategy_id',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('strategy_performance', INTERVAL '30 days');

-- ============================================================================
-- 3. AREA PERFORMANCE (aggregated per area)
-- ============================================================================
-- Aggregated performance per area over time (FILE_SACRO section 2: meta-dashboard).
-- "Dove rende di piu il capitale?"
--
-- Chunk interval: 7 days.

CREATE TABLE area_performance (
    time TIMESTAMPTZ NOT NULL,

    user_id TEXT NOT NULL,
    area ts_area_type NOT NULL,

    -- Aggregated equity for the area
    total_equity DECIMAL(14,2) NOT NULL,
    total_bankroll DECIMAL(14,2) NOT NULL,
    total_invested DECIMAL(14,2),

    -- Performance
    daily_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    cumulative_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    roi DECIMAL(10,2),
    max_drawdown DECIMAL(5,2),
    current_drawdown DECIMAL(5,2),

    -- Counts
    active_strategies INT NOT NULL DEFAULT 0,
    total_trades_today INT NOT NULL DEFAULT 0,
    winning_trades_today INT NOT NULL DEFAULT 0,

    -- Benchmark (FILE_SACRO section 6.5)
    -- Polymarket: random buy at 50%
    -- Betfair: always follow favorite
    -- Stocks: S&P 500 buy & hold (~10% annual)
    -- Forex: EUR/USD buy & hold (~0%)
    -- Crypto: BTC buy & hold
    benchmark_value DECIMAL(20,8),
    benchmark_return DECIMAL(10,2),
    alpha DECIMAL(10,2)
);

SELECT create_hypertable('area_performance', 'time', chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_ap_user_area ON area_performance (user_id, area, time DESC);
CREATE INDEX idx_ap_user ON area_performance (user_id, time DESC);
CREATE INDEX idx_ap_area ON area_performance (area, time DESC);

ALTER TABLE area_performance SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'user_id, area',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('area_performance', INTERVAL '30 days');

-- ============================================================================
-- 4. MARKET VOLUMES
-- ============================================================================
-- Market volumes over time, for detecting anomalies and calculating liquidity.
-- Used for the anomaly detection alert system (FILE_SACRO section 9).
--
-- Chunk interval: 1 day.

CREATE TABLE market_volumes (
    time TIMESTAMPTZ NOT NULL,

    area ts_area_type NOT NULL,
    source ts_data_source NOT NULL,
    symbol TEXT NOT NULL,
    market_id TEXT,

    -- Volumes
    volume DECIMAL(20,4) NOT NULL,                   -- Volume in the period
    volume_currency DECIMAL(20,2),                   -- Volume in currency (EUR)
    trade_count INT,                                 -- Number of trades in the period
    open_interest DECIMAL(20,4),                     -- For futures/perpetual

    -- Liquidity
    avg_spread DECIMAL(20,8),
    avg_depth DECIMAL(20,4),                         -- Average order book depth
    bid_volume DECIMAL(20,4),
    ask_volume DECIMAL(20,4),

    -- Anomaly detection
    volume_zscore DECIMAL(10,4),                     -- Z-score vs historical (for anomaly alerts)

    interval TEXT NOT NULL DEFAULT '1h',             -- Granularity: '1m', '5m', '1h', '1d'
    currency CHAR(3) DEFAULT 'EUR'
);

SELECT create_hypertable('market_volumes', 'time', chunk_time_interval => INTERVAL '1 day');

CREATE INDEX idx_mv_symbol ON market_volumes (symbol, time DESC);
CREATE INDEX idx_mv_area ON market_volumes (area, time DESC);
CREATE INDEX idx_mv_area_symbol ON market_volumes (area, symbol, time DESC);
CREATE INDEX idx_mv_market_id ON market_volumes (market_id, time DESC) WHERE market_id IS NOT NULL;
CREATE INDEX idx_mv_anomaly ON market_volumes (volume_zscore) WHERE volume_zscore > 2 OR volume_zscore < -2;

ALTER TABLE market_volumes SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'area, symbol',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('market_volumes', INTERVAL '7 days');

-- ============================================================================
-- 5. GLOBAL PERFORMANCE (meta-dashboard)
-- ============================================================================
-- Cross-area aggregate for the meta-dashboard (FILE_SACRO section 2: top level).
-- "Dove rende di piu il capitale?"
-- "Correlazioni cross-area" (FILE_SACRO section 10).

CREATE TABLE global_performance (
    time TIMESTAMPTZ NOT NULL,

    user_id TEXT NOT NULL,

    -- Totals
    total_equity DECIMAL(14,2) NOT NULL,
    total_bankroll DECIMAL(14,2) NOT NULL,
    daily_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    cumulative_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    roi DECIMAL(10,2),
    max_drawdown DECIMAL(5,2),
    current_drawdown DECIMAL(5,2),                   -- If > 30% = FULL STOP (FILE_SACRO 6.1 rule 3)

    -- Per-area breakdown (denormalized for fast dashboard queries)
    pnl_polymarket DECIMAL(14,2) DEFAULT 0,
    pnl_betfair DECIMAL(14,2) DEFAULT 0,
    pnl_stocks DECIMAL(14,2) DEFAULT 0,
    pnl_forex DECIMAL(14,2) DEFAULT 0,
    pnl_crypto DECIMAL(14,2) DEFAULT 0,

    -- Per-area equity
    equity_polymarket DECIMAL(14,2) DEFAULT 0,
    equity_betfair DECIMAL(14,2) DEFAULT 0,
    equity_stocks DECIMAL(14,2) DEFAULT 0,
    equity_forex DECIMAL(14,2) DEFAULT 0,
    equity_crypto DECIMAL(14,2) DEFAULT 0,

    -- Cross-area correlations (FILE_SACRO section 10)
    -- "Elezioni su Polymarket -> impatto su azioni difesa/energia/forex"
    -- "Risultati Champions -> movimento quote Betfair + azioni club quotati"
    -- "Decisioni banche centrali -> impatto su azioni + Polymarket economia + forex"
    cross_area_correlations JSONB DEFAULT '{}',       -- Correlation matrix

    -- Active counts
    total_active_strategies INT DEFAULT 0,
    total_open_trades INT DEFAULT 0
);

SELECT create_hypertable('global_performance', 'time', chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_gp_user ON global_performance (user_id, time DESC);

ALTER TABLE global_performance SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'user_id',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('global_performance', INTERVAL '30 days');

-- ============================================================================
-- 6. CONTINUOUS AGGREGATES
-- ============================================================================
-- Materialized views for common queries. TimescaleDB refreshes them in background.
-- Pre-computes the most frequent dashboard queries to reduce load on raw hypertables.

-- ----------------------------------------------------------------------------
-- 6.1 Market Prices — Hourly aggregate (from tick/1min to 1h)
-- For dashboards and analysis that don't need minute-level granularity.
-- ----------------------------------------------------------------------------

CREATE MATERIALIZED VIEW market_prices_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    area,
    symbol,
    price_type,
    FIRST(open, time) AS open,
    MAX(high) AS high,
    MIN(low) AS low,
    LAST(close, time) AS close,
    SUM(volume) AS volume,
    FIRST(price, time) AS first_price,
    LAST(price, time) AS last_price,
    AVG(price) AS avg_price,
    MIN(price) AS min_price,
    MAX(price) AS max_price,
    LAST(best_back, time) AS last_best_back,
    LAST(best_lay, time) AS last_best_lay,
    AVG(spread) AS avg_spread,
    COUNT(*) AS tick_count
FROM market_prices
GROUP BY bucket, area, symbol, price_type
WITH NO DATA;

-- Refresh every 30 minutes, data from the last 2 days
SELECT add_continuous_aggregate_policy('market_prices_1h',
    start_offset => INTERVAL '2 days',
    end_offset => INTERVAL '30 minutes',
    schedule_interval => INTERVAL '30 minutes'
);

-- ----------------------------------------------------------------------------
-- 6.2 Market Prices — Daily aggregate (for historical charts and backtests)
-- ----------------------------------------------------------------------------

CREATE MATERIALIZED VIEW market_prices_1d
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    area,
    symbol,
    price_type,
    FIRST(open, time) AS open,
    MAX(high) AS high,
    MIN(low) AS low,
    LAST(close, time) AS close,
    SUM(volume) AS volume,
    FIRST(price, time) AS first_price,
    LAST(price, time) AS last_price,
    AVG(price) AS avg_price,
    LAST(best_back, time) AS last_best_back,
    LAST(best_lay, time) AS last_best_lay,
    AVG(spread) AS avg_spread,
    COUNT(*) AS tick_count
FROM market_prices
GROUP BY bucket, area, symbol, price_type
WITH NO DATA;

-- Refresh every 1 hour
SELECT add_continuous_aggregate_policy('market_prices_1d',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- ----------------------------------------------------------------------------
-- 6.3 Market Prices — Weekly aggregate (for long-term analysis)
-- ----------------------------------------------------------------------------

CREATE MATERIALIZED VIEW market_prices_1w
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('7 days', time) AS bucket,
    area,
    symbol,
    price_type,
    FIRST(open, time) AS open,
    MAX(high) AS high,
    MIN(low) AS low,
    LAST(close, time) AS close,
    SUM(volume) AS volume,
    FIRST(price, time) AS first_price,
    LAST(price, time) AS last_price,
    AVG(price) AS avg_price,
    COUNT(*) AS tick_count
FROM market_prices
GROUP BY bucket, area, symbol, price_type
WITH NO DATA;

SELECT add_continuous_aggregate_policy('market_prices_1w',
    start_offset => INTERVAL '14 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day'
);

-- ----------------------------------------------------------------------------
-- 6.4 Market Volumes — Daily aggregate
-- ----------------------------------------------------------------------------

CREATE MATERIALIZED VIEW market_volumes_1d
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    area,
    symbol,
    SUM(volume) AS total_volume,
    SUM(volume_currency) AS total_volume_currency,
    SUM(trade_count) AS total_trades,
    AVG(avg_spread) AS avg_spread,
    AVG(avg_depth) AS avg_depth,
    LAST(open_interest, time) AS last_open_interest,
    MAX(volume_zscore) AS max_volume_zscore
FROM market_volumes
GROUP BY bucket, area, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('market_volumes_1d',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- ----------------------------------------------------------------------------
-- 6.5 Strategy Performance — Weekly (for comparisons and rankings)
-- Used for the intra-area strategy comparison (FILE_SACRO section 2).
-- ----------------------------------------------------------------------------

CREATE MATERIALIZED VIEW strategy_performance_1w
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('7 days', time) AS bucket,
    user_id,
    strategy_id,
    strategy_code,
    area,
    LAST(equity, time) AS equity,
    LAST(total_pnl, time) AS total_pnl,
    LAST(total_trades, time) AS total_trades,
    LAST(win_rate, time) AS win_rate,
    LAST(roi, time) AS roi,
    LAST(profit_factor, time) AS profit_factor,
    LAST(max_drawdown, time) AS max_drawdown,
    LAST(sharpe_ratio, time) AS sharpe_ratio,
    LAST(alpha, time) AS alpha
FROM strategy_performance
GROUP BY bucket, user_id, strategy_id, strategy_code, area
WITH NO DATA;

SELECT add_continuous_aggregate_policy('strategy_performance_1w',
    start_offset => INTERVAL '14 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day'
);

-- ----------------------------------------------------------------------------
-- 6.6 Area Performance — Weekly (for meta-dashboard)
-- "Dove rende di piu il capitale?" (FILE_SACRO section 2)
-- ----------------------------------------------------------------------------

CREATE MATERIALIZED VIEW area_performance_1w
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('7 days', time) AS bucket,
    user_id,
    area,
    LAST(total_equity, time) AS total_equity,
    SUM(daily_pnl) AS weekly_pnl,
    LAST(cumulative_pnl, time) AS cumulative_pnl,
    LAST(roi, time) AS roi,
    LAST(max_drawdown, time) AS max_drawdown,
    LAST(benchmark_return, time) AS benchmark_return,
    LAST(alpha, time) AS alpha,
    SUM(total_trades_today) AS weekly_trades
FROM area_performance
GROUP BY bucket, user_id, area
WITH NO DATA;

SELECT add_continuous_aggregate_policy('area_performance_1w',
    start_offset => INTERVAL '14 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day'
);

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Get the latest price for a symbol
CREATE OR REPLACE FUNCTION get_latest_price(p_symbol TEXT, p_area ts_area_type)
RETURNS TABLE(
    time TIMESTAMPTZ,
    price DECIMAL(20,8),
    best_back DECIMAL(20,8),
    best_lay DECIMAL(20,8),
    spread DECIMAL(20,8)
) AS $$
    SELECT mp.time, mp.price, mp.best_back, mp.best_lay, mp.spread
    FROM market_prices mp
    WHERE mp.symbol = p_symbol AND mp.area = p_area
    ORDER BY mp.time DESC
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Get OHLCV data for a symbol in a time range with configurable interval
CREATE OR REPLACE FUNCTION get_ohlcv(
    p_symbol TEXT,
    p_area ts_area_type,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ,
    p_interval TEXT DEFAULT '1h'
) RETURNS TABLE(
    bucket TIMESTAMPTZ,
    open DECIMAL(20,8),
    high DECIMAL(20,8),
    low DECIMAL(20,8),
    close DECIMAL(20,8),
    volume DECIMAL(20,4)
) AS $$
    SELECT
        time_bucket(p_interval::INTERVAL, mp.time) AS bucket,
        FIRST(mp.open, mp.time),
        MAX(mp.high),
        MIN(mp.low),
        LAST(mp.close, mp.time),
        SUM(mp.volume)
    FROM market_prices mp
    WHERE mp.symbol = p_symbol
      AND mp.area = p_area
      AND mp.time >= p_start
      AND mp.time <= p_end
      AND mp.price_type = 'ohlcv'
    GROUP BY bucket
    ORDER BY bucket;
$$ LANGUAGE SQL STABLE;

-- Get equity curve for a strategy
CREATE OR REPLACE FUNCTION get_equity_curve(
    p_strategy_id TEXT,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ
) RETURNS TABLE(
    time TIMESTAMPTZ,
    equity DECIMAL(14,2),
    total_pnl DECIMAL(14,2),
    drawdown DECIMAL(5,2),
    roi DECIMAL(10,2)
) AS $$
    SELECT sp.time, sp.equity, sp.total_pnl, sp.current_drawdown, sp.roi
    FROM strategy_performance sp
    WHERE sp.strategy_id = p_strategy_id
      AND sp.time >= p_start
      AND sp.time <= p_end
    ORDER BY sp.time;
$$ LANGUAGE SQL STABLE;

-- Get cross-area comparison for a user (meta-dashboard)
CREATE OR REPLACE FUNCTION get_area_comparison(
    p_user_id TEXT,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ
) RETURNS TABLE(
    area ts_area_type,
    total_pnl DECIMAL(14,2),
    roi DECIMAL(10,2),
    max_drawdown DECIMAL(5,2),
    alpha DECIMAL(10,2),
    trade_count BIGINT
) AS $$
    SELECT
        ap.area,
        LAST(ap.cumulative_pnl, ap.time) - FIRST(ap.cumulative_pnl, ap.time) AS total_pnl,
        LAST(ap.roi, ap.time) AS roi,
        MAX(ap.max_drawdown) AS max_drawdown,
        LAST(ap.alpha, ap.time) AS alpha,
        SUM(ap.total_trades_today) AS trade_count
    FROM area_performance ap
    WHERE ap.user_id = p_user_id
      AND ap.time >= p_start
      AND ap.time <= p_end
    GROUP BY ap.area
    ORDER BY total_pnl DESC;
$$ LANGUAGE SQL STABLE;

-- Get volume anomalies (for alert system, FILE_SACRO section 9)
CREATE OR REPLACE FUNCTION get_volume_anomalies(
    p_area ts_area_type DEFAULT NULL,
    p_zscore_threshold DECIMAL DEFAULT 2.0,
    p_lookback INTERVAL DEFAULT '24 hours'
) RETURNS TABLE(
    time TIMESTAMPTZ,
    area ts_area_type,
    symbol TEXT,
    volume DECIMAL(20,4),
    volume_zscore DECIMAL(10,4)
) AS $$
    SELECT mv.time, mv.area, mv.symbol, mv.volume, mv.volume_zscore
    FROM market_volumes mv
    WHERE mv.time >= NOW() - p_lookback
      AND ABS(mv.volume_zscore) >= p_zscore_threshold
      AND (p_area IS NULL OR mv.area = p_area)
    ORDER BY ABS(mv.volume_zscore) DESC;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- 8. SUMMARY
-- ============================================================================
--
-- HYPERTABLE                  | CHUNK INTERVAL | COMPRESS AFTER | RETENTION
-- ----------------------------|----------------|----------------|----------
-- market_prices               | 1 day          | 7 days         | Forever (FILE_SACRO 12.3)
-- strategy_performance        | 7 days         | 30 days        | Forever
-- area_performance            | 7 days         | 30 days        | Forever
-- market_volumes              | 1 day          | 7 days         | Forever
-- global_performance          | 7 days         | 30 days        | Forever
--
-- CONTINUOUS AGGREGATE        | GRANULARITY | REFRESH INTERVAL | START OFFSET
-- ----------------------------|-------------|------------------|-------------
-- market_prices_1h            | 1 hour      | 30 min           | 2 days
-- market_prices_1d            | 1 day       | 1 hour           | 3 days
-- market_prices_1w            | 1 week      | 1 day            | 14 days
-- market_volumes_1d           | 1 day       | 1 hour           | 3 days
-- strategy_performance_1w     | 1 week      | 1 day            | 14 days
-- area_performance_1w         | 1 week      | 1 day            | 14 days
--
-- Design rationale:
-- - 1-day chunks for market_prices: tick-level Betfair + 1-min crypto/forex
--   = millions of rows/day. Daily chunks are optimal for "last N days" queries.
-- - 7-day chunks for performance tables: much lower volume (1 row/strategy/day),
--   weekly chunks reduce management overhead.
-- - Aggressive compression (7 days for prices): compressed data uses ~90% less
--   space and queries on compressed data are still fast.
-- - NO retention policy: FILE_SACRO mandates permanent historicization.
-- - Continuous aggregates pre-compute the most common dashboard/chart queries,
--   reducing load on raw hypertables by orders of magnitude.
-- - Weekly aggregate added for market_prices to support long-term analysis
--   and multi-year backtests efficiently.
