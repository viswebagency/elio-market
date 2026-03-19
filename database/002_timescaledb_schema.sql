-- ============================================================================
-- ELIO.MARKET — TIMESCALEDB (Time Series) SCHEMA
-- ============================================================================
-- Hypertables per tutti i dati temporali ad alta frequenza.
-- Separato da Supabase per performance (sezione 12.2 FILE_SACRO).
--
-- Principi:
--   - Formato normalizzato indipendente dalla fonte (sezione 12.3)
--   - Storicizzazione permanente: le API cambiano, i dati restano
--   - Compressione aggressiva per dati vecchi
--   - Continuous aggregates per query frequenti
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================================
-- 1. ENUM TYPES (duplicati da Supabase per indipendenza)
-- ============================================================================

CREATE TYPE ts_area_type AS ENUM (
    'polymarket',
    'betfair',
    'stocks',
    'forex',
    'crypto'
);

CREATE TYPE ts_data_source AS ENUM (
    'polymarket_api',
    'betfair_api',
    'yahoo_finance',
    'alpha_vantage',
    'twelve_data',
    'mt5_api',
    'binance_api',
    'bybit_api',
    'manual'
);

CREATE TYPE ts_price_type AS ENUM (
    'odds',          -- Polymarket/Betfair: quote/probabilita
    'back',          -- Betfair: quota back
    'lay',           -- Betfair: quota lay
    'ohlcv',         -- Azioni/Forex/Crypto: candele
    'spot',          -- Crypto spot
    'futures',       -- Crypto futures / derivati
    'bid',           -- Forex bid
    'ask',           -- Forex ask
    'mid'            -- Prezzo medio
);

-- ============================================================================
-- 2. MARKET PRICES (hypertable principale)
-- ============================================================================
-- Formato normalizzato per TUTTE le fonti dati (sezione 12.3).
-- Un record = un datapoint di prezzo/quota in un momento specifico.
--
-- Chunk interval: 1 giorno.
-- Motivo: dati ad alta frequenza (tick-level per Betfair in-play,
-- 1-min per crypto/forex), un giorno produce chunk gestibili (~50-200MB).

CREATE TABLE market_prices (
    time TIMESTAMPTZ NOT NULL,

    -- Identificazione mercato
    area ts_area_type NOT NULL,
    source ts_data_source NOT NULL,
    symbol TEXT NOT NULL,                            -- es. 'TRUMP_WIN', 'MAN_UTD-LIV_MATCH_ODDS', 'AAPL', 'EURUSD', 'BTCUSDT'
    market_id TEXT,                                  -- ID nativo della piattaforma (es. Betfair market ID)
    price_type ts_price_type NOT NULL,

    -- Prezzi OHLCV (per candele azioni/forex/crypto)
    open DECIMAL(20,8),
    high DECIMAL(20,8),
    low DECIMAL(20,8),
    close DECIMAL(20,8),
    volume DECIMAL(20,4),

    -- Prezzi singoli (per odds, spot, bid/ask)
    price DECIMAL(20,8),                             -- prezzo/quota corrente
    price_implied_prob DECIMAL(7,4),                 -- probabilita implicita (per odds)

    -- Spread/book (per Betfair, order book)
    best_back DECIMAL(20,8),
    best_lay DECIMAL(20,8),
    spread DECIMAL(20,8),
    available_back_volume DECIMAL(20,4),
    available_lay_volume DECIMAL(20,4),

    -- Metadata
    interval TEXT,                                   -- es. '1m', '5m', '1h', '1d', 'tick'
    currency CHAR(3) DEFAULT 'EUR',
    extra JSONB DEFAULT '{}'                         -- dati specifici per fonte
);

-- Creo hypertable con chunk di 1 giorno
SELECT create_hypertable('market_prices', 'time', chunk_time_interval => INTERVAL '1 day');

-- Indici per le query piu comuni
CREATE INDEX idx_mp_symbol_time ON market_prices (symbol, time DESC);
CREATE INDEX idx_mp_area_symbol ON market_prices (area, symbol, time DESC);
CREATE INDEX idx_mp_source ON market_prices (source, time DESC);
CREATE INDEX idx_mp_market_id ON market_prices (market_id, time DESC) WHERE market_id IS NOT NULL;

-- Compressione: dopo 7 giorni, comprimi.
-- I dati recenti restano non compressi per query veloci.
-- I dati storici vengono compressi ~90% risparmio spazio.
ALTER TABLE market_prices SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'area, symbol, price_type',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('market_prices', INTERVAL '7 days');

-- Retention: mantieni TUTTO (sezione 12.3: storicizzazione permanente).
-- Se serve liberare spazio in futuro, spostare su cold storage, mai cancellare.
-- Per sicurezza, nessuna retention policy automatica.

-- ============================================================================
-- 3. STRATEGY PERFORMANCE (equity curve)
-- ============================================================================
-- Equity curve per ogni strategia nel tempo (sezione 11.1).
-- Un record per strategia per giorno (o per trade se si vuole granularita).
--
-- Chunk interval: 7 giorni.
-- Motivo: volume molto piu basso dei prezzi, 1 record/strategia/giorno.

CREATE TABLE strategy_performance (
    time TIMESTAMPTZ NOT NULL,

    -- Riferimenti (UUID come text per evitare dipendenza cross-DB)
    user_id TEXT NOT NULL,
    strategy_id TEXT NOT NULL,
    strategy_code TEXT NOT NULL,                      -- es. 'PM-003 v2'
    area ts_area_type NOT NULL,

    -- Equity
    equity DECIMAL(14,2) NOT NULL,                   -- valore attuale del portafoglio strategia
    cash DECIMAL(14,2),                              -- liquidita disponibile
    invested DECIMAL(14,2),                           -- capitale attualmente investito

    -- Performance cumulativa
    total_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,      -- P&L cumulativo netto
    total_trades INT NOT NULL DEFAULT 0,
    winning_trades INT NOT NULL DEFAULT 0,
    losing_trades INT NOT NULL DEFAULT 0,

    -- Metriche rolling (sezione 11.1)
    win_rate DECIMAL(5,2),
    roi DECIMAL(10,2),
    profit_factor DECIMAL(10,4),
    max_drawdown DECIMAL(5,2),
    current_drawdown DECIMAL(5,2),
    sharpe_ratio DECIMAL(10,4),
    avg_edge DECIMAL(5,2),                           -- edge medio (sezione 11.1)
    avg_holding_time INTERVAL,                       -- tempo medio in posizione

    -- Slippage tracking (sezione 11.1)
    avg_slippage_simulated DECIMAL(5,4),
    avg_slippage_real DECIMAL(5,4),

    -- Confronto benchmark (sezione 11.2)
    benchmark_return DECIMAL(10,2),                  -- rendimento benchmark nello stesso periodo
    alpha DECIMAL(10,2)                              -- rendimento vs benchmark
);

SELECT create_hypertable('strategy_performance', 'time', chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_sp_strategy ON strategy_performance (strategy_id, time DESC);
CREATE INDEX idx_sp_user_area ON strategy_performance (user_id, area, time DESC);
CREATE INDEX idx_sp_user ON strategy_performance (user_id, time DESC);

ALTER TABLE strategy_performance SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'user_id, strategy_id',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('strategy_performance', INTERVAL '30 days');

-- ============================================================================
-- 4. AREA PERFORMANCE (aggregato per area)
-- ============================================================================
-- Performance aggregata per area nel tempo (sezione 2: meta-dashboard).
--
-- Chunk interval: 7 giorni.

CREATE TABLE area_performance (
    time TIMESTAMPTZ NOT NULL,

    user_id TEXT NOT NULL,
    area ts_area_type NOT NULL,

    -- Equity aggregata area
    total_equity DECIMAL(14,2) NOT NULL,
    total_bankroll DECIMAL(14,2) NOT NULL,
    total_invested DECIMAL(14,2),

    -- Performance
    daily_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    cumulative_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    roi DECIMAL(10,2),
    max_drawdown DECIMAL(5,2),
    current_drawdown DECIMAL(5,2),

    -- Conteggi
    active_strategies INT NOT NULL DEFAULT 0,
    total_trades_today INT NOT NULL DEFAULT 0,
    winning_trades_today INT NOT NULL DEFAULT 0,

    -- Benchmark (sezione 6.5)
    benchmark_value DECIMAL(20,8),
    benchmark_return DECIMAL(10,2),
    alpha DECIMAL(10,2)
);

SELECT create_hypertable('area_performance', 'time', chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_ap_user_area ON area_performance (user_id, area, time DESC);
CREATE INDEX idx_ap_user ON area_performance (user_id, time DESC);

ALTER TABLE area_performance SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'user_id, area',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('area_performance', INTERVAL '30 days');

-- ============================================================================
-- 5. MARKET VOLUMES
-- ============================================================================
-- Volumi di mercato nel tempo, per rilevare anomalie e calcolare liquidita.
--
-- Chunk interval: 1 giorno.

CREATE TABLE market_volumes (
    time TIMESTAMPTZ NOT NULL,

    area ts_area_type NOT NULL,
    source ts_data_source NOT NULL,
    symbol TEXT NOT NULL,
    market_id TEXT,

    -- Volumi
    volume DECIMAL(20,4) NOT NULL,                   -- volume nel periodo
    volume_currency DECIMAL(20,2),                   -- volume in valuta (EUR)
    trade_count INT,                                 -- numero di trade nel periodo
    open_interest DECIMAL(20,4),                     -- per futures/perpetual

    -- Liquidita
    avg_spread DECIMAL(20,8),
    avg_depth DECIMAL(20,4),                         -- profondita media order book

    interval TEXT NOT NULL DEFAULT '1h',             -- granularita: '1m', '5m', '1h', '1d'
    currency CHAR(3) DEFAULT 'EUR'
);

SELECT create_hypertable('market_volumes', 'time', chunk_time_interval => INTERVAL '1 day');

CREATE INDEX idx_mv_symbol ON market_volumes (symbol, time DESC);
CREATE INDEX idx_mv_area ON market_volumes (area, time DESC);

ALTER TABLE market_volumes SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'area, symbol',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('market_volumes', INTERVAL '7 days');

-- ============================================================================
-- 6. GLOBAL PERFORMANCE (meta-dashboard)
-- ============================================================================
-- Aggregato cross-area per il meta-dashboard (sezione 2: livello superiore).
-- "Dove rende di piu il capitale?"

CREATE TABLE global_performance (
    time TIMESTAMPTZ NOT NULL,

    user_id TEXT NOT NULL,

    -- Totali
    total_equity DECIMAL(14,2) NOT NULL,
    total_bankroll DECIMAL(14,2) NOT NULL,
    daily_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    cumulative_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    roi DECIMAL(10,2),
    max_drawdown DECIMAL(5,2),
    current_drawdown DECIMAL(5,2),                   -- se > 30% = FULL STOP (sezione 6.1 regola 3)

    -- Per-area breakdown (denormalizzato per query veloci)
    pnl_polymarket DECIMAL(14,2) DEFAULT 0,
    pnl_betfair DECIMAL(14,2) DEFAULT 0,
    pnl_stocks DECIMAL(14,2) DEFAULT 0,
    pnl_forex DECIMAL(14,2) DEFAULT 0,
    pnl_crypto DECIMAL(14,2) DEFAULT 0,

    -- Correlazioni cross-area (sezione 10)
    cross_area_correlations JSONB DEFAULT '{}'        -- matrice correlazione calcolata
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
-- 7. CONTINUOUS AGGREGATES
-- ============================================================================
-- Materialized views per query comuni. TimescaleDB le aggiorna in background.

-- 7.1 Prezzi aggregati a 1 ora (da tick/1min a 1h)
-- Per dashboard e analisi che non richiedono granularita al minuto.
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
    LAST(price, time) AS last_price,
    AVG(price) AS avg_price,
    LAST(best_back, time) AS last_best_back,
    LAST(best_lay, time) AS last_best_lay,
    AVG(spread) AS avg_spread,
    COUNT(*) AS tick_count
FROM market_prices
GROUP BY bucket, area, symbol, price_type
WITH NO DATA;

-- Refresh ogni 30 minuti, dati degli ultimi 2 giorni
SELECT add_continuous_aggregate_policy('market_prices_1h',
    start_offset => INTERVAL '2 days',
    end_offset => INTERVAL '30 minutes',
    schedule_interval => INTERVAL '30 minutes'
);

-- 7.2 Prezzi aggregati a 1 giorno (per grafici storici e backtest)
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
    LAST(price, time) AS last_price,
    AVG(price) AS avg_price,
    LAST(best_back, time) AS last_best_back,
    LAST(best_lay, time) AS last_best_lay,
    AVG(spread) AS avg_spread,
    COUNT(*) AS tick_count
FROM market_prices
GROUP BY bucket, area, symbol, price_type
WITH NO DATA;

-- Refresh ogni 1 ora
SELECT add_continuous_aggregate_policy('market_prices_1d',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- 7.3 Volumi aggregati a 1 giorno
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
    LAST(open_interest, time) AS last_open_interest
FROM market_volumes
GROUP BY bucket, area, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('market_volumes_1d',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- 7.4 Performance strategia settimanale (per confronti e classifiche)
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

-- 7.5 Area performance settimanale (per meta-dashboard)
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
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Ultimo prezzo per un simbolo
CREATE OR REPLACE FUNCTION get_latest_price(p_symbol TEXT, p_area ts_area_type)
RETURNS TABLE(
    time TIMESTAMPTZ,
    price DECIMAL(20,8),
    best_back DECIMAL(20,8),
    best_lay DECIMAL(20,8)
) AS $$
    SELECT mp.time, mp.price, mp.best_back, mp.best_lay
    FROM market_prices mp
    WHERE mp.symbol = p_symbol AND mp.area = p_area
    ORDER BY mp.time DESC
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- OHLCV per un simbolo in un range temporale
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

-- Equity curve per una strategia
CREATE OR REPLACE FUNCTION get_equity_curve(
    p_strategy_id TEXT,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ
) RETURNS TABLE(
    time TIMESTAMPTZ,
    equity DECIMAL(14,2),
    total_pnl DECIMAL(14,2),
    drawdown DECIMAL(5,2)
) AS $$
    SELECT sp.time, sp.equity, sp.total_pnl, sp.current_drawdown
    FROM strategy_performance sp
    WHERE sp.strategy_id = p_strategy_id
      AND sp.time >= p_start
      AND sp.time <= p_end
    ORDER BY sp.time;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- 9. SUMMARY
-- ============================================================================
--
-- HYPERTABLE                  | CHUNK INTERVAL | COMPRESS AFTER | RETENTION
-- ----------------------------|----------------|----------------|----------
-- market_prices               | 1 day          | 7 days         | Forever (sezione 12.3)
-- strategy_performance        | 7 days         | 30 days        | Forever
-- area_performance            | 7 days         | 30 days        | Forever
-- market_volumes              | 1 day          | 7 days         | Forever
-- global_performance          | 7 days         | 30 days        | Forever
--
-- CONTINUOUS AGGREGATE        | REFRESH INTERVAL | START OFFSET
-- ----------------------------|------------------|-------------
-- market_prices_1h            | 30 min           | 2 days
-- market_prices_1d            | 1 hour           | 3 days
-- market_volumes_1d           | 1 hour           | 3 days
-- strategy_performance_1w     | 1 day            | 14 days
-- area_performance_1w         | 1 day            | 14 days
--
-- Design rationale:
-- - Chunk interval di 1 giorno per market_prices: i dati tick-level Betfair
--   e i candle 1-min crypto/forex producono milioni di righe/giorno.
--   Chunk giornalieri sono ottimali per query "ultimi N giorni".
-- - Chunk interval di 7 giorni per performance: volume molto piu basso
--   (1 riga/strategia/giorno), chunk settimanali riducono overhead.
-- - Compressione aggressiva (7 giorni per prezzi): i dati compressi
--   occupano ~90% meno spazio e le query su dati compressi sono comunque veloci.
-- - Nessuna retention policy: il FILE_SACRO impone storicizzazione permanente.
-- - Continuous aggregates pre-calcolano le query piu comuni (dashboard, grafici)
--   riducendo il carico sulle hypertable grezze.
