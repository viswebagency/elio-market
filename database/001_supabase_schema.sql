-- ============================================================================
-- ELIO.MARKET — SUPABASE (PostgreSQL) SCHEMA
-- ============================================================================
-- Schema completo con Row Level Security per tutti i dati relazionali.
-- Ogni utente accede SOLO ai propri dati (tranne Knowledge Base condivisa).
-- Lingua: inglese (come da FILE_SACRO sezione 1).
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

-- Le 5 macro aree + meta (sezione 2 FILE_SACRO)
CREATE TYPE area_type AS ENUM (
    'polymarket',
    'betfair',
    'stocks',
    'forex',
    'crypto'
);

-- Modalita creazione strategia (sezione 3.1)
CREATE TYPE creation_mode AS ENUM (
    'autopilot',
    'copilot',
    'manual'
);

-- Stato strategia nel ciclo di vita (sezione 5.1)
CREATE TYPE strategy_status AS ENUM (
    'observation',
    'paper_trading',
    'live'
);

-- Grado di automazione (sezione 5.3)
CREATE TYPE automation_level AS ENUM (
    'pilot',
    'copilot',
    'autopilot'
);

-- Livello di rischio (sezione 6.7)
CREATE TYPE risk_level AS ENUM (
    'conservative',
    'moderate',
    'aggressive'
);

-- Metodo di sizing (sezione 6.2)
CREATE TYPE sizing_method AS ENUM (
    'kelly_criterion',
    'fixed_percentage',
    'fixed_amount'
);

-- Risoluzione conflitti (sezione 7)
CREATE TYPE conflict_resolution AS ENUM (
    'performance_priority',
    'neutralize',
    'netting'
);

-- Tier abbonamento (sezione 14.1)
CREATE TYPE subscription_tier AS ENUM (
    'free',
    'pro',
    'elite'
);

-- Livello esperienza (sezione 17 onboarding)
CREATE TYPE experience_level AS ENUM (
    'none',
    'basic',
    'intermediate',
    'advanced'
);

-- Livello backtest (sezione 4)
CREATE TYPE backtest_level AS ENUM (
    'quick_scan',
    'robustness',
    'stress_test',
    'overfitting_check'
);

-- Direzione trade
CREATE TYPE trade_direction AS ENUM (
    'long',
    'short'
);

-- Stato trade
CREATE TYPE trade_status AS ENUM (
    'open',
    'closed',
    'cancelled'
);

-- Tipo esecuzione
CREATE TYPE execution_type AS ENUM (
    'paper',
    'live'
);

-- Canale notifiche (sezione 9)
CREATE TYPE notification_channel AS ENUM (
    'telegram',
    'push',
    'email'
);

-- Livello analisi KB (sezione 8.3)
CREATE TYPE kb_level AS ENUM (
    'l1_profile',
    'l2_event',
    'l3_personal'
);

-- Tipo di azione audit
CREATE TYPE audit_action AS ENUM (
    'strategy_created',
    'strategy_updated',
    'strategy_promoted',
    'strategy_paused',
    'trade_opened',
    'trade_closed',
    'trade_cancelled',
    'bankroll_updated',
    'alert_triggered',
    'circuit_breaker_activated',
    'kill_switch_activated',
    'settings_changed',
    'api_key_added',
    'api_key_removed',
    'login',
    'logout'
);

-- Condizione di mercato (sezione 11.4)
CREATE TYPE market_condition AS ENUM (
    'trending',
    'ranging',
    'volatile',
    'calm'
);

-- Timeframe (sezione 11.4)
CREATE TYPE trade_timeframe AS ENUM (
    'scalping',
    'intraday',
    'swing',
    'position',
    'long_term'
);

-- ============================================================================
-- 2. USERS & PROFILES
-- ============================================================================

-- Estende auth.users di Supabase con dati profilo e preferenze.
-- Il questionario obbligatorio (sezione 15.3) e integrato qui.
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Dati profilo
    display_name TEXT,
    avatar_url TEXT,
    country_code CHAR(2) NOT NULL DEFAULT 'IT',  -- ISO 3166-1 alpha-2
    timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
    locale TEXT NOT NULL DEFAULT 'it',

    -- Abbonamento
    subscription_tier subscription_tier NOT NULL DEFAULT 'free',
    subscription_expires_at TIMESTAMPTZ,

    -- Questionario obbligatorio (sezione 15.3)
    questionnaire_completed BOOLEAN NOT NULL DEFAULT FALSE,
    date_of_birth DATE,                            -- verifica 18+
    financial_experience experience_level,
    betting_experience experience_level,
    risk_understanding BOOLEAN DEFAULT FALSE,       -- "il capitale puo essere perso"
    funds_source TEXT,                              -- reddito / risparmi / altro
    max_affordable_loss TEXT,                       -- <100 / 100-1000 / 1000-10000 / >10000

    -- Preferenze operative
    default_creation_mode creation_mode NOT NULL DEFAULT 'copilot',
    default_automation_level automation_level NOT NULL DEFAULT 'copilot',
    conflict_resolution conflict_resolution NOT NULL DEFAULT 'neutralize',
    active_areas area_type[] NOT NULL DEFAULT '{}',  -- aree attivate dall'utente

    -- Limiti di rischio globali (sezione 6.1)
    max_drawdown_global DECIMAL(5,2) NOT NULL DEFAULT 30.00,  -- %

    -- DND (sezione 12.5)
    dnd_start TIME,   -- es. 23:00
    dnd_end TIME,     -- es. 07:00

    -- GDPR (sezione 16.2)
    anonymous_data_optin BOOLEAN NOT NULL DEFAULT FALSE,

    -- Telegram
    telegram_chat_id BIGINT,
    telegram_verified BOOLEAN NOT NULL DEFAULT FALSE,

    -- 2FA (sezione 13 livello 2)
    two_fa_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_country ON profiles(country_code);
CREATE INDEX idx_profiles_tier ON profiles(subscription_tier);

-- ============================================================================
-- 3. BROKER API KEYS
-- ============================================================================
-- API key criptate AES-256 (sezione 13 livello 2).
-- Le chiavi vengono criptate a livello applicativo prima dell'inserimento.
CREATE TABLE broker_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    area area_type NOT NULL,
    broker_name TEXT NOT NULL,                      -- es. 'betfair', 'binance', 'degiro'
    encrypted_key TEXT NOT NULL,                    -- AES-256 encrypted
    encrypted_secret TEXT,                          -- AES-256 encrypted (non tutti i broker lo hanno)
    extra_config JSONB DEFAULT '{}',                -- certificati SSL Betfair, ecc.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, area, broker_name)
);

CREATE INDEX idx_broker_keys_user ON broker_api_keys(user_id);

-- ============================================================================
-- 4. STRATEGIES
-- ============================================================================

-- Tabella principale strategie. Ogni modifica crea una nuova versione (sezione 3.3).
CREATE TABLE strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Identificazione
    code TEXT NOT NULL,                             -- es. 'PM-003', 'BF-012', 'STK-001'
    version INT NOT NULL DEFAULT 1,                 -- sezione 3.3: versioning
    name TEXT NOT NULL,
    description TEXT,
    area area_type NOT NULL,

    -- Creazione e automazione
    creation_mode creation_mode NOT NULL DEFAULT 'copilot',
    automation_level automation_level NOT NULL DEFAULT 'copilot',

    -- Stato ciclo di vita (sezione 5.2)
    status strategy_status NOT NULL DEFAULT 'observation',
    promoted_to_paper_at TIMESTAMPTZ,
    promoted_to_live_at TIMESTAMPTZ,

    -- Rischio (sezione 6.7)
    risk_level risk_level NOT NULL DEFAULT 'moderate',
    min_ev DECIMAL(5,2),                            -- EV minimo per entrare
    min_probability DECIMAL(5,2),                   -- probabilita minima

    -- Sizing (sezione 6.2)
    sizing_method sizing_method NOT NULL DEFAULT 'fixed_percentage',
    sizing_value DECIMAL(10,4),                     -- % o importo fisso

    -- Regole nel mini-linguaggio (sezione 3.2)
    -- Formato strutturato JSON per il motore di esecuzione
    rules JSONB NOT NULL DEFAULT '{}',
    -- Versione leggibile del mini-linguaggio
    rules_readable TEXT,

    -- Limiti di rischio per strategia (sezione 6.1)
    max_drawdown DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    max_allocation_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00,  -- max % bankroll area

    -- Circuit breaker (sezione 6.3)
    circuit_breaker_loss_pct DECIMAL(5,2) DEFAULT 15.00,
    circuit_breaker_days INT DEFAULT 5,
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    paused_at TIMESTAMPTZ,
    pause_reason TEXT,

    -- Backtest (sezione 4)
    highest_backtest_level backtest_level,
    backtest_results JSONB DEFAULT '{}',            -- risultati sintetici per livello

    -- Metadata
    tags TEXT[] DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Una sola versione attiva per codice per utente
    UNIQUE(user_id, code, version)
);

CREATE INDEX idx_strategies_user ON strategies(user_id);
CREATE INDEX idx_strategies_area ON strategies(area);
CREATE INDEX idx_strategies_status ON strategies(status);
CREATE INDEX idx_strategies_user_area ON strategies(user_id, area);
CREATE INDEX idx_strategies_code ON strategies(user_id, code);
CREATE INDEX idx_strategies_active ON strategies(user_id, is_active, is_archived);

-- ============================================================================
-- 5. STRATEGY PARAMETERS
-- ============================================================================
-- Parametri configurabili per ogni strategia, separati per poter fare
-- overfitting check variando +/- 10% (sezione 4 livello 4).
CREATE TABLE strategy_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    param_name TEXT NOT NULL,
    param_value DECIMAL(20,8) NOT NULL,
    param_min DECIMAL(20,8),                        -- range per overfitting check
    param_max DECIMAL(20,8),
    description TEXT,

    UNIQUE(strategy_id, param_name)
);

CREATE INDEX idx_strategy_params_strategy ON strategy_parameters(strategy_id);

-- ============================================================================
-- 6. BANKROLLS / PORTFOLIOS
-- ============================================================================
-- Bankroll per area per utente (sezione 2: ogni area ha il suo bankroll).
CREATE TABLE bankrolls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    area area_type NOT NULL,

    -- Capitale
    initial_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
    current_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
    paper_balance DECIMAL(14,2) NOT NULL DEFAULT 1000.00,  -- default 1000 EUR (sezione 6.8)

    -- Limiti (sezione 6.1)
    max_drawdown_pct DECIMAL(5,2) NOT NULL DEFAULT 25.00,  -- max drawdown area

    -- Allocazione dinamica (sezione 6.4)
    is_dynamic_allocation BOOLEAN NOT NULL DEFAULT FALSE,

    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, area)
);

CREATE INDEX idx_bankrolls_user ON bankrolls(user_id);

-- Allocazione specifica per strategia dentro un bankroll
CREATE TABLE bankroll_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bankroll_id UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    allocated_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    allocated_pct DECIMAL(5,2),                     -- % del bankroll area
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(bankroll_id, strategy_id)
);

CREATE INDEX idx_allocations_bankroll ON bankroll_allocations(bankroll_id);
CREATE INDEX idx_allocations_strategy ON bankroll_allocations(strategy_id);

-- ============================================================================
-- 7. TRADES / OPERATIONS
-- ============================================================================
-- Ogni operazione (paper o live) tracciata completamente (sezione 11).
-- Commissioni SEMPRE incluse (sezione 4 regole sacre, sezione 19).
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE SET NULL,
    bankroll_id UUID REFERENCES bankrolls(id) ON DELETE SET NULL,

    -- Tipo
    execution_type execution_type NOT NULL,          -- paper o live
    area area_type NOT NULL,

    -- Asset
    asset_symbol TEXT NOT NULL,                      -- es. 'TRUMP_WIN', 'MAN_UTD-LIVERPOOL', 'AAPL', 'EURUSD', 'BTCUSDT'
    asset_name TEXT,
    market_type TEXT,                                -- es. 'match_odds', 'over_under', 'spot', 'futures'

    -- Direzione e stato
    direction trade_direction NOT NULL,
    status trade_status NOT NULL DEFAULT 'open',

    -- Prezzi (sezione 11.1)
    entry_price DECIMAL(20,8) NOT NULL,
    exit_price DECIMAL(20,8),
    quantity DECIMAL(20,8) NOT NULL,
    stake DECIMAL(14,2) NOT NULL,                    -- importo investito

    -- Timing
    entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exited_at TIMESTAMPTZ,

    -- Trigger (sezione 11.3)
    trigger_rule TEXT,                               -- quale regola del mini-linguaggio ha triggerato
    signal_confidence DECIMAL(5,2),                  -- confidence del segnale
    edge_at_entry DECIMAL(5,2),                      -- edge al momento dell'ingresso

    -- P&L (sezione 4 regole sacre: sempre netto)
    gross_pnl DECIMAL(14,2),
    commission DECIMAL(14,2) DEFAULT 0,              -- commissioni reali (sezione 19)
    slippage DECIMAL(14,2) DEFAULT 0,                -- slippage reale
    net_pnl DECIMAL(14,2),                           -- gross - commission - slippage

    -- Snapshot mercato al momento dell'ingresso (sezione 11.3)
    market_snapshot JSONB DEFAULT '{}',              -- volatilita, volume, trend

    -- Tags (sezione 11.4)
    market_category TEXT,                            -- politica, sport, crypto, tech...
    market_condition market_condition,
    timeframe trade_timeframe,
    tags TEXT[] DEFAULT '{}',

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trades_user ON trades(user_id);
CREATE INDEX idx_trades_strategy ON trades(strategy_id);
CREATE INDEX idx_trades_area ON trades(area);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_user_area ON trades(user_id, area);
CREATE INDEX idx_trades_entered_at ON trades(entered_at DESC);
CREATE INDEX idx_trades_user_entered ON trades(user_id, entered_at DESC);
CREATE INDEX idx_trades_execution_type ON trades(execution_type);
CREATE INDEX idx_trades_asset ON trades(asset_symbol);

-- ============================================================================
-- 8. JOURNAL
-- ============================================================================
-- Diario operativo con analisi AI post-operazione (sezione 11.3).
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
    strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,

    -- Contenuto generato dall'AI
    ai_analysis TEXT,                                -- analisi post-operazione
    ai_model TEXT,                                   -- quale modello ha generato (sezione 8.2)
    what_went_well TEXT,
    what_went_wrong TEXT,
    lessons_learned TEXT,

    -- Snapshot (sezione 11.3)
    entry_snapshot JSONB DEFAULT '{}',               -- stato al momento dell'ingresso
    exit_snapshot JSONB DEFAULT '{}',                -- stato al momento dell'uscita

    -- Statistiche al momento
    strategy_stats_at_time JSONB DEFAULT '{}',       -- win rate, ROI, ecc. della strategia a quel momento

    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_journal_user ON journal_entries(user_id);
CREATE INDEX idx_journal_trade ON journal_entries(trade_id);
CREATE INDEX idx_journal_strategy ON journal_entries(strategy_id);
CREATE INDEX idx_journal_created ON journal_entries(created_at DESC);

-- ============================================================================
-- 9. ALERTS
-- ============================================================================
-- Trigger programmabili, NON basati su AI (sezione 9).
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE,

    -- Configurazione
    name TEXT NOT NULL,
    area area_type,
    asset_symbol TEXT,

    -- Condizione (regola codificata, costo zero)
    condition_type TEXT NOT NULL,                     -- es. 'price_move', 'indicator_threshold', 'consecutive_losses', 'circuit_breaker', 'anomaly'
    condition_config JSONB NOT NULL DEFAULT '{}',     -- parametri della condizione

    -- Canali
    channels notification_channel[] NOT NULL DEFAULT '{telegram}',
    is_priority BOOLEAN NOT NULL DEFAULT FALSE,       -- ignora DND (solo Elite)

    -- Stato
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    trigger_count INT NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_user ON alerts(user_id);
CREATE INDEX idx_alerts_active ON alerts(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_alerts_strategy ON alerts(strategy_id);

-- ============================================================================
-- 10. NOTIFICATIONS
-- ============================================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,

    -- Contenuto
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    channel notification_channel NOT NULL,
    priority BOOLEAN NOT NULL DEFAULT FALSE,

    -- Azione (es. conferma/rifiuto esecuzione - sezione 9.2)
    action_type TEXT,                                -- es. 'confirm_trade', 'kill_switch'
    action_payload JSONB,
    action_response TEXT,                            -- es. 'confirmed', 'rejected'
    action_responded_at TIMESTAMPTZ,

    -- Stato
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_sent ON notifications(sent_at DESC);

-- ============================================================================
-- 11. KNOWLEDGE BASE (condivisa)
-- ============================================================================
-- Architettura a 3 livelli (sezione 8.3).
-- L1 e L2 sono condivisi tra tutti gli utenti (RLS diverso).
-- L3 e personale.
CREATE TABLE knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Livello
    level kb_level NOT NULL,

    -- Contesto
    area area_type NOT NULL,
    entity_type TEXT NOT NULL,                        -- es. 'team', 'player', 'stock', 'market', 'event'
    entity_id TEXT NOT NULL,                          -- id univoco dell'entita (es. ticker, team slug)
    entity_name TEXT,

    -- Contenuto (generato dall'AI)
    content JSONB NOT NULL,                           -- analisi strutturata
    ai_model TEXT,                                    -- quale modello (sezione 8.2)
    prompt_hash TEXT,                                 -- per prompt caching

    -- Per L3: utente proprietario (NULL per L1/L2)
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

    -- Cache invalidation (sezione 8.3 regole)
    valid_until TIMESTAMPTZ,                          -- quando scade
    invalidation_rule TEXT,                            -- es. 'every_24h', 'price_move_5pct'
    last_invalidated_at TIMESTAMPTZ,

    -- Embedding per ricerca semantica (sezione 8.2)
    embedding_vector VECTOR(1536),                    -- OpenAI text-embedding-3-small

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- L1/L2 cercati per area+entita, L3 per utente+entita
CREATE INDEX idx_kb_level ON knowledge_base(level);
CREATE INDEX idx_kb_entity ON knowledge_base(area, entity_type, entity_id);
CREATE INDEX idx_kb_user ON knowledge_base(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_kb_valid ON knowledge_base(valid_until) WHERE valid_until IS NOT NULL;
-- Per ricerca semantica (richiede pgvector extension)
-- CREATE INDEX idx_kb_embedding ON knowledge_base USING ivfflat (embedding_vector vector_cosine_ops);

-- ============================================================================
-- 12. CONFLICT LOG
-- ============================================================================
-- Log dei conflitti tra strategie (sezione 7).
CREATE TABLE conflict_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Strategie in conflitto
    strategy_a_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    strategy_b_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    area area_type NOT NULL,
    asset_symbol TEXT NOT NULL,

    -- Dettagli
    signal_a JSONB NOT NULL,                         -- segnale strategia A (long/short, prezzo, ecc.)
    signal_b JSONB NOT NULL,                         -- segnale strategia B
    resolution conflict_resolution NOT NULL,
    resolution_detail TEXT,                           -- spiegazione

    -- Quale e stata eseguita
    executed_strategy_id UUID REFERENCES strategies(id),
    was_neutralized BOOLEAN NOT NULL DEFAULT FALSE,

    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conflicts_user ON conflict_log(user_id);
CREATE INDEX idx_conflicts_detected ON conflict_log(detected_at DESC);
CREATE INDEX idx_conflicts_asset ON conflict_log(asset_symbol);

-- ============================================================================
-- 13. AUDIT LOG (immutabile)
-- ============================================================================
-- Log immutabile di tutte le azioni (sezione 13 livello 3).
-- Nessun UPDATE o DELETE permesso via RLS.
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    action audit_action NOT NULL,
    entity_type TEXT,                                 -- es. 'strategy', 'trade', 'bankroll'
    entity_id UUID,
    area area_type,

    -- Dettagli
    details JSONB DEFAULT '{}',                       -- stato prima/dopo, parametri
    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nessun indice su updated_at perche non esiste: log immutabile
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

-- ============================================================================
-- 14. COPY TRADING
-- ============================================================================

-- Strategie pubblicate per il copy trading (sezione 14.5)
CREATE TABLE published_strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    publisher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Info pubblica
    title TEXT NOT NULL,
    description TEXT,
    area area_type NOT NULL,
    risk_level risk_level NOT NULL,

    -- Pricing (sezione 14.2 marketplace)
    is_free BOOLEAN NOT NULL DEFAULT TRUE,
    price_monthly DECIMAL(10,2),                     -- per strategie premium

    -- Performance pubblica (calcolata, non editabile)
    total_trades INT NOT NULL DEFAULT 0,
    win_rate DECIMAL(5,2),
    roi DECIMAL(10,2),
    max_drawdown DECIMAL(5,2),
    sharpe_ratio DECIMAL(10,4),
    track_record_days INT NOT NULL DEFAULT 0,

    -- Stato
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(strategy_id)
);

CREATE INDEX idx_published_area ON published_strategies(area);
CREATE INDEX idx_published_publisher ON published_strategies(publisher_id);
CREATE INDEX idx_published_active ON published_strategies(is_active) WHERE is_active = TRUE;

-- Follower / sottoscrizioni copy trading
CREATE TABLE copy_trading_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    published_strategy_id UUID NOT NULL REFERENCES published_strategies(id) ON DELETE CASCADE,

    -- Config copia
    allocation_pct DECIMAL(5,2),                     -- % del bankroll da allocare
    max_stake DECIMAL(14,2),                         -- limite per operazione
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unsubscribed_at TIMESTAMPTZ,

    UNIQUE(follower_id, published_strategy_id)
);

CREATE INDEX idx_copy_follower ON copy_trading_subscriptions(follower_id);
CREATE INDEX idx_copy_published ON copy_trading_subscriptions(published_strategy_id);

-- ============================================================================
-- 15. BACKTEST RUNS
-- ============================================================================
-- Storico dei run di backtest per ogni strategia (sezione 4).
CREATE TABLE backtest_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,

    level backtest_level NOT NULL,

    -- Config
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    initial_capital DECIMAL(14,2) NOT NULL,
    commission_model JSONB NOT NULL DEFAULT '{}',     -- commissioni usate (sezione 19)
    slippage_pct DECIMAL(5,4) NOT NULL DEFAULT 0.015, -- 1.5% default

    -- Risultati
    total_trades INT,
    winning_trades INT,
    losing_trades INT,
    gross_profit DECIMAL(14,2),
    total_commission DECIMAL(14,2),
    total_slippage DECIMAL(14,2),
    net_profit DECIMAL(14,2),
    win_rate DECIMAL(5,2),
    profit_factor DECIMAL(10,4),
    max_drawdown DECIMAL(5,2),
    sharpe_ratio DECIMAL(10,4),
    roi DECIMAL(10,2),

    -- Monte Carlo (livello 3)
    monte_carlo_results JSONB,

    -- Overfitting check (livello 4): parametri variati +/- 10%
    overfitting_results JSONB,

    passed BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_backtest_strategy ON backtest_runs(strategy_id);
CREATE INDEX idx_backtest_user ON backtest_runs(user_id);
CREATE INDEX idx_backtest_level ON backtest_runs(level);

-- ============================================================================
-- 16. COUNTRY REGULATIONS
-- ============================================================================
-- Configurazione normativa per paese (sezione 15.4).
CREATE TABLE country_regulations (
    country_code CHAR(2) PRIMARY KEY,                -- ISO 3166-1
    country_name TEXT NOT NULL,

    -- Aree permesse
    allowed_areas area_type[] NOT NULL DEFAULT '{polymarket,betfair,stocks,forex,crypto}',

    -- Tassazione (sezione 15.2)
    tax_rules JSONB DEFAULT '{}',                    -- aliquote per area

    -- Disclaimer localizzati
    disclaimers JSONB DEFAULT '{}',

    -- Limiti
    is_supported BOOLEAN NOT NULL DEFAULT FALSE,
    requires_legal_review BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 17. ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE published_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE copy_trading_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE country_regulations ENABLE ROW LEVEL SECURITY;

-- Helper: current user ID from Supabase JWT
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- PROFILES: utente vede/modifica solo il proprio profilo
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (id = auth.uid());

-- BROKER API KEYS: solo proprie
CREATE POLICY "broker_keys_select_own" ON broker_api_keys FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "broker_keys_insert_own" ON broker_api_keys FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "broker_keys_update_own" ON broker_api_keys FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "broker_keys_delete_own" ON broker_api_keys FOR DELETE USING (user_id = auth.uid());

-- STRATEGIES: solo proprie
CREATE POLICY "strategies_select_own" ON strategies FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "strategies_insert_own" ON strategies FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "strategies_update_own" ON strategies FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "strategies_delete_own" ON strategies FOR DELETE USING (user_id = auth.uid());

-- STRATEGY PARAMETERS: via strategy ownership
CREATE POLICY "params_select_own" ON strategy_parameters FOR SELECT
    USING (strategy_id IN (SELECT id FROM strategies WHERE user_id = auth.uid()));
CREATE POLICY "params_insert_own" ON strategy_parameters FOR INSERT
    WITH CHECK (strategy_id IN (SELECT id FROM strategies WHERE user_id = auth.uid()));
CREATE POLICY "params_update_own" ON strategy_parameters FOR UPDATE
    USING (strategy_id IN (SELECT id FROM strategies WHERE user_id = auth.uid()));
CREATE POLICY "params_delete_own" ON strategy_parameters FOR DELETE
    USING (strategy_id IN (SELECT id FROM strategies WHERE user_id = auth.uid()));

-- BANKROLLS: solo propri
CREATE POLICY "bankrolls_select_own" ON bankrolls FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "bankrolls_insert_own" ON bankrolls FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "bankrolls_update_own" ON bankrolls FOR UPDATE USING (user_id = auth.uid());

-- BANKROLL ALLOCATIONS: via bankroll ownership
CREATE POLICY "allocations_select_own" ON bankroll_allocations FOR SELECT
    USING (bankroll_id IN (SELECT id FROM bankrolls WHERE user_id = auth.uid()));
CREATE POLICY "allocations_insert_own" ON bankroll_allocations FOR INSERT
    WITH CHECK (bankroll_id IN (SELECT id FROM bankrolls WHERE user_id = auth.uid()));
CREATE POLICY "allocations_update_own" ON bankroll_allocations FOR UPDATE
    USING (bankroll_id IN (SELECT id FROM bankrolls WHERE user_id = auth.uid()));

-- TRADES: solo propri
CREATE POLICY "trades_select_own" ON trades FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "trades_insert_own" ON trades FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "trades_update_own" ON trades FOR UPDATE USING (user_id = auth.uid());

-- JOURNAL: solo propri
CREATE POLICY "journal_select_own" ON journal_entries FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "journal_insert_own" ON journal_entries FOR INSERT WITH CHECK (user_id = auth.uid());

-- ALERTS: solo propri
CREATE POLICY "alerts_select_own" ON alerts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "alerts_insert_own" ON alerts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "alerts_update_own" ON alerts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "alerts_delete_own" ON alerts FOR DELETE USING (user_id = auth.uid());

-- NOTIFICATIONS: solo proprie
CREATE POLICY "notif_select_own" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notif_update_own" ON notifications FOR UPDATE USING (user_id = auth.uid());

-- KNOWLEDGE BASE: L1/L2 visibili a tutti, L3 solo al proprietario
CREATE POLICY "kb_select_shared" ON knowledge_base FOR SELECT
    USING (level IN ('l1_profile', 'l2_event') OR user_id = auth.uid());
CREATE POLICY "kb_insert_own" ON knowledge_base FOR INSERT
    WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
-- Solo il service role puo inserire L1/L2 (batch notturno)

-- CONFLICT LOG: solo propri
CREATE POLICY "conflicts_select_own" ON conflict_log FOR SELECT USING (user_id = auth.uid());

-- AUDIT LOG: solo propri, NESSUN update/delete (immutabile)
CREATE POLICY "audit_select_own" ON audit_log FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "audit_insert_own" ON audit_log FOR INSERT WITH CHECK (user_id = auth.uid());
-- Nessuna policy UPDATE/DELETE: log immutabile

-- PUBLISHED STRATEGIES: tutti possono vedere le attive, solo il publisher modifica
CREATE POLICY "published_select_all" ON published_strategies FOR SELECT
    USING (is_active = TRUE OR publisher_id = auth.uid());
CREATE POLICY "published_insert_own" ON published_strategies FOR INSERT
    WITH CHECK (publisher_id = auth.uid());
CREATE POLICY "published_update_own" ON published_strategies FOR UPDATE
    USING (publisher_id = auth.uid());

-- COPY TRADING SUBSCRIPTIONS: follower vede le proprie
CREATE POLICY "copy_select_own" ON copy_trading_subscriptions FOR SELECT
    USING (follower_id = auth.uid());
CREATE POLICY "copy_insert_own" ON copy_trading_subscriptions FOR INSERT
    WITH CHECK (follower_id = auth.uid());
CREATE POLICY "copy_update_own" ON copy_trading_subscriptions FOR UPDATE
    USING (follower_id = auth.uid());

-- BACKTEST RUNS: solo propri
CREATE POLICY "backtest_select_own" ON backtest_runs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "backtest_insert_own" ON backtest_runs FOR INSERT WITH CHECK (user_id = auth.uid());

-- COUNTRY REGULATIONS: leggibili da tutti (dati pubblici)
CREATE POLICY "regulations_select_all" ON country_regulations FOR SELECT USING (TRUE);

-- ============================================================================
-- 18. FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_strategies_updated_at BEFORE UPDATE ON strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bankrolls_updated_at BEFORE UPDATE ON bankrolls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_allocations_updated_at BEFORE UPDATE ON bankroll_allocations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_trades_updated_at BEFORE UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_kb_updated_at BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_published_updated_at BEFORE UPDATE ON published_strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_broker_keys_updated_at BEFORE UPDATE ON broker_api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Calcolo automatico net_pnl su trades
CREATE OR REPLACE FUNCTION calculate_net_pnl()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.gross_pnl IS NOT NULL THEN
        NEW.net_pnl = NEW.gross_pnl - COALESCE(NEW.commission, 0) - COALESCE(NEW.slippage, 0);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trades_net_pnl BEFORE INSERT OR UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION calculate_net_pnl();

-- Prevent DELETE/UPDATE on audit_log (defense in depth oltre RLS)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is immutable: % operations are forbidden', TG_OP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- ============================================================================
-- 19. INITIAL DATA
-- ============================================================================

-- Italia: configurazione normativa iniziale (sezione 15.2)
INSERT INTO country_regulations (country_code, country_name, allowed_areas, tax_rules, is_supported, requires_legal_review)
VALUES (
    'IT', 'Italia',
    '{polymarket,betfair,stocks,forex,crypto}',
    '{
        "stocks": {"rate": 26, "type": "capital_gain"},
        "forex": {"rate": 26, "type": "capital_gain"},
        "crypto": {"rate": 33, "type": "capital_gain", "note": "L. 207/2024 dal 01/01/2026"},
        "polymarket": {"rate": 26, "type": "redditi_diversi", "note": "zona grigia crypto-based"},
        "betfair": {"rate": null, "type": "da_verificare", "note": "verificare status ADM"}
    }'::JSONB,
    TRUE,
    FALSE
);
