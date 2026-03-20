-- ============================================================================
-- ELIO.MARKET — COMBINED MIGRATION (all 5 files)
-- ============================================================================
-- Execute this entire file in Supabase SQL Editor (Dashboard > SQL Editor)
-- Generated: 2026-03-19
-- ============================================================================


-- ===== START: 001_supabase_enums.sql =====
-- ============================================================================
-- ELIO.MARKET — 001: ENUM TYPES (Supabase/PostgreSQL)
-- ============================================================================
-- All enum types used across the Supabase schema.
-- Code language: English (FILE_SACRO section 1).
-- Each enum references the relevant FILE_SACRO section.
-- ============================================================================

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- MARKET AREAS
-- ============================================================================

-- Le 5 macro aree della piattaforma (FILE_SACRO section 2)
CREATE TYPE market_area AS ENUM (
    'polymarket',    -- Prediction markets
    'betfair',       -- Trading sportivo (exchange)
    'stocks',        -- Azionario & derivati (DeGiro, Interactive Brokers)
    'forex',         -- Forex via MetaTrader 5
    'crypto'         -- Crypto spot/futures (Binance, Bybit)
);

-- ============================================================================
-- STRATEGY ENUMS
-- ============================================================================

-- Modalita di esecuzione strategia (FILE_SACRO section 5.1)
CREATE TYPE execution_mode AS ENUM (
    'observation',    -- La strategia gira, logga, non esegue nulla
    'paper_trading',  -- Esegue con capitale virtuale, tracking completo
    'live'            -- Esegue con capitale reale
);

-- Grado di automazione (FILE_SACRO section 5.3)
CREATE TYPE automation_level AS ENUM (
    'pilot',     -- Tutto manuale, la piattaforma mostra dati e analisi
    'copilot',   -- La piattaforma propone, l'utente approva via Telegram
    'autopilot'  -- La piattaforma esegue autonomamente entro i limiti
);

-- Livello di rischio basato su EV (FILE_SACRO section 6.7)
CREATE TYPE risk_level AS ENUM (
    'conservative',  -- EV > 5%, probabilita > 60%
    'moderate',      -- EV > 3%, probabilita > 45%
    'aggressive'     -- EV > 1%, qualsiasi probabilita
);

-- Modalita di creazione strategia (FILE_SACRO section 3.1)
CREATE TYPE creation_mode AS ENUM (
    'autopilot',  -- AI genera, backtesta, promuove autonomamente
    'copilot',    -- Utente + AI collaborano (DEFAULT)
    'manual'      -- Utente crea, AI come rete di sicurezza
);

-- Metodo di sizing del capitale (FILE_SACRO section 6.2)
CREATE TYPE sizing_method AS ENUM (
    'kelly_criterion',    -- Ottimale matematicamente
    'fixed_percentage',   -- % fissa del bankroll
    'fixed_amount'        -- Importo fisso per operazione
);

-- ============================================================================
-- TRADE ENUMS
-- ============================================================================

-- Direzione del trade
CREATE TYPE trade_direction AS ENUM (
    'long',   -- Buy / Back
    'short'   -- Sell / Lay
);

-- Stato del trade nel suo ciclo di vita
CREATE TYPE trade_status AS ENUM (
    'open',       -- Posizione aperta
    'closed',     -- Posizione chiusa (con P&L calcolato)
    'cancelled'   -- Ordine cancellato prima dell'esecuzione
);

-- Motivo di uscita dal trade
CREATE TYPE exit_reason AS ENUM (
    'take_profit',        -- Target raggiunto
    'stop_loss',          -- Stop loss triggerato
    'trailing_stop',      -- Trailing stop triggerato
    'rule_exit',          -- Condizione ESCI_SE del mini-linguaggio (section 3.2)
    'circuit_breaker',    -- Circuit breaker attivato (section 6.3)
    'kill_switch',        -- Kill switch manuale (section 13 livello 3)
    'drawdown_limit',     -- Max drawdown raggiunto (section 6.1)
    'manual',             -- Chiusura manuale dall'utente
    'expiration',         -- Scadenza mercato (es. Polymarket resolution)
    'margin_call'         -- Margin call (futures/forex)
);

-- ============================================================================
-- USER / ONBOARDING ENUMS
-- ============================================================================

-- Esperienza strumenti finanziari (FILE_SACRO section 15.3, domanda 3)
CREATE TYPE experience_financial AS ENUM (
    'none',          -- Nessuna
    'basic',         -- Base
    'intermediate',  -- Intermedia
    'advanced'       -- Avanzata
);

-- Esperienza scommesse sportive (FILE_SACRO section 15.3, domanda 4)
CREATE TYPE experience_betting AS ENUM (
    'none',        -- Nessuna
    'occasional',  -- Occasionale
    'regular'      -- Regolare
);

-- Quanto puoi permetterti di perdere (FILE_SACRO section 15.3, domanda 7)
-- Imposta il limite massimo di bankroll live
CREATE TYPE max_loss_tier AS ENUM (
    'under_100',        -- < 100 EUR
    'from_100_to_1000', -- 100-1.000 EUR
    'from_1000_to_10000', -- 1.000-10.000 EUR
    'over_10000'        -- > 10.000 EUR
);

-- Fonte dei fondi (FILE_SACRO section 15.3, domanda 6)
CREATE TYPE fund_source AS ENUM (
    'income',   -- Reddito
    'savings',  -- Risparmi
    'other'     -- Altro
);

-- Livello expertise per onboarding (FILE_SACRO section 17, step 4)
CREATE TYPE expertise_level AS ENUM (
    'beginner',      -- Principiante -> Autopilot, interfaccia semplificata
    'intermediate',  -- Intermedio -> Copilot (default)
    'expert'         -- Esperto -> Manual, interfaccia completa
);

-- Tier abbonamento (FILE_SACRO section 14.1)
CREATE TYPE user_tier AS ENUM (
    'free',   -- 1 area, 3 strategie, solo Pilota, no live
    'pro',    -- 29 EUR/mese: tutte le aree, 30 strategie, Copilota, live
    'elite'   -- 79 EUR/mese: illimitate, Autopilota, marketplace
);

-- ============================================================================
-- ALERT / NOTIFICATION ENUMS
-- ============================================================================

-- Tipo condizione alert (FILE_SACRO section 9)
-- Condizioni programmabili, NON basate su AI (costo zero)
CREATE TYPE alert_condition_type AS ENUM (
    'price_move',           -- Movimenti di prezzo significativi
    'indicator_threshold',  -- Soglie indicatori tecnici
    'consecutive_losses',   -- N operazioni consecutive in perdita
    'circuit_breaker',      -- Circuit breaker attivato
    'anomaly',              -- Anomalie di mercato
    'drawdown_warning',     -- Drawdown vicino al limite
    'strategy_promoted',    -- Strategia promossa di livello
    'custom'                -- Condizione personalizzata
);

-- ============================================================================
-- JOURNAL ENUMS
-- ============================================================================

-- Tipo di entry nel diario operativo (FILE_SACRO section 11.3)
CREATE TYPE journal_entry_type AS ENUM (
    'trade_analysis',     -- Analisi AI post-operazione
    'strategy_review',    -- Review periodica strategia
    'market_note',        -- Nota su condizioni di mercato
    'manual_note',        -- Nota manuale dell'utente
    'ai_suggestion'       -- Suggerimento proattivo dell'AI
);

-- ============================================================================
-- SUBSCRIPTION ENUMS
-- ============================================================================

-- Stato abbonamento
CREATE TYPE subscription_status AS ENUM (
    'active',       -- Abbonamento attivo
    'trial',        -- Periodo di prova
    'past_due',     -- Pagamento scaduto
    'cancelled',    -- Cancellato dall'utente
    'expired'       -- Scaduto
);

-- ============================================================================
-- KNOWLEDGE BASE ENUMS
-- ============================================================================

-- Livello KB (FILE_SACRO section 8.3)
CREATE TYPE kb_level AS ENUM (
    'l1_profile',   -- Profili statici, aggiornamento 1x/giorno, batch notturno
    'l2_event',     -- Analisi evento, on-demand con cache
    'l3_personal'   -- Analisi personalizzata, unica per utente, NON condivisa
);

-- ============================================================================
-- CONFLICT RESOLUTION ENUMS
-- ============================================================================

-- Opzioni risoluzione conflitti (FILE_SACRO section 7)
CREATE TYPE conflict_resolution_type AS ENUM (
    'performance_priority',  -- Esegue solo la strategia con track record migliore
    'neutralize',            -- Non esegue nessuna, notifica l'utente
    'netting'                -- Esegue solo il delta netto
);

-- ============================================================================
-- BACKTEST ENUMS
-- ============================================================================

-- I 4 livelli del sistema di backtest (FILE_SACRO section 4)
CREATE TYPE backtest_level AS ENUM (
    'quick_scan',        -- Livello 1: ultimi 3 mesi, secondi
    'robustness',        -- Livello 2: 1-2 anni, walk-forward test
    'stress_test',       -- Livello 3: 5+ anni, Monte Carlo simulation
    'overfitting_check'  -- Livello 4: variazione parametri +/- 10%
);

-- ============================================================================
-- NOTIFICATION ENUMS
-- ============================================================================

-- Canale di notifica (FILE_SACRO section 9)
CREATE TYPE notification_channel AS ENUM (
    'telegram',  -- Primario
    'push',      -- PWA push notifications
    'email'      -- Secondario
);

-- ============================================================================
-- AUDIT ENUMS
-- ============================================================================

-- Tipo di azione registrata nell'audit log immutabile (FILE_SACRO section 13 livello 3)
CREATE TYPE audit_action AS ENUM (
    'strategy_created',
    'strategy_updated',
    'strategy_promoted',
    'strategy_paused',
    'strategy_archived',
    'trade_opened',
    'trade_closed',
    'trade_cancelled',
    'bankroll_updated',
    'bankroll_deposit',
    'bankroll_withdrawal',
    'alert_triggered',
    'circuit_breaker_activated',
    'kill_switch_activated',
    'drawdown_limit_hit',
    'settings_changed',
    'api_key_added',
    'api_key_removed',
    'copy_trading_subscribed',
    'copy_trading_unsubscribed',
    'strategy_published',
    'strategy_unpublished',
    'login',
    'logout',
    'two_fa_enabled',
    'two_fa_disabled',
    'questionnaire_completed'
);

-- ============================================================================
-- MARKET CONDITION ENUMS
-- ============================================================================

-- Condizione di mercato (FILE_SACRO section 11.4)
CREATE TYPE market_condition AS ENUM (
    'trending',   -- Trend direzionale chiaro
    'ranging',    -- Movimento laterale
    'volatile',   -- Alta volatilita
    'calm'        -- Bassa volatilita
);

-- Timeframe operativo (FILE_SACRO section 11.4)
CREATE TYPE trade_timeframe AS ENUM (
    'scalping',    -- Ore (FILE_SACRO section 2: azionario)
    'intraday',    -- Intra-giornata
    'swing',       -- Giorni/settimane
    'position',    -- Mesi
    'long_term'    -- Anni/vita (investimento)
);

-- Tipo esecuzione (paper vs live)
CREATE TYPE execution_type AS ENUM (
    'paper',  -- Capitale virtuale
    'live'    -- Capitale reale
);

-- ===== END: 001_supabase_enums.sql =====

-- ===== START: 002_supabase_tables.sql =====
-- ============================================================================
-- ELIO.MARKET — 002: TABLE DEFINITIONS (Supabase/PostgreSQL)
-- ============================================================================
-- All tables with complete column definitions.
-- Depends on: 001_supabase_enums.sql
-- Code language: English (FILE_SACRO section 1).
-- ============================================================================

-- ============================================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================================
-- Estende auth.users di Supabase con dati profilo, preferenze e questionario
-- obbligatorio (FILE_SACRO section 15.3, section 17).
-- Il questionario DEVE essere completato prima di accedere a qualsiasi funzionalita.

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Dati profilo
    display_name TEXT,
    avatar_url TEXT,
    country_code CHAR(2) NOT NULL DEFAULT 'IT',  -- ISO 3166-1 alpha-2 (section 15.4: solo Italia in Fase 1)
    timezone TEXT NOT NULL DEFAULT 'Europe/Rome',  -- section 12.5: time zone configurabile
    locale TEXT NOT NULL DEFAULT 'it',             -- section 1: interfaccia in italiano

    -- Abbonamento (FILE_SACRO section 14.1)
    subscription_tier user_tier NOT NULL DEFAULT 'free',
    subscription_status subscription_status NOT NULL DEFAULT 'active',
    subscription_expires_at TIMESTAMPTZ,
    subscription_started_at TIMESTAMPTZ,

    -- Questionario obbligatorio (FILE_SACRO section 15.3)
    -- Tempo onboarding target: 2 minuti (section 17)
    questionnaire_completed BOOLEAN NOT NULL DEFAULT FALSE,
    date_of_birth DATE,                               -- Domanda 1: verifica eta >= 18 anni
    financial_experience experience_financial,          -- Domanda 3
    betting_experience experience_betting,              -- Domanda 4
    risk_understanding BOOLEAN DEFAULT FALSE,           -- Domanda 5: "il capitale puo essere perso totalmente"
    funds_source fund_source,                           -- Domanda 6
    max_affordable_loss max_loss_tier,                  -- Domanda 7: imposta limite max bankroll live
    expertise_level expertise_level,                    -- section 17 step 4: determina modalita default

    -- Preferenze operative
    default_creation_mode creation_mode NOT NULL DEFAULT 'copilot',       -- section 3.1
    default_automation_level automation_level NOT NULL DEFAULT 'copilot', -- section 5.3
    conflict_resolution conflict_resolution_type NOT NULL DEFAULT 'neutralize', -- section 7
    active_areas market_area[] NOT NULL DEFAULT '{}',  -- section 17 step 3: aree selezionate

    -- Limiti di rischio globali (FILE_SACRO section 6.1)
    -- Regola 3: max drawdown globale -30% -> TUTTO in pausa
    max_drawdown_global DECIMAL(5,2) NOT NULL DEFAULT 30.00,
    is_global_pause BOOLEAN NOT NULL DEFAULT FALSE,    -- FULL STOP quando drawdown > max
    global_pause_at TIMESTAMPTZ,

    -- DND (FILE_SACRO section 12.5)
    dnd_start TIME,   -- es. 23:00
    dnd_end TIME,     -- es. 07:00

    -- GDPR (FILE_SACRO section 16.2)
    anonymous_data_optin BOOLEAN NOT NULL DEFAULT FALSE,  -- Opt-in esplicito alla registrazione
    data_export_requested_at TIMESTAMPTZ,
    deletion_requested_at TIMESTAMPTZ,

    -- Telegram (FILE_SACRO section 9.2)
    telegram_chat_id BIGINT,
    telegram_username TEXT,
    telegram_verified BOOLEAN NOT NULL DEFAULT FALSE,

    -- 2FA (FILE_SACRO section 13 livello 2)
    -- Obbligatorio per operazioni live
    two_fa_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    -- Max sessioni attive (section 13 livello 2: max 3)
    max_sessions INT NOT NULL DEFAULT 3,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'User profiles extending Supabase auth.users. Includes mandatory questionnaire (FILE_SACRO 15.3) and all user preferences.';
COMMENT ON COLUMN profiles.risk_understanding IS 'Domanda 5: if FALSE, live trading functions are BLOCKED (FILE_SACRO 15.3)';
COMMENT ON COLUMN profiles.max_affordable_loss IS 'Domanda 7: sets the maximum bankroll limit for live trading (FILE_SACRO 15.3)';

-- ============================================================================
-- 2. BROKER API KEYS (encrypted, RLS)
-- ============================================================================
-- API key criptate AES-256 at rest (FILE_SACRO section 13 livello 2).
-- Le chiavi vengono criptate a livello applicativo PRIMA dell'inserimento.
-- Distrutte alla cancellazione account (section 16.1).

CREATE TABLE broker_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    area market_area NOT NULL,
    broker_name TEXT NOT NULL,                      -- es. 'betfair', 'binance', 'degiro', 'interactive_brokers', 'ic_markets'
    encrypted_key TEXT NOT NULL,                    -- AES-256 encrypted
    encrypted_secret TEXT,                          -- AES-256 encrypted (non tutti i broker lo hanno)
    extra_config JSONB DEFAULT '{}',               -- Certificati SSL Betfair, IP whitelist, etc.
    label TEXT,                                     -- Etichetta utente (es. "Binance principale")
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_verified_at TIMESTAMPTZ,                  -- Ultimo test connessione riuscito
    last_error TEXT,                                -- Ultimo errore di connessione
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, area, broker_name)
);

COMMENT ON TABLE broker_api_keys IS 'Encrypted broker API keys. AES-256 at rest (FILE_SACRO 13.2). Destroyed on account deletion (FILE_SACRO 16.1).';

-- ============================================================================
-- 3. STRATEGIES (with DSL rules, version tracking, lifecycle)
-- ============================================================================
-- Tabella principale strategie.
-- Ogni modifica crea una NUOVA VERSIONE (FILE_SACRO section 3.3).
-- Il track record della versione precedente resta congelato e consultabile.
-- La nuova versione riparte dal ciclo completo: backtest -> paper -> live (section 5.2).

CREATE TABLE strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Identificazione e versioning (FILE_SACRO section 3.3)
    code TEXT NOT NULL,                             -- es. 'PM-003', 'BF-012', 'STK-001', 'FX-007', 'CR-015'
    version INT NOT NULL DEFAULT 1,                 -- v1, v2, v3... ogni modifica = nuova versione
    name TEXT NOT NULL,
    description TEXT,
    area market_area NOT NULL,

    -- Creazione e automazione (FILE_SACRO sections 3.1, 5.3)
    creation_mode creation_mode NOT NULL DEFAULT 'copilot',
    automation_level automation_level NOT NULL DEFAULT 'copilot',

    -- Stato ciclo di vita (FILE_SACRO section 5.2)
    -- Promozione graduale obbligatoria: observation -> paper (min 30gg positivi) -> live
    status execution_mode NOT NULL DEFAULT 'observation',
    promoted_to_paper_at TIMESTAMPTZ,
    paper_trading_days INT NOT NULL DEFAULT 0,      -- Counter giorni in paper trading
    paper_profitable_days INT NOT NULL DEFAULT 0,   -- Counter giorni profittevoli in paper
    promoted_to_live_at TIMESTAMPTZ,

    -- Rischio (FILE_SACRO section 6.7)
    risk_level risk_level NOT NULL DEFAULT 'moderate',
    min_ev DECIMAL(5,2),                            -- EV minimo per entrare (conservative: >5%, moderate: >3%, aggressive: >1%)
    min_probability DECIMAL(5,2),                   -- Probabilita minima (conservative: >60%, moderate: >45%)

    -- Sizing (FILE_SACRO section 6.2)
    sizing_method sizing_method NOT NULL DEFAULT 'fixed_percentage',
    sizing_value DECIMAL(10,4),                     -- % o importo fisso, dipende dal metodo

    -- Regole nel mini-linguaggio (FILE_SACRO section 3.2)
    -- QUANDO: [condizione] E: [condizione] ALLORA: [azione] STAKE: [sizing] ESCI_SE: [condizione]
    rules JSONB NOT NULL DEFAULT '{}',              -- Formato strutturato JSON per il motore di esecuzione
    rules_readable TEXT,                            -- Versione leggibile del DSL
    rules_version INT NOT NULL DEFAULT 1,           -- Versione del formato regole (per backward compat)

    -- Limiti di rischio per strategia (FILE_SACRO section 6.1)
    -- Regola 1: max drawdown -20% -> pausa automatica
    -- Regola 4: nessuna strategia riceve piu del 10% del bankroll
    max_drawdown DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    max_allocation_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00,

    -- Circuit breaker (FILE_SACRO section 6.3)
    -- Se perde X% in N giorni -> si ferma automaticamente
    circuit_breaker_loss_pct DECIMAL(5,2) DEFAULT 15.00,
    circuit_breaker_days INT DEFAULT 5,
    consecutive_losses INT NOT NULL DEFAULT 0,
    max_consecutive_losses INT DEFAULT 10,
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    paused_at TIMESTAMPTZ,
    pause_reason TEXT,

    -- Backtest status (FILE_SACRO section 4)
    -- NESSUNA strategia va live senza backtest + paper trading (principio 4)
    highest_backtest_level backtest_level,
    backtest_passed_levels backtest_level[] DEFAULT '{}',  -- Livelli superati
    backtest_summary JSONB DEFAULT '{}',                   -- Risultati sintetici per livello

    -- Performance corrente (cache per query veloci)
    current_win_rate DECIMAL(5,2),
    current_roi DECIMAL(10,2),
    current_profit_factor DECIMAL(10,4),
    current_max_drawdown DECIMAL(5,2),
    current_sharpe_ratio DECIMAL(10,4),
    total_trades INT NOT NULL DEFAULT 0,
    winning_trades INT NOT NULL DEFAULT 0,
    losing_trades INT NOT NULL DEFAULT 0,

    -- Tags (FILE_SACRO section 11.4)
    tags TEXT[] DEFAULT '{}',

    -- Metadata
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Una sola versione attiva per codice per utente
    UNIQUE(user_id, code, version)
);

COMMENT ON TABLE strategies IS 'Core strategy table. Each modification creates a NEW VERSION (FILE_SACRO 3.3). Mandatory lifecycle: backtest -> paper (30d) -> live (FILE_SACRO 5.2).';

-- ============================================================================
-- 4. STRATEGY PARAMETERS (for overfitting check)
-- ============================================================================
-- Parametri configurabili per ogni strategia, separati per poter fare
-- overfitting check variando +/- 10% (FILE_SACRO section 4, livello 4).
-- Se la strategia e fragile (performance crolla con +/-10%), viene scartata.

CREATE TABLE strategy_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    param_name TEXT NOT NULL,                       -- es. 'ma_period', 'threshold', 'lookback_days'
    param_value DECIMAL(20,8) NOT NULL,             -- Valore corrente
    param_min DECIMAL(20,8),                        -- Range per overfitting check (-10%)
    param_max DECIMAL(20,8),                        -- Range per overfitting check (+10%)
    param_type TEXT DEFAULT 'numeric',              -- 'numeric', 'integer', 'boolean'
    description TEXT,
    is_optimizable BOOLEAN NOT NULL DEFAULT TRUE,   -- Se includere nell'overfitting check

    UNIQUE(strategy_id, param_name)
);

COMMENT ON TABLE strategy_parameters IS 'Strategy parameters separated for overfitting check: varying +/- 10% must not collapse performance (FILE_SACRO 4, level 4).';

-- ============================================================================
-- 5. BANKROLLS (per area, drawdown tracking)
-- ============================================================================
-- Bankroll per area per utente (FILE_SACRO section 2: ogni area ha il suo bankroll).
-- Budget iniziale: 500 EUR Polymarket in M1, 200-500 EUR per ogni nuova area (section 6.8).

CREATE TABLE bankrolls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    area market_area NOT NULL,

    -- Capitale (FILE_SACRO section 6.8)
    initial_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
    current_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
    peak_balance DECIMAL(14,2) NOT NULL DEFAULT 0,          -- Per calcolo drawdown
    paper_balance DECIMAL(14,2) NOT NULL DEFAULT 1000.00,   -- Default 1000 EUR (section 6.8)
    paper_initial DECIMAL(14,2) NOT NULL DEFAULT 1000.00,

    -- Drawdown tracking (FILE_SACRO section 6.1)
    -- Regola 2: max drawdown per area -25%
    max_drawdown_pct DECIMAL(5,2) NOT NULL DEFAULT 25.00,
    current_drawdown_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    is_area_paused BOOLEAN NOT NULL DEFAULT FALSE,
    area_paused_at TIMESTAMPTZ,

    -- Allocazione dinamica (FILE_SACRO section 6.4)
    -- Piu capitale alle strategie che performano, meno a quelle in drawdown
    is_dynamic_allocation BOOLEAN NOT NULL DEFAULT FALSE,

    -- Tracking depositi/prelievi
    total_deposited DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_withdrawn DECIMAL(14,2) NOT NULL DEFAULT 0,

    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, area)
);

COMMENT ON TABLE bankrolls IS 'Per-area bankroll with drawdown tracking. Max -25% per area (FILE_SACRO 6.1 rule 2). Paper default 1000 EUR (section 6.8).';

-- ============================================================================
-- 6. BANKROLL ALLOCATIONS (per strategy)
-- ============================================================================
-- Allocazione specifica per strategia dentro un bankroll.
-- Regola 4 (FILE_SACRO section 6.1): nessuna strategia > 10% del bankroll all'inizio.

CREATE TABLE bankroll_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bankroll_id UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    allocated_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    allocated_pct DECIMAL(5,2),                     -- % del bankroll area (max 10% iniziale)
    current_value DECIMAL(14,2) NOT NULL DEFAULT 0, -- Valore corrente dell'allocazione
    high_water_mark DECIMAL(14,2) NOT NULL DEFAULT 0, -- Per drawdown per-allocation
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(bankroll_id, strategy_id)
);

COMMENT ON TABLE bankroll_allocations IS 'Per-strategy allocation within a bankroll. Max 10% at start, grows only if strategy performs (FILE_SACRO 6.1 rule 4).';

-- ============================================================================
-- 7. TRADES (complete P&L tracking, net after commissions)
-- ============================================================================
-- Ogni operazione (paper o live) tracciata completamente (FILE_SACRO section 11).
-- REGOLA SACRA: commissioni SEMPRE incluse (FILE_SACRO section 4, section 19).
-- Una strategia profittevole al lordo ma negativa al netto e PERDENTE.
-- Il sistema calcola e mostra SEMPRE il profitto netto dopo commissioni.

CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE SET NULL,
    bankroll_id UUID REFERENCES bankrolls(id) ON DELETE SET NULL,
    allocation_id UUID REFERENCES bankroll_allocations(id) ON DELETE SET NULL,

    -- Tipo
    execution_type execution_type NOT NULL,          -- paper o live
    area market_area NOT NULL,

    -- Asset
    asset_symbol TEXT NOT NULL,                      -- es. 'TRUMP_WIN', 'MAN_UTD-LIVERPOOL', 'AAPL', 'EURUSD', 'BTCUSDT'
    asset_name TEXT,
    market_type TEXT,                                -- es. 'match_odds', 'over_under', 'spot', 'futures', 'options'
    market_id TEXT,                                  -- ID nativo piattaforma (es. Betfair market ID)

    -- Direzione e stato
    direction trade_direction NOT NULL,
    status trade_status NOT NULL DEFAULT 'open',
    exit_reason exit_reason,                         -- Perche si e usciti

    -- Prezzi (FILE_SACRO section 11.1)
    entry_price DECIMAL(20,8) NOT NULL,
    exit_price DECIMAL(20,8),
    target_price DECIMAL(20,8),                      -- Take profit
    stop_price DECIMAL(20,8),                        -- Stop loss
    quantity DECIMAL(20,8) NOT NULL,
    stake DECIMAL(14,2) NOT NULL,                    -- Importo investito

    -- Timing
    entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exited_at TIMESTAMPTZ,
    holding_duration INTERVAL,                       -- Calcolato alla chiusura

    -- Trigger (FILE_SACRO section 11.3)
    trigger_rule TEXT,                               -- Quale regola del mini-linguaggio ha triggerato
    signal_confidence DECIMAL(5,2),                  -- Confidence del segnale
    edge_at_entry DECIMAL(5,2),                      -- Edge al momento dell'ingresso (section 6.6)
    our_probability DECIMAL(5,2),                    -- La nostra stima (Fonte 2)
    market_probability DECIMAL(5,2),                 -- Probabilita implicita mercato (Fonte 1)

    -- P&L (FILE_SACRO section 4 regole sacre: SEMPRE netto)
    gross_pnl DECIMAL(14,2),
    commission DECIMAL(14,2) DEFAULT 0,              -- Commissioni reali (FILE_SACRO section 19)
    slippage DECIMAL(14,2) DEFAULT 0,                -- Slippage reale (vs simulato 1-2%)
    slippage_simulated DECIMAL(14,2) DEFAULT 0,      -- Slippage previsto nel backtest
    net_pnl DECIMAL(14,2),                           -- gross - commission - slippage (calcolato da trigger)

    -- Snapshot mercato al momento dell'ingresso (FILE_SACRO section 11.3)
    market_snapshot JSONB DEFAULT '{}',              -- Volatilita, volume, trend

    -- Tags (FILE_SACRO section 11.4)
    market_category TEXT,                            -- Politica, sport, crypto, tech stock...
    market_condition market_condition,
    timeframe trade_timeframe,
    tags TEXT[] DEFAULT '{}',

    -- Broker info
    broker_order_id TEXT,                            -- ID ordine sul broker
    broker_name TEXT,                                -- Broker utilizzato

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE trades IS 'Complete trade tracking. Commissions ALWAYS included (FILE_SACRO 4 sacred rules, section 19). net_pnl = gross_pnl - commission - slippage.';

-- ============================================================================
-- 8. JOURNAL ENTRIES
-- ============================================================================
-- Diario operativo con analisi AI post-operazione (FILE_SACRO section 11.3).
-- Per ogni operazione: snapshot stato, motivo trigger, stato mercato, esito, analisi AI.

CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
    strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
    area market_area,

    -- Tipo entry
    entry_type journal_entry_type NOT NULL DEFAULT 'trade_analysis',

    -- Contenuto generato dall'AI (FILE_SACRO section 8.2)
    title TEXT,
    ai_analysis TEXT,
    ai_model TEXT,                                   -- Quale modello: 'opus', 'sonnet', 'haiku'
    what_went_well TEXT,
    what_went_wrong TEXT,
    lessons_learned TEXT,
    ai_recommendations TEXT,                         -- Suggerimenti dell'AI per il futuro

    -- Snapshot (FILE_SACRO section 11.3)
    entry_snapshot JSONB DEFAULT '{}',               -- Stato al momento dell'ingresso
    exit_snapshot JSONB DEFAULT '{}',                -- Stato al momento dell'uscita

    -- Statistiche al momento
    strategy_stats_at_time JSONB DEFAULT '{}',       -- Win rate, ROI, etc. della strategia a quel momento

    tags TEXT[] DEFAULT '{}',
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,        -- Utente puo pinnare entry importanti
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE journal_entries IS 'Operational journal with AI post-trade analysis (FILE_SACRO 11.3). Automatic snapshot of market state at entry/exit.';

-- ============================================================================
-- 9. ALERTS
-- ============================================================================
-- Trigger programmabili, NON basati su AI (FILE_SACRO section 9).
-- Regole codificate, costo zero.

CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE,

    -- Configurazione
    name TEXT NOT NULL,
    area market_area,
    asset_symbol TEXT,

    -- Condizione (regola codificata, costo zero)
    condition_type alert_condition_type NOT NULL,
    condition_config JSONB NOT NULL DEFAULT '{}',     -- Parametri: threshold, period, operator, etc.

    -- Canali (FILE_SACRO section 9)
    channels notification_channel[] NOT NULL DEFAULT '{telegram}',
    is_priority BOOLEAN NOT NULL DEFAULT FALSE,       -- Ignora DND (solo Elite, section 9.2)

    -- Cooldown (evita spam)
    cooldown_minutes INT NOT NULL DEFAULT 60,
    last_triggered_at TIMESTAMPTZ,
    trigger_count INT NOT NULL DEFAULT 0,

    -- Stato
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,                           -- Alert a scadenza (es. per evento specifico)

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE alerts IS 'Programmable triggers, NOT AI-based (FILE_SACRO 9). Zero cost coded rules.';

-- ============================================================================
-- 10. NOTIFICATIONS
-- ============================================================================
-- Notifiche inviate all'utente su tutti i canali.

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
    trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,

    -- Contenuto
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    channel notification_channel NOT NULL,
    priority BOOLEAN NOT NULL DEFAULT FALSE,

    -- Azione (es. conferma/rifiuto esecuzione - FILE_SACRO section 9.2)
    action_type TEXT,                                -- es. 'confirm_trade', 'kill_switch', 'approve_promotion'
    action_payload JSONB,
    action_response TEXT,                            -- es. 'confirmed', 'rejected', 'timeout'
    action_responded_at TIMESTAMPTZ,
    action_timeout_at TIMESTAMPTZ,                   -- Scadenza per risposta

    -- Stato
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    is_sent BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    delivery_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notifications IS 'Notifications across all channels: Telegram (primary), PWA push, email (secondary). FILE_SACRO section 9.';

-- ============================================================================
-- 11. KNOWLEDGE BASE (3 levels, L1/L2 shared, L3 personal)
-- ============================================================================
-- Architettura a 3 livelli (FILE_SACRO section 8.3).
-- L1 e L2 sono condivisi tra TUTTI gli utenti.
-- L3 e personale, calibrata sulla strategia e bankroll dell'utente.
-- Network effect: piu utenti = piu dati KB = analisi migliori per tutti.
-- Risparmio stimato: 95-99% sulle analisi grazie alla KB condivisa.

CREATE TABLE knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Livello (FILE_SACRO section 8.3)
    level kb_level NOT NULL,

    -- Contesto
    area market_area NOT NULL,
    entity_type TEXT NOT NULL,                        -- es. 'team', 'player', 'stock', 'market', 'event', 'crypto_token'
    entity_id TEXT NOT NULL,                          -- ID univoco dell'entita (es. ticker, team slug, market slug)
    entity_name TEXT,

    -- Contenuto (generato dall'AI)
    content JSONB NOT NULL,                           -- Analisi strutturata
    summary TEXT,                                     -- Sommario breve per preview
    ai_model TEXT,                                    -- Quale modello (section 8.2)
    prompt_hash TEXT,                                 -- Per prompt caching (section 8.4 punto 4)
    tokens_used INT,                                  -- Tracking costi AI

    -- Per L3: utente proprietario (NULL per L1/L2)
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

    -- Cache invalidation (FILE_SACRO section 8.3 regole)
    valid_until TIMESTAMPTZ,
    invalidation_rule TEXT,                            -- es. 'every_24h', 'after_match', 'price_move_5pct', 'price_move_3pct', 'every_6h'
    last_invalidated_at TIMESTAMPTZ,
    invalidation_count INT NOT NULL DEFAULT 0,

    -- Embedding per ricerca semantica (FILE_SACRO section 8.2: OpenAI text-embedding-3-small)
    embedding_vector VECTOR(1536),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE knowledge_base IS '3-level Knowledge Base (FILE_SACRO 8.3). L1: static profiles (daily batch). L2: event analysis (on-demand, cached). L3: personal (not shared). Network effect is the key competitive advantage.';

-- ============================================================================
-- 12. CONFLICT LOG
-- ============================================================================
-- Log dei conflitti tra strategie (FILE_SACRO section 7).
-- Obbligatorio prima di qualsiasi esecuzione.
-- Con 100+ strategie per area, due possono dare segnali opposti sullo stesso asset.

CREATE TABLE conflict_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Strategie in conflitto
    strategy_a_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    strategy_b_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    area market_area NOT NULL,
    asset_symbol TEXT NOT NULL,

    -- Dettagli
    signal_a JSONB NOT NULL,                         -- Segnale strategia A (direction, price, confidence, edge)
    signal_b JSONB NOT NULL,                         -- Segnale strategia B
    resolution conflict_resolution_type NOT NULL,
    resolution_detail TEXT,                           -- Spiegazione della risoluzione

    -- Quale e stata eseguita (se performance_priority o netting)
    executed_strategy_id UUID REFERENCES strategies(id),
    was_neutralized BOOLEAN NOT NULL DEFAULT FALSE,
    net_direction trade_direction,                    -- Se netting, quale direzione netta

    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE conflict_log IS 'Conflict detection between strategies on same asset (FILE_SACRO 7). Mandatory before any execution.';

-- ============================================================================
-- 13. AUDIT LOG (IMMUTABLE)
-- ============================================================================
-- Log immutabile di TUTTE le azioni (FILE_SACRO section 13 livello 3).
-- "Audit log immutabile: ogni operazione registrata, non cancellabile"
-- Trigger prevent_audit_modification impedisce UPDATE e DELETE (in 005_functions).

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    action audit_action NOT NULL,
    entity_type TEXT,                                 -- es. 'strategy', 'trade', 'bankroll', 'api_key'
    entity_id UUID,
    area market_area,

    -- Dettagli
    details JSONB DEFAULT '{}',                       -- Stato prima/dopo, parametri cambiati
    old_value JSONB,                                  -- Valore precedente (per UPDATE)
    new_value JSONB,                                  -- Nuovo valore (per UPDATE)

    -- Request context
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,

    -- Retention: 90 giorni in hot storage (FILE_SACRO section 13 livello 5)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'IMMUTABLE audit log (FILE_SACRO 13.3). NO UPDATE/DELETE allowed - enforced by trigger + RLS. Retention 90 days (section 13.5).';

-- ============================================================================
-- 14. PUBLISHED STRATEGIES (copy trading)
-- ============================================================================
-- Strategie pubblicate per il copy trading (FILE_SACRO section 14.5).
-- Private per default, condivisibili per scelta.
-- Modello eToro: vedi, copia, classifica trader.

CREATE TABLE published_strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    publisher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Info pubblica
    title TEXT NOT NULL,
    description TEXT,
    area market_area NOT NULL,
    risk_level risk_level NOT NULL,

    -- Pricing (FILE_SACRO section 14.2: marketplace strategie, commissione 20-30%)
    is_free BOOLEAN NOT NULL DEFAULT TRUE,
    price_monthly DECIMAL(10,2),                     -- Per strategie premium
    platform_fee_pct DECIMAL(5,2) DEFAULT 25.00,     -- % commissione piattaforma

    -- Performance pubblica (calcolata dal sistema, non editabile)
    total_trades INT NOT NULL DEFAULT 0,
    win_rate DECIMAL(5,2),
    roi DECIMAL(10,2),
    profit_factor DECIMAL(10,4),
    max_drawdown DECIMAL(5,2),
    sharpe_ratio DECIMAL(10,4),
    track_record_days INT NOT NULL DEFAULT 0,
    avg_trade_duration INTERVAL,
    copiers_count INT NOT NULL DEFAULT 0,            -- Numero di copier attivi

    -- Stato
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,      -- In evidenza
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(strategy_id)
);

COMMENT ON TABLE published_strategies IS 'Published strategies for copy trading (FILE_SACRO 14.5). eToro model: view, copy, trader rankings.';

-- ============================================================================
-- 15. COPY TRADING SUBSCRIPTIONS
-- ============================================================================

CREATE TABLE copy_trading_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    published_strategy_id UUID NOT NULL REFERENCES published_strategies(id) ON DELETE CASCADE,

    -- Config copia
    allocation_pct DECIMAL(5,2),                     -- % del bankroll da allocare
    max_stake DECIMAL(14,2),                         -- Limite per operazione
    scale_factor DECIMAL(5,2) DEFAULT 1.00,          -- Moltiplicatore stake (0.5 = meta, 2.0 = doppio)

    -- Performance follower
    total_pnl DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_trades_copied INT NOT NULL DEFAULT 0,

    -- Stato
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unsubscribed_at TIMESTAMPTZ,

    UNIQUE(follower_id, published_strategy_id)
);

COMMENT ON TABLE copy_trading_subscriptions IS 'Copy trading subscriptions. Free tier: copy only. Pro: copy + publish. Elite: copy + publish + marketplace (FILE_SACRO 14.1).';

-- ============================================================================
-- 16. BACKTEST RUNS (all 4 levels, Monte Carlo, overfitting)
-- ============================================================================
-- Storico dei run di backtest per ogni strategia (FILE_SACRO section 4).
-- 4 livelli: Quick Scan -> Robustness -> Stress Test -> Overfitting Check.

CREATE TABLE backtest_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,

    level backtest_level NOT NULL,

    -- Config
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    initial_capital DECIMAL(14,2) NOT NULL,
    commission_model JSONB NOT NULL DEFAULT '{}',     -- Commissioni usate (FILE_SACRO section 19)
    slippage_pct DECIMAL(5,4) NOT NULL DEFAULT 0.015, -- 1.5% default (section 4: 1-2%)

    -- Risultati core
    total_trades INT,
    winning_trades INT,
    losing_trades INT,
    gross_profit DECIMAL(14,2),
    total_commission DECIMAL(14,2),                   -- "profittevole al lordo ma negativa al netto = PERDENTE"
    total_slippage DECIMAL(14,2),
    net_profit DECIMAL(14,2),                         -- SEMPRE questo e il numero che conta

    -- Metriche (FILE_SACRO section 11.1)
    win_rate DECIMAL(5,2),
    profit_factor DECIMAL(10,4),
    max_drawdown DECIMAL(5,2),
    sharpe_ratio DECIMAL(10,4),
    sortino_ratio DECIMAL(10,4),
    calmar_ratio DECIMAL(10,4),
    roi DECIMAL(10,2),
    avg_trade_pnl DECIMAL(14,2),
    avg_winner DECIMAL(14,2),
    avg_loser DECIMAL(14,2),
    max_consecutive_wins INT,
    max_consecutive_losses INT,
    avg_holding_time INTERVAL,

    -- Benchmark (FILE_SACRO section 11.2)
    benchmark_name TEXT,                              -- es. 'S&P 500 buy & hold', 'BTC buy & hold'
    benchmark_return DECIMAL(10,2),
    alpha DECIMAL(10,2),                              -- Se non batte il benchmark, non serve

    -- Monte Carlo (FILE_SACRO section 4, livello 3: 5+ anni)
    monte_carlo_iterations INT,
    monte_carlo_results JSONB,                        -- Distribuzione risultati, percentili, worst case

    -- Overfitting check (FILE_SACRO section 4, livello 4: +/- 10%)
    overfitting_parameter_variations JSONB,           -- Parametri variati e risultati
    overfitting_stability_score DECIMAL(5,2),         -- Score 0-100: quanto e stabile
    overfitting_results JSONB,

    -- Walk-forward (livello 2)
    walk_forward_windows JSONB,                       -- Risultati per finestra temporale

    -- Risultato finale
    passed BOOLEAN NOT NULL DEFAULT FALSE,
    failure_reason TEXT,                               -- Motivo del fallimento (se non passed)
    notes TEXT,

    -- Execution info
    execution_time_ms INT,                            -- Tempo di esecuzione in ms
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE backtest_runs IS 'Backtest runs across 4 levels (FILE_SACRO 4). Every backtest MUST include real commissions and simulated slippage. Net profit is the ONLY number that matters.';

-- ============================================================================
-- 17. COUNTRY REGULATIONS
-- ============================================================================
-- Configurazione normativa per paese (FILE_SACRO section 15.4).
-- Fase 1: SOLO ITALIA.
-- Fase 2: paesi EU semplici (Spagna, Germania, Francia).
-- Fase 3: UK.
-- MAI senza legale dedicato: USA, Cina.

CREATE TABLE country_regulations (
    country_code CHAR(2) PRIMARY KEY,                -- ISO 3166-1 alpha-2
    country_name TEXT NOT NULL,

    -- Aree permesse
    allowed_areas market_area[] NOT NULL DEFAULT '{polymarket,betfair,stocks,forex,crypto}',
    restricted_areas market_area[] DEFAULT '{}',      -- Aree con restrizioni parziali

    -- Tassazione (FILE_SACRO section 15.2)
    tax_rules JSONB DEFAULT '{}',                    -- Aliquote per area

    -- Disclaimer localizzati (FILE_SACRO section 15.5)
    disclaimers JSONB DEFAULT '{}',

    -- Gambling specifico
    gambling_disclaimer TEXT,                          -- Avviso gioco responsabile
    gambling_helpline TEXT,                            -- Numero verde (Italia: 800-558822)
    gambling_min_age INT NOT NULL DEFAULT 18,

    -- Limiti
    is_supported BOOLEAN NOT NULL DEFAULT FALSE,
    requires_legal_review BOOLEAN NOT NULL DEFAULT TRUE,
    support_phase INT DEFAULT 0,                      -- 0=not supported, 1=fase 1, 2=fase 2, etc.
    legal_notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE country_regulations IS 'Per-country regulatory configuration (FILE_SACRO 15.4). Phase 1: Italy only. Never without dedicated legal counsel: USA, China.';

-- ============================================================================
-- TRIGGER: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_broker_keys_updated_at BEFORE UPDATE ON broker_api_keys
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
CREATE TRIGGER trg_country_regs_updated_at BEFORE UPDATE ON country_regulations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- TRIGGER: auto-calculate net_pnl on trades
-- ============================================================================
-- FILE_SACRO section 4 regole sacre: net_pnl = gross_pnl - commission - slippage

CREATE OR REPLACE FUNCTION calculate_net_pnl()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.gross_pnl IS NOT NULL THEN
        NEW.net_pnl = NEW.gross_pnl - COALESCE(NEW.commission, 0) - COALESCE(NEW.slippage, 0);
    END IF;
    -- Auto-calculate holding duration on close
    IF NEW.status = 'closed' AND NEW.exited_at IS NOT NULL AND NEW.entered_at IS NOT NULL THEN
        NEW.holding_duration = NEW.exited_at - NEW.entered_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trades_net_pnl BEFORE INSERT OR UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION calculate_net_pnl();

-- ============================================================================
-- INITIAL DATA: Italy (FILE_SACRO section 15.2)
-- ============================================================================

INSERT INTO country_regulations (
    country_code, country_name, allowed_areas, tax_rules,
    gambling_disclaimer, gambling_helpline,
    disclaimers, is_supported, requires_legal_review, support_phase
) VALUES (
    'IT', 'Italia',
    '{polymarket,betfair,stocks,forex,crypto}',
    '{
        "stocks": {"rate": 26, "type": "capital_gain"},
        "forex": {"rate": 26, "type": "capital_gain"},
        "crypto": {"rate": 33, "type": "capital_gain", "note": "L. 207/2024 dal 01/01/2026, nessuna soglia di esenzione"},
        "polymarket": {"rate": 26, "type": "redditi_diversi", "note": "zona grigia crypto-based"},
        "betfair": {"rate": null, "type": "da_verificare", "note": "verificare status ADM. Se non ADM: redditi diversi"}
    }'::JSONB,
    'Il gioco d''azzardo puo causare dipendenza',
    '800-558822',
    '{
        "general": "Elio.Market non fornisce consulenza finanziaria personalizzata",
        "past_performance": "Le performance passate non garantiscono risultati futuri",
        "capital_risk": "Il capitale investito puo essere perso totalmente",
        "responsibility": "L''utente e il solo responsabile delle proprie decisioni",
        "gambling": "Elio.Market non e un operatore di gioco e non gestisce scommesse",
        "compliance": "Conforme alle normative gambling del paese dell''utente"
    }'::JSONB,
    TRUE,
    FALSE,
    1
);

-- ===== END: 002_supabase_tables.sql =====

-- ===== START: 003_supabase_rls.sql =====
-- ============================================================================
-- ELIO.MARKET — 003: ROW LEVEL SECURITY POLICIES
-- ============================================================================
-- RLS policies for ALL tables.
-- Core principle (FILE_SACRO section 13 livello 2):
--   "Row Level Security su PostgreSQL: un utente NON PUO MAI accedere ai dati di un altro"
--
-- Exceptions:
--   - knowledge_base L1/L2: shared across all users (FILE_SACRO 8.3)
--   - published_strategies: visible to all when active (FILE_SACRO 14.5)
--   - country_regulations: public data
--   - audit_log: INSERT and SELECT only, NO UPDATE/DELETE (FILE_SACRO 13.3)
--
-- Depends on: 001_supabase_enums.sql, 002_supabase_tables.sql
-- ============================================================================

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
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

-- ============================================================================
-- PROFILES: user can only access their own profile
-- ============================================================================

CREATE POLICY "profiles_select_own" ON profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_insert_own" ON profiles
    FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (id = auth.uid());

-- No DELETE policy: account deletion handled via auth.users cascade

-- ============================================================================
-- BROKER API KEYS: strictly own data only
-- ============================================================================
-- AES-256 encrypted keys (FILE_SACRO section 13 livello 2)

CREATE POLICY "broker_keys_select_own" ON broker_api_keys
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "broker_keys_insert_own" ON broker_api_keys
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "broker_keys_update_own" ON broker_api_keys
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "broker_keys_delete_own" ON broker_api_keys
    FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- STRATEGIES: own data only
-- ============================================================================

CREATE POLICY "strategies_select_own" ON strategies
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "strategies_insert_own" ON strategies
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "strategies_update_own" ON strategies
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "strategies_delete_own" ON strategies
    FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- STRATEGY PARAMETERS: via strategy ownership (subquery)
-- ============================================================================

CREATE POLICY "params_select_own" ON strategy_parameters
    FOR SELECT USING (
        strategy_id IN (SELECT id FROM strategies WHERE user_id = auth.uid())
    );

CREATE POLICY "params_insert_own" ON strategy_parameters
    FOR INSERT WITH CHECK (
        strategy_id IN (SELECT id FROM strategies WHERE user_id = auth.uid())
    );

CREATE POLICY "params_update_own" ON strategy_parameters
    FOR UPDATE USING (
        strategy_id IN (SELECT id FROM strategies WHERE user_id = auth.uid())
    );

CREATE POLICY "params_delete_own" ON strategy_parameters
    FOR DELETE USING (
        strategy_id IN (SELECT id FROM strategies WHERE user_id = auth.uid())
    );

-- ============================================================================
-- BANKROLLS: own data only
-- ============================================================================

CREATE POLICY "bankrolls_select_own" ON bankrolls
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "bankrolls_insert_own" ON bankrolls
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "bankrolls_update_own" ON bankrolls
    FOR UPDATE USING (user_id = auth.uid());

-- No DELETE: bankrolls persist for audit trail

-- ============================================================================
-- BANKROLL ALLOCATIONS: via bankroll ownership
-- ============================================================================

CREATE POLICY "allocations_select_own" ON bankroll_allocations
    FOR SELECT USING (
        bankroll_id IN (SELECT id FROM bankrolls WHERE user_id = auth.uid())
    );

CREATE POLICY "allocations_insert_own" ON bankroll_allocations
    FOR INSERT WITH CHECK (
        bankroll_id IN (SELECT id FROM bankrolls WHERE user_id = auth.uid())
    );

CREATE POLICY "allocations_update_own" ON bankroll_allocations
    FOR UPDATE USING (
        bankroll_id IN (SELECT id FROM bankrolls WHERE user_id = auth.uid())
    );

CREATE POLICY "allocations_delete_own" ON bankroll_allocations
    FOR DELETE USING (
        bankroll_id IN (SELECT id FROM bankrolls WHERE user_id = auth.uid())
    );

-- ============================================================================
-- TRADES: own data only
-- ============================================================================

CREATE POLICY "trades_select_own" ON trades
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "trades_insert_own" ON trades
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "trades_update_own" ON trades
    FOR UPDATE USING (user_id = auth.uid());

-- No DELETE: trades persist for audit trail and performance calculation

-- ============================================================================
-- JOURNAL ENTRIES: own data only
-- ============================================================================

CREATE POLICY "journal_select_own" ON journal_entries
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "journal_insert_own" ON journal_entries
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "journal_update_own" ON journal_entries
    FOR UPDATE USING (user_id = auth.uid());

-- ============================================================================
-- ALERTS: own data only
-- ============================================================================

CREATE POLICY "alerts_select_own" ON alerts
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "alerts_insert_own" ON alerts
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "alerts_update_own" ON alerts
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "alerts_delete_own" ON alerts
    FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- NOTIFICATIONS: own data only
-- ============================================================================

CREATE POLICY "notif_select_own" ON notifications
    FOR SELECT USING (user_id = auth.uid());

-- Insert allowed for system (service role) and user
CREATE POLICY "notif_insert_own" ON notifications
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "notif_update_own" ON notifications
    FOR UPDATE USING (user_id = auth.uid());

-- ============================================================================
-- KNOWLEDGE BASE: L1/L2 shared, L3 personal (FILE_SACRO section 8.3)
-- ============================================================================
-- L1 (Profili statici) and L2 (Analisi evento): visible to ALL authenticated users.
-- L3 (Analisi personalizzata): ONLY the owning user.
-- L1/L2 inserts: only service role (batch notturno) can insert shared entries.

CREATE POLICY "kb_select_shared_and_own" ON knowledge_base
    FOR SELECT USING (
        level IN ('l1_profile', 'l2_event')  -- L1/L2 shared
        OR user_id = auth.uid()               -- L3 personal
    );

-- Users can only insert L3 (personal) entries
CREATE POLICY "kb_insert_personal" ON knowledge_base
    FOR INSERT WITH CHECK (
        (level = 'l3_personal' AND user_id = auth.uid())
        OR user_id IS NULL  -- Service role for L1/L2
    );

-- Users can only update their own L3 entries
CREATE POLICY "kb_update_personal" ON knowledge_base
    FOR UPDATE USING (
        level = 'l3_personal' AND user_id = auth.uid()
    );

-- ============================================================================
-- CONFLICT LOG: own data only (read-only for users)
-- ============================================================================

CREATE POLICY "conflicts_select_own" ON conflict_log
    FOR SELECT USING (user_id = auth.uid());

-- Insert by system only (service role), but allow user for manual logging
CREATE POLICY "conflicts_insert_own" ON conflict_log
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- AUDIT LOG: IMMUTABLE — INSERT and SELECT only, NO UPDATE/DELETE
-- ============================================================================
-- FILE_SACRO section 13 livello 3:
--   "Audit log immutabile: ogni operazione registrata, non cancellabile"
-- Defense in depth: RLS blocks UPDATE/DELETE + trigger blocks at DB level (005_functions)

CREATE POLICY "audit_select_own" ON audit_log
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "audit_insert_own" ON audit_log
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- INTENTIONALLY NO UPDATE POLICY: audit log is immutable
-- INTENTIONALLY NO DELETE POLICY: audit log is immutable
-- Additional protection via trigger in 005_supabase_functions.sql

-- ============================================================================
-- PUBLISHED STRATEGIES: visible to all when active, only publisher modifies
-- ============================================================================
-- FILE_SACRO section 14.5: strategie condivisibili per scelta, visibili a tutti

CREATE POLICY "published_select_all_active" ON published_strategies
    FOR SELECT USING (
        is_active = TRUE                   -- All users see active published strategies
        OR publisher_id = auth.uid()       -- Publisher sees all their own (including inactive)
    );

CREATE POLICY "published_insert_own" ON published_strategies
    FOR INSERT WITH CHECK (publisher_id = auth.uid());

CREATE POLICY "published_update_own" ON published_strategies
    FOR UPDATE USING (publisher_id = auth.uid());

CREATE POLICY "published_delete_own" ON published_strategies
    FOR DELETE USING (publisher_id = auth.uid());

-- ============================================================================
-- COPY TRADING SUBSCRIPTIONS: follower sees their own
-- ============================================================================
-- Publishers can also see who copies them (for analytics)

CREATE POLICY "copy_select_own" ON copy_trading_subscriptions
    FOR SELECT USING (
        follower_id = auth.uid()
        OR published_strategy_id IN (
            SELECT id FROM published_strategies WHERE publisher_id = auth.uid()
        )
    );

CREATE POLICY "copy_insert_own" ON copy_trading_subscriptions
    FOR INSERT WITH CHECK (follower_id = auth.uid());

CREATE POLICY "copy_update_own" ON copy_trading_subscriptions
    FOR UPDATE USING (follower_id = auth.uid());

CREATE POLICY "copy_delete_own" ON copy_trading_subscriptions
    FOR DELETE USING (follower_id = auth.uid());

-- ============================================================================
-- BACKTEST RUNS: own data only
-- ============================================================================

CREATE POLICY "backtest_select_own" ON backtest_runs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "backtest_insert_own" ON backtest_runs
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- No UPDATE/DELETE: backtest results are historical records

-- ============================================================================
-- COUNTRY REGULATIONS: public data, readable by all
-- ============================================================================
-- Configurazione normativa: dati pubblici, non modificabili dagli utenti.
-- Only service role can INSERT/UPDATE/DELETE.

CREATE POLICY "regulations_select_all" ON country_regulations
    FOR SELECT USING (TRUE);

-- No INSERT/UPDATE/DELETE policies for regular users.
-- Only service_role can modify country regulations.

-- ===== END: 003_supabase_rls.sql =====

-- ===== START: 004_supabase_indexes.sql =====
-- ============================================================================
-- ELIO.MARKET — 004: PERFORMANCE INDEXES
-- ============================================================================
-- Indexes on all frequently queried columns.
-- Depends on: 002_supabase_tables.sql
--
-- Design principles:
--   - Composite indexes for common query patterns (user_id + area, user_id + status)
--   - Partial indexes where applicable (is_active = TRUE, is_read = FALSE)
--   - GIN indexes for JSONB and array columns
--   - No over-indexing: each index serves a real query pattern
-- ============================================================================

-- ============================================================================
-- PROFILES
-- ============================================================================

CREATE INDEX idx_profiles_country ON profiles(country_code);
CREATE INDEX idx_profiles_tier ON profiles(subscription_tier);
CREATE INDEX idx_profiles_tier_status ON profiles(subscription_tier, subscription_status);
CREATE INDEX idx_profiles_telegram ON profiles(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE INDEX idx_profiles_active_areas ON profiles USING GIN(active_areas);

-- ============================================================================
-- BROKER API KEYS
-- ============================================================================

CREATE INDEX idx_broker_keys_user ON broker_api_keys(user_id);
CREATE INDEX idx_broker_keys_user_area ON broker_api_keys(user_id, area);
CREATE INDEX idx_broker_keys_active ON broker_api_keys(user_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- STRATEGIES
-- ============================================================================
-- Most common queries:
--   - All strategies for a user (dashboard)
--   - Strategies by area (area dashboard)
--   - Active strategies by status (execution engine)
--   - Strategy by code (lookup)

CREATE INDEX idx_strategies_user ON strategies(user_id);
CREATE INDEX idx_strategies_area ON strategies(area);
CREATE INDEX idx_strategies_status ON strategies(status);
CREATE INDEX idx_strategies_user_area ON strategies(user_id, area);
CREATE INDEX idx_strategies_user_status ON strategies(user_id, status);
CREATE INDEX idx_strategies_user_area_status ON strategies(user_id, area, status);
CREATE INDEX idx_strategies_code ON strategies(user_id, code);
CREATE INDEX idx_strategies_active ON strategies(user_id, is_active, is_archived)
    WHERE is_active = TRUE AND is_archived = FALSE;
CREATE INDEX idx_strategies_live ON strategies(user_id, area)
    WHERE status = 'live' AND is_active = TRUE AND is_paused = FALSE;
CREATE INDEX idx_strategies_paused ON strategies(user_id)
    WHERE is_paused = TRUE;
CREATE INDEX idx_strategies_risk ON strategies(risk_level);
CREATE INDEX idx_strategies_tags ON strategies USING GIN(tags);
CREATE INDEX idx_strategies_created ON strategies(created_at DESC);

-- ============================================================================
-- STRATEGY PARAMETERS
-- ============================================================================

CREATE INDEX idx_strategy_params_strategy ON strategy_parameters(strategy_id);
CREATE INDEX idx_strategy_params_optimizable ON strategy_parameters(strategy_id)
    WHERE is_optimizable = TRUE;

-- ============================================================================
-- BANKROLLS
-- ============================================================================

CREATE INDEX idx_bankrolls_user ON bankrolls(user_id);
CREATE INDEX idx_bankrolls_user_area ON bankrolls(user_id, area);
CREATE INDEX idx_bankrolls_paused ON bankrolls(user_id)
    WHERE is_area_paused = TRUE;

-- ============================================================================
-- BANKROLL ALLOCATIONS
-- ============================================================================

CREATE INDEX idx_allocations_bankroll ON bankroll_allocations(bankroll_id);
CREATE INDEX idx_allocations_strategy ON bankroll_allocations(strategy_id);

-- ============================================================================
-- TRADES
-- ============================================================================
-- Most common queries:
--   - All trades for a user (portfolio view)
--   - Trades by strategy (strategy detail)
--   - Open trades (monitoring)
--   - Recent trades (activity feed)
--   - Trades by asset (asset analysis)

CREATE INDEX idx_trades_user ON trades(user_id);
CREATE INDEX idx_trades_strategy ON trades(strategy_id);
CREATE INDEX idx_trades_area ON trades(area);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_user_area ON trades(user_id, area);
CREATE INDEX idx_trades_user_status ON trades(user_id, status);
CREATE INDEX idx_trades_user_area_status ON trades(user_id, area, status);
CREATE INDEX idx_trades_entered_at ON trades(entered_at DESC);
CREATE INDEX idx_trades_user_entered ON trades(user_id, entered_at DESC);
CREATE INDEX idx_trades_execution_type ON trades(execution_type);
CREATE INDEX idx_trades_asset ON trades(asset_symbol);
CREATE INDEX idx_trades_asset_area ON trades(asset_symbol, area);
CREATE INDEX idx_trades_open ON trades(user_id, area)
    WHERE status = 'open';
CREATE INDEX idx_trades_live_open ON trades(user_id)
    WHERE execution_type = 'live' AND status = 'open';
CREATE INDEX idx_trades_strategy_status ON trades(strategy_id, status);
CREATE INDEX idx_trades_tags ON trades USING GIN(tags);
CREATE INDEX idx_trades_market_condition ON trades(market_condition)
    WHERE market_condition IS NOT NULL;
CREATE INDEX idx_trades_timeframe ON trades(timeframe)
    WHERE timeframe IS NOT NULL;
CREATE INDEX idx_trades_exit_reason ON trades(exit_reason)
    WHERE exit_reason IS NOT NULL;
CREATE INDEX idx_trades_broker_order ON trades(broker_order_id)
    WHERE broker_order_id IS NOT NULL;

-- ============================================================================
-- JOURNAL ENTRIES
-- ============================================================================

CREATE INDEX idx_journal_user ON journal_entries(user_id);
CREATE INDEX idx_journal_trade ON journal_entries(trade_id);
CREATE INDEX idx_journal_strategy ON journal_entries(strategy_id);
CREATE INDEX idx_journal_created ON journal_entries(created_at DESC);
CREATE INDEX idx_journal_user_created ON journal_entries(user_id, created_at DESC);
CREATE INDEX idx_journal_type ON journal_entries(entry_type);
CREATE INDEX idx_journal_area ON journal_entries(area)
    WHERE area IS NOT NULL;
CREATE INDEX idx_journal_pinned ON journal_entries(user_id)
    WHERE is_pinned = TRUE;
CREATE INDEX idx_journal_tags ON journal_entries USING GIN(tags);

-- ============================================================================
-- ALERTS
-- ============================================================================

CREATE INDEX idx_alerts_user ON alerts(user_id);
CREATE INDEX idx_alerts_active ON alerts(user_id, is_active)
    WHERE is_active = TRUE;
CREATE INDEX idx_alerts_strategy ON alerts(strategy_id);
CREATE INDEX idx_alerts_condition ON alerts(condition_type);
CREATE INDEX idx_alerts_area ON alerts(area)
    WHERE area IS NOT NULL;
CREATE INDEX idx_alerts_asset ON alerts(asset_symbol)
    WHERE asset_symbol IS NOT NULL;
CREATE INDEX idx_alerts_priority ON alerts(user_id)
    WHERE is_priority = TRUE AND is_active = TRUE;

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read)
    WHERE is_read = FALSE;
CREATE INDEX idx_notifications_sent ON notifications(sent_at DESC);
CREATE INDEX idx_notifications_user_sent ON notifications(user_id, sent_at DESC);
CREATE INDEX idx_notifications_pending_action ON notifications(user_id)
    WHERE action_type IS NOT NULL AND action_response IS NULL;
CREATE INDEX idx_notifications_channel ON notifications(channel);
CREATE INDEX idx_notifications_unsent ON notifications(is_sent)
    WHERE is_sent = FALSE;

-- ============================================================================
-- KNOWLEDGE BASE
-- ============================================================================

CREATE INDEX idx_kb_level ON knowledge_base(level);
CREATE INDEX idx_kb_entity ON knowledge_base(area, entity_type, entity_id);
CREATE INDEX idx_kb_area_level ON knowledge_base(area, level);
CREATE INDEX idx_kb_user ON knowledge_base(user_id)
    WHERE user_id IS NOT NULL;
CREATE INDEX idx_kb_valid ON knowledge_base(valid_until)
    WHERE valid_until IS NOT NULL;
CREATE INDEX idx_kb_invalidation ON knowledge_base(invalidation_rule, valid_until)
    WHERE valid_until IS NOT NULL;
CREATE INDEX idx_kb_prompt_hash ON knowledge_base(prompt_hash)
    WHERE prompt_hash IS NOT NULL;

-- Uncomment when pgvector extension is enabled:
-- CREATE INDEX idx_kb_embedding ON knowledge_base
--     USING ivfflat (embedding_vector vector_cosine_ops)
--     WITH (lists = 100);

-- ============================================================================
-- CONFLICT LOG
-- ============================================================================

CREATE INDEX idx_conflicts_user ON conflict_log(user_id);
CREATE INDEX idx_conflicts_detected ON conflict_log(detected_at DESC);
CREATE INDEX idx_conflicts_user_detected ON conflict_log(user_id, detected_at DESC);
CREATE INDEX idx_conflicts_asset ON conflict_log(asset_symbol);
CREATE INDEX idx_conflicts_area ON conflict_log(area);
CREATE INDEX idx_conflicts_strategies ON conflict_log(strategy_a_id, strategy_b_id);

-- ============================================================================
-- AUDIT LOG (immutable)
-- ============================================================================
-- Note: no updated_at index because this table is immutable

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_user_created ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user_action ON audit_log(user_id, action);
CREATE INDEX idx_audit_area ON audit_log(area)
    WHERE area IS NOT NULL;
CREATE INDEX idx_audit_ip ON audit_log(ip_address)
    WHERE ip_address IS NOT NULL;

-- ============================================================================
-- PUBLISHED STRATEGIES
-- ============================================================================

CREATE INDEX idx_published_area ON published_strategies(area);
CREATE INDEX idx_published_publisher ON published_strategies(publisher_id);
CREATE INDEX idx_published_active ON published_strategies(is_active)
    WHERE is_active = TRUE;
CREATE INDEX idx_published_active_area ON published_strategies(area, is_active)
    WHERE is_active = TRUE;
CREATE INDEX idx_published_risk ON published_strategies(risk_level)
    WHERE is_active = TRUE;
CREATE INDEX idx_published_roi ON published_strategies(roi DESC NULLS LAST)
    WHERE is_active = TRUE;
CREATE INDEX idx_published_copiers ON published_strategies(copiers_count DESC)
    WHERE is_active = TRUE;
CREATE INDEX idx_published_featured ON published_strategies(is_featured)
    WHERE is_featured = TRUE AND is_active = TRUE;

-- ============================================================================
-- COPY TRADING SUBSCRIPTIONS
-- ============================================================================

CREATE INDEX idx_copy_follower ON copy_trading_subscriptions(follower_id);
CREATE INDEX idx_copy_published ON copy_trading_subscriptions(published_strategy_id);
CREATE INDEX idx_copy_active ON copy_trading_subscriptions(follower_id, is_active)
    WHERE is_active = TRUE;
CREATE INDEX idx_copy_published_active ON copy_trading_subscriptions(published_strategy_id)
    WHERE is_active = TRUE;

-- ============================================================================
-- BACKTEST RUNS
-- ============================================================================

CREATE INDEX idx_backtest_strategy ON backtest_runs(strategy_id);
CREATE INDEX idx_backtest_user ON backtest_runs(user_id);
CREATE INDEX idx_backtest_level ON backtest_runs(level);
CREATE INDEX idx_backtest_strategy_level ON backtest_runs(strategy_id, level);
CREATE INDEX idx_backtest_passed ON backtest_runs(strategy_id, passed)
    WHERE passed = TRUE;
CREATE INDEX idx_backtest_created ON backtest_runs(created_at DESC);

-- ===== END: 004_supabase_indexes.sql =====

-- ===== START: 005_supabase_functions.sql =====
-- ============================================================================
-- ELIO.MARKET — 005: FUNCTIONS & TRIGGERS
-- ============================================================================
-- Server-side functions for business logic enforcement.
-- Depends on: 001_supabase_enums.sql, 002_supabase_tables.sql
--
-- Functions:
--   1. prevent_audit_modification: makes audit_log truly immutable
--   2. calculate_strategy_performance: computes all strategy metrics
--   3. check_drawdown_limits: enforces drawdown rules (FILE_SACRO 6.1)
--   4. check_allocation_limit: enforces max 10% bankroll per strategy
--   5. enforce_promotion_rules: validates strategy lifecycle transitions
-- ============================================================================

-- ============================================================================
-- 1. AUDIT LOG IMMUTABILITY TRIGGER
-- ============================================================================
-- FILE_SACRO section 13 livello 3:
--   "Audit log immutabile: ogni operazione registrata, non cancellabile"
-- Defense in depth: this trigger + RLS + no UPDATE/DELETE policies.

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is IMMUTABLE: % operations are strictly forbidden (FILE_SACRO 13.3)', TG_OP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION prevent_audit_modification() IS 'Prevents any UPDATE or DELETE on audit_log. Immutability enforced at DB level (FILE_SACRO 13.3).';

CREATE TRIGGER trg_audit_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER trg_audit_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- ============================================================================
-- 2. CALCULATE STRATEGY PERFORMANCE METRICS
-- ============================================================================
-- Calculates all performance metrics for a given strategy (FILE_SACRO section 11.1).
-- Called periodically or after each trade close to update cached metrics on strategies table.
--
-- Metrics computed:
--   - Win Rate, ROI, Profit Factor, Max Drawdown, Sharpe Ratio
--   - Edge medio, Slippage reale vs simulato
--   - Total/Winning/Losing trades
--
-- Returns a record with all metrics for flexibility in usage.

CREATE OR REPLACE FUNCTION calculate_strategy_performance(
    p_strategy_id UUID,
    p_execution_type execution_type DEFAULT NULL  -- NULL = both paper and live
)
RETURNS TABLE(
    total_trades INT,
    winning_trades INT,
    losing_trades INT,
    win_rate DECIMAL(5,2),
    gross_profit DECIMAL(14,2),
    total_commission DECIMAL(14,2),
    total_slippage DECIMAL(14,2),
    net_profit DECIMAL(14,2),
    roi DECIMAL(10,2),
    profit_factor DECIMAL(10,4),
    max_drawdown DECIMAL(5,2),
    sharpe_ratio DECIMAL(10,4),
    avg_edge DECIMAL(5,2),
    avg_slippage_real DECIMAL(5,4),
    avg_slippage_simulated DECIMAL(5,4),
    avg_holding_time INTERVAL,
    max_consecutive_wins INT,
    max_consecutive_losses INT
) AS $$
DECLARE
    v_total INT;
    v_winning INT;
    v_losing INT;
    v_gross DECIMAL(14,2);
    v_comm DECIMAL(14,2);
    v_slip DECIMAL(14,2);
    v_net DECIMAL(14,2);
    v_initial_capital DECIMAL(14,2);
    v_avg_return DECIMAL;
    v_stddev_return DECIMAL;
    v_max_dd DECIMAL(5,2);
    v_running_pnl DECIMAL(14,2) := 0;
    v_peak DECIMAL(14,2) := 0;
    v_current_dd DECIMAL(5,2) := 0;
    v_cons_wins INT := 0;
    v_cons_losses INT := 0;
    v_max_cons_wins INT := 0;
    v_max_cons_losses INT := 0;
    v_gross_wins DECIMAL(14,2);
    v_gross_losses DECIMAL(14,2);
    r RECORD;
BEGIN
    -- Count trades
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE t.net_pnl > 0),
        COUNT(*) FILTER (WHERE t.net_pnl <= 0),
        COALESCE(SUM(t.gross_pnl), 0),
        COALESCE(SUM(t.commission), 0),
        COALESCE(SUM(t.slippage), 0),
        COALESCE(SUM(t.net_pnl), 0),
        COALESCE(SUM(t.net_pnl) FILTER (WHERE t.net_pnl > 0), 0),
        COALESCE(SUM(ABS(t.net_pnl)) FILTER (WHERE t.net_pnl <= 0), 0)
    INTO v_total, v_winning, v_losing, v_gross, v_comm, v_slip, v_net, v_gross_wins, v_gross_losses
    FROM trades t
    WHERE t.strategy_id = p_strategy_id
      AND t.status = 'closed'
      AND (p_execution_type IS NULL OR t.execution_type = p_execution_type);

    -- Get initial capital from bankroll allocation
    SELECT COALESCE(ba.allocated_amount, 1000)
    INTO v_initial_capital
    FROM bankroll_allocations ba
    WHERE ba.strategy_id = p_strategy_id
    LIMIT 1;

    IF v_initial_capital IS NULL OR v_initial_capital = 0 THEN
        v_initial_capital := 1000;  -- Default fallback
    END IF;

    -- Calculate max drawdown and consecutive wins/losses by iterating trades chronologically
    v_max_dd := 0;
    FOR r IN
        SELECT t.net_pnl
        FROM trades t
        WHERE t.strategy_id = p_strategy_id
          AND t.status = 'closed'
          AND (p_execution_type IS NULL OR t.execution_type = p_execution_type)
        ORDER BY t.exited_at ASC
    LOOP
        v_running_pnl := v_running_pnl + COALESCE(r.net_pnl, 0);

        -- Track peak and drawdown
        IF v_running_pnl > v_peak THEN
            v_peak := v_running_pnl;
        END IF;
        IF v_peak > 0 THEN
            v_current_dd := ((v_peak - v_running_pnl) / v_peak) * 100;
            IF v_current_dd > v_max_dd THEN
                v_max_dd := v_current_dd;
            END IF;
        END IF;

        -- Track consecutive wins/losses
        IF r.net_pnl > 0 THEN
            v_cons_wins := v_cons_wins + 1;
            v_cons_losses := 0;
            IF v_cons_wins > v_max_cons_wins THEN
                v_max_cons_wins := v_cons_wins;
            END IF;
        ELSE
            v_cons_losses := v_cons_losses + 1;
            v_cons_wins := 0;
            IF v_cons_losses > v_max_cons_losses THEN
                v_max_cons_losses := v_cons_losses;
            END IF;
        END IF;
    END LOOP;

    -- Calculate Sharpe Ratio (annualized, assuming ~252 trading days)
    SELECT
        AVG(t.net_pnl / NULLIF(t.stake, 0)),
        STDDEV(t.net_pnl / NULLIF(t.stake, 0))
    INTO v_avg_return, v_stddev_return
    FROM trades t
    WHERE t.strategy_id = p_strategy_id
      AND t.status = 'closed'
      AND (p_execution_type IS NULL OR t.execution_type = p_execution_type);

    RETURN QUERY SELECT
        v_total,
        v_winning,
        v_losing,
        -- Win Rate
        CASE WHEN v_total > 0
            THEN ROUND((v_winning::DECIMAL / v_total) * 100, 2)
            ELSE 0
        END,
        -- Gross profit
        v_gross,
        -- Total commission
        v_comm,
        -- Total slippage
        v_slip,
        -- Net profit (this is the ONLY number that matters - FILE_SACRO section 4)
        v_net,
        -- ROI
        CASE WHEN v_initial_capital > 0
            THEN ROUND((v_net / v_initial_capital) * 100, 2)
            ELSE 0
        END,
        -- Profit Factor (>1 = profittevole, FILE_SACRO section 11.1)
        CASE WHEN v_gross_losses > 0
            THEN ROUND(v_gross_wins / v_gross_losses, 4)
            WHEN v_gross_wins > 0
            THEN 9999.9999  -- Infinite profit factor
            ELSE 0
        END,
        -- Max Drawdown
        ROUND(v_max_dd, 2),
        -- Sharpe Ratio (annualized)
        CASE WHEN v_stddev_return > 0 AND v_stddev_return IS NOT NULL
            THEN ROUND((v_avg_return / v_stddev_return) * SQRT(252), 4)
            ELSE 0
        END,
        -- Average Edge (FILE_SACRO section 11.1)
        (SELECT ROUND(AVG(t.edge_at_entry), 2)
         FROM trades t
         WHERE t.strategy_id = p_strategy_id
           AND t.status = 'closed'
           AND t.edge_at_entry IS NOT NULL
           AND (p_execution_type IS NULL OR t.execution_type = p_execution_type)),
        -- Average real slippage
        (SELECT ROUND(AVG(ABS(t.slippage) / NULLIF(t.stake, 0)), 4)
         FROM trades t
         WHERE t.strategy_id = p_strategy_id
           AND t.status = 'closed'
           AND (p_execution_type IS NULL OR t.execution_type = p_execution_type)),
        -- Average simulated slippage
        (SELECT ROUND(AVG(ABS(t.slippage_simulated) / NULLIF(t.stake, 0)), 4)
         FROM trades t
         WHERE t.strategy_id = p_strategy_id
           AND t.status = 'closed'
           AND (p_execution_type IS NULL OR t.execution_type = p_execution_type)),
        -- Average holding time (FILE_SACRO section 11.1)
        (SELECT AVG(t.holding_duration)
         FROM trades t
         WHERE t.strategy_id = p_strategy_id
           AND t.status = 'closed'
           AND t.holding_duration IS NOT NULL
           AND (p_execution_type IS NULL OR t.execution_type = p_execution_type)),
        -- Max consecutive wins
        v_max_cons_wins,
        -- Max consecutive losses
        v_max_cons_losses;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_strategy_performance IS 'Computes all performance metrics for a strategy (FILE_SACRO 11.1). Always returns net profit after commissions (FILE_SACRO 4 sacred rules).';

-- ============================================================================
-- 3. CHECK DRAWDOWN LIMITS
-- ============================================================================
-- Enforces the 3 drawdown rules from FILE_SACRO section 6.1:
--   Rule 1: Max drawdown per strategia: -20% -> pausa automatica
--   Rule 2: Max drawdown per area: -25% del bankroll
--   Rule 3: Max drawdown globale: -30% -> TUTTO in pausa. Full stop.
--
-- Returns a JSONB with violation details or NULL if no violations.
-- Should be called before every trade execution.

CREATE OR REPLACE FUNCTION check_drawdown_limits(
    p_user_id UUID,
    p_strategy_id UUID DEFAULT NULL,
    p_area market_area DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB := '{}';
    v_violations JSONB := '[]';
    v_strategy RECORD;
    v_bankroll RECORD;
    v_profile RECORD;
    v_global_equity DECIMAL(14,2) := 0;
    v_global_peak DECIMAL(14,2) := 0;
    v_global_dd DECIMAL(5,2);
BEGIN
    -- ========================================
    -- RULE 1: Strategy drawdown check (-20%)
    -- ========================================
    IF p_strategy_id IS NOT NULL THEN
        SELECT s.*, ba.allocated_amount, ba.high_water_mark, ba.current_value
        INTO v_strategy
        FROM strategies s
        LEFT JOIN bankroll_allocations ba ON ba.strategy_id = s.id
        WHERE s.id = p_strategy_id AND s.user_id = p_user_id;

        IF v_strategy IS NOT NULL AND v_strategy.high_water_mark > 0 THEN
            DECLARE
                v_strategy_dd DECIMAL(5,2);
            BEGIN
                v_strategy_dd := ((v_strategy.high_water_mark - COALESCE(v_strategy.current_value, 0))
                                  / v_strategy.high_water_mark) * 100;

                IF v_strategy_dd >= COALESCE(v_strategy.max_drawdown, 20) THEN
                    -- Pause the strategy automatically
                    UPDATE strategies
                    SET is_paused = TRUE,
                        paused_at = NOW(),
                        pause_reason = format('Drawdown limit reached: %.2f%% (max: %.2f%%)',
                                              v_strategy_dd, COALESCE(v_strategy.max_drawdown, 20))
                    WHERE id = p_strategy_id;

                    v_violations := v_violations || jsonb_build_object(
                        'level', 'strategy',
                        'strategy_id', p_strategy_id,
                        'current_drawdown', v_strategy_dd,
                        'max_drawdown', COALESCE(v_strategy.max_drawdown, 20),
                        'action', 'strategy_paused'
                    );

                    -- Audit log
                    INSERT INTO audit_log (user_id, action, entity_type, entity_id, area, details)
                    VALUES (p_user_id, 'circuit_breaker_activated', 'strategy', p_strategy_id,
                            v_strategy.area,
                            jsonb_build_object('reason', 'drawdown_limit',
                                               'drawdown_pct', v_strategy_dd,
                                               'limit_pct', COALESCE(v_strategy.max_drawdown, 20)));
                END IF;
            END;
        END IF;
    END IF;

    -- ========================================
    -- RULE 2: Area drawdown check (-25%)
    -- ========================================
    IF p_area IS NOT NULL THEN
        SELECT *
        INTO v_bankroll
        FROM bankrolls b
        WHERE b.user_id = p_user_id AND b.area = p_area;

        IF v_bankroll IS NOT NULL AND v_bankroll.peak_balance > 0 THEN
            DECLARE
                v_area_dd DECIMAL(5,2);
            BEGIN
                v_area_dd := ((v_bankroll.peak_balance - v_bankroll.current_balance)
                              / v_bankroll.peak_balance) * 100;

                IF v_area_dd >= COALESCE(v_bankroll.max_drawdown_pct, 25) THEN
                    -- Pause the entire area
                    UPDATE bankrolls
                    SET is_area_paused = TRUE,
                        area_paused_at = NOW(),
                        current_drawdown_pct = v_area_dd
                    WHERE id = v_bankroll.id;

                    -- Pause all active strategies in this area
                    UPDATE strategies
                    SET is_paused = TRUE,
                        paused_at = NOW(),
                        pause_reason = format('Area drawdown limit reached: %.2f%%', v_area_dd)
                    WHERE user_id = p_user_id
                      AND area = p_area
                      AND is_paused = FALSE
                      AND is_active = TRUE;

                    v_violations := v_violations || jsonb_build_object(
                        'level', 'area',
                        'area', p_area,
                        'current_drawdown', v_area_dd,
                        'max_drawdown', COALESCE(v_bankroll.max_drawdown_pct, 25),
                        'action', 'area_paused'
                    );

                    INSERT INTO audit_log (user_id, action, entity_type, entity_id, area, details)
                    VALUES (p_user_id, 'drawdown_limit_hit', 'bankroll', v_bankroll.id, p_area,
                            jsonb_build_object('reason', 'area_drawdown',
                                               'drawdown_pct', v_area_dd,
                                               'limit_pct', COALESCE(v_bankroll.max_drawdown_pct, 25)));
                END IF;
            END;
        END IF;
    END IF;

    -- ========================================
    -- RULE 3: Global drawdown check (-30%)
    -- ========================================
    SELECT COALESCE(SUM(b.current_balance), 0),
           COALESCE(SUM(b.peak_balance), 0)
    INTO v_global_equity, v_global_peak
    FROM bankrolls b
    WHERE b.user_id = p_user_id;

    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

    IF v_global_peak > 0 THEN
        v_global_dd := ((v_global_peak - v_global_equity) / v_global_peak) * 100;

        IF v_global_dd >= COALESCE(v_profile.max_drawdown_global, 30) THEN
            -- FULL STOP: pause EVERYTHING
            UPDATE profiles
            SET is_global_pause = TRUE,
                global_pause_at = NOW()
            WHERE id = p_user_id;

            -- Pause all bankrolls
            UPDATE bankrolls
            SET is_area_paused = TRUE,
                area_paused_at = NOW()
            WHERE user_id = p_user_id AND is_area_paused = FALSE;

            -- Pause all strategies
            UPDATE strategies
            SET is_paused = TRUE,
                paused_at = NOW(),
                pause_reason = format('GLOBAL drawdown limit: %.2f%% — FULL STOP', v_global_dd)
            WHERE user_id = p_user_id AND is_paused = FALSE AND is_active = TRUE;

            v_violations := v_violations || jsonb_build_object(
                'level', 'global',
                'current_drawdown', v_global_dd,
                'max_drawdown', COALESCE(v_profile.max_drawdown_global, 30),
                'action', 'global_full_stop'
            );

            INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
            VALUES (p_user_id, 'kill_switch_activated', 'profile', p_user_id,
                    jsonb_build_object('reason', 'global_drawdown',
                                       'drawdown_pct', v_global_dd,
                                       'limit_pct', COALESCE(v_profile.max_drawdown_global, 30),
                                       'action', 'FULL_STOP'));
        END IF;
    END IF;

    -- Build result
    IF jsonb_array_length(v_violations) > 0 THEN
        v_result := jsonb_build_object(
            'has_violations', TRUE,
            'violations', v_violations,
            'global_drawdown_pct', v_global_dd,
            'checked_at', NOW()
        );
    ELSE
        v_result := jsonb_build_object(
            'has_violations', FALSE,
            'global_drawdown_pct', COALESCE(v_global_dd, 0),
            'checked_at', NOW()
        );
    END IF;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_drawdown_limits IS 'Enforces the 3 sacred drawdown rules (FILE_SACRO 6.1): -20% per strategy, -25% per area, -30% global FULL STOP. Must be called before every trade execution.';

-- ============================================================================
-- 4. CHECK ALLOCATION LIMIT
-- ============================================================================
-- FILE_SACRO section 6.1 rule 4:
--   "Nessuna strategia riceve piu del 10% del bankroll della sua area all'inizio"
-- Returns TRUE if allocation is within limits, FALSE otherwise.

CREATE OR REPLACE FUNCTION check_allocation_limit(
    p_bankroll_id UUID,
    p_strategy_id UUID,
    p_requested_amount DECIMAL(14,2)
)
RETURNS JSONB AS $$
DECLARE
    v_bankroll RECORD;
    v_strategy RECORD;
    v_max_pct DECIMAL(5,2);
    v_max_amount DECIMAL(14,2);
    v_current_allocation DECIMAL(14,2);
BEGIN
    SELECT * INTO v_bankroll FROM bankrolls WHERE id = p_bankroll_id;
    SELECT * INTO v_strategy FROM strategies WHERE id = p_strategy_id;

    IF v_bankroll IS NULL OR v_strategy IS NULL THEN
        RETURN jsonb_build_object('allowed', FALSE, 'reason', 'bankroll or strategy not found');
    END IF;

    v_max_pct := COALESCE(v_strategy.max_allocation_pct, 10.00);
    v_max_amount := v_bankroll.current_balance * (v_max_pct / 100);

    -- Check current allocation
    SELECT COALESCE(allocated_amount, 0)
    INTO v_current_allocation
    FROM bankroll_allocations
    WHERE bankroll_id = p_bankroll_id AND strategy_id = p_strategy_id;

    IF v_current_allocation IS NULL THEN
        v_current_allocation := 0;
    END IF;

    IF (v_current_allocation + p_requested_amount) > v_max_amount THEN
        RETURN jsonb_build_object(
            'allowed', FALSE,
            'reason', format('Allocation would exceed %s%% limit (%s EUR max, currently %s EUR)',
                             v_max_pct, v_max_amount, v_current_allocation),
            'max_pct', v_max_pct,
            'max_amount', v_max_amount,
            'current_allocation', v_current_allocation,
            'requested', p_requested_amount
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', TRUE,
        'max_pct', v_max_pct,
        'max_amount', v_max_amount,
        'current_allocation', v_current_allocation,
        'remaining', v_max_amount - v_current_allocation
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_allocation_limit IS 'Enforces max allocation per strategy (FILE_SACRO 6.1 rule 4): no strategy gets more than 10% of area bankroll at start.';

-- ============================================================================
-- 5. ENFORCE STRATEGY PROMOTION RULES
-- ============================================================================
-- FILE_SACRO section 5.2: Promozione graduale obbligatoria.
-- Observation -> Paper Trading (min 30 giorni positivi) -> Live (stake minimo)
-- NESSUNA strategia va live senza backtest + paper trading.

CREATE OR REPLACE FUNCTION enforce_promotion_rules()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check on status change
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Observation -> Paper Trading
    IF OLD.status = 'observation' AND NEW.status = 'paper_trading' THEN
        -- Must have passed at least quick_scan backtest
        IF NEW.highest_backtest_level IS NULL THEN
            RAISE EXCEPTION 'Cannot promote to paper trading: no backtest completed (FILE_SACRO principle 4)';
        END IF;
        NEW.promoted_to_paper_at := NOW();
        RETURN NEW;
    END IF;

    -- Paper Trading -> Live
    IF OLD.status = 'paper_trading' AND NEW.status = 'live' THEN
        -- Must have at least 30 profitable days in paper (FILE_SACRO section 5.2)
        IF COALESCE(NEW.paper_profitable_days, 0) < 30 THEN
            RAISE EXCEPTION 'Cannot promote to live: only % profitable paper days (minimum 30 required, FILE_SACRO 5.2)',
                            COALESCE(NEW.paper_profitable_days, 0);
        END IF;

        -- Must have passed backtest (FILE_SACRO principle 4)
        IF NEW.highest_backtest_level IS NULL THEN
            RAISE EXCEPTION 'Cannot promote to live: no backtest completed (FILE_SACRO principle 4)';
        END IF;

        -- User must have 2FA enabled for live trading (FILE_SACRO section 13 livello 2)
        DECLARE
            v_has_2fa BOOLEAN;
            v_risk_ok BOOLEAN;
        BEGIN
            SELECT two_fa_enabled, risk_understanding
            INTO v_has_2fa, v_risk_ok
            FROM profiles
            WHERE id = NEW.user_id;

            IF NOT COALESCE(v_has_2fa, FALSE) THEN
                RAISE EXCEPTION 'Cannot promote to live: 2FA not enabled (FILE_SACRO 13.2)';
            END IF;

            IF NOT COALESCE(v_risk_ok, FALSE) THEN
                RAISE EXCEPTION 'Cannot promote to live: risk understanding not confirmed (FILE_SACRO 15.3)';
            END IF;
        END;

        NEW.promoted_to_live_at := NOW();
        RETURN NEW;
    END IF;

    -- Cannot skip levels (e.g., observation -> live)
    IF OLD.status = 'observation' AND NEW.status = 'live' THEN
        RAISE EXCEPTION 'Cannot skip paper trading phase. Promotion: observation -> paper -> live (FILE_SACRO 5.2)';
    END IF;

    -- Demotions are always allowed (going back to observation or paper)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_strategy_promotion
    BEFORE UPDATE ON strategies
    FOR EACH ROW EXECUTE FUNCTION enforce_promotion_rules();

COMMENT ON FUNCTION enforce_promotion_rules IS 'Enforces mandatory promotion lifecycle: observation -> paper (30 profitable days) -> live. No exceptions (FILE_SACRO principle 4, section 5.2).';

-- ============================================================================
-- 6. UPDATE STRATEGY STATS AFTER TRADE CLOSE
-- ============================================================================
-- Automatically updates cached performance stats on the strategies table
-- when a trade is closed. Keeps dashboard queries fast.

CREATE OR REPLACE FUNCTION update_strategy_stats_on_trade_close()
RETURNS TRIGGER AS $$
DECLARE
    v_perf RECORD;
BEGIN
    -- Only trigger on trade close
    IF NEW.status != 'closed' OR OLD.status = 'closed' THEN
        RETURN NEW;
    END IF;

    IF NEW.strategy_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get fresh performance metrics
    SELECT * INTO v_perf
    FROM calculate_strategy_performance(NEW.strategy_id, NEW.execution_type);

    -- Update strategy cached metrics
    UPDATE strategies SET
        total_trades = COALESCE(v_perf.total_trades, 0),
        winning_trades = COALESCE(v_perf.winning_trades, 0),
        losing_trades = COALESCE(v_perf.losing_trades, 0),
        current_win_rate = v_perf.win_rate,
        current_roi = v_perf.roi,
        current_profit_factor = v_perf.profit_factor,
        current_max_drawdown = v_perf.max_drawdown,
        current_sharpe_ratio = v_perf.sharpe_ratio,
        consecutive_losses = CASE
            WHEN NEW.net_pnl > 0 THEN 0
            ELSE COALESCE(consecutive_losses, 0) + 1
        END
    WHERE id = NEW.strategy_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_strategy_stats
    AFTER UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION update_strategy_stats_on_trade_close();

COMMENT ON FUNCTION update_strategy_stats_on_trade_close IS 'Auto-updates cached performance stats on strategies table when a trade closes. Keeps dashboard queries fast.';

-- ============================================================================
-- 7. CIRCUIT BREAKER CHECK ON TRADE CLOSE
-- ============================================================================
-- FILE_SACRO section 6.3:
--   "Se una strategia perde X% in N giorni -> si ferma automaticamente"

CREATE OR REPLACE FUNCTION check_circuit_breaker()
RETURNS TRIGGER AS $$
DECLARE
    v_strategy RECORD;
    v_recent_pnl DECIMAL(14,2);
    v_recent_capital DECIMAL(14,2);
    v_loss_pct DECIMAL(5,2);
BEGIN
    -- Only on trade close with a loss
    IF NEW.status != 'closed' OR OLD.status = 'closed' THEN
        RETURN NEW;
    END IF;

    IF NEW.strategy_id IS NULL OR COALESCE(NEW.net_pnl, 0) >= 0 THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_strategy FROM strategies WHERE id = NEW.strategy_id;

    IF v_strategy IS NULL OR v_strategy.is_paused THEN
        RETURN NEW;
    END IF;

    -- Check consecutive losses
    IF v_strategy.consecutive_losses >= COALESCE(v_strategy.max_consecutive_losses, 10) THEN
        UPDATE strategies
        SET is_paused = TRUE,
            paused_at = NOW(),
            pause_reason = format('Circuit breaker: %s consecutive losses', v_strategy.consecutive_losses)
        WHERE id = NEW.strategy_id;

        INSERT INTO audit_log (user_id, action, entity_type, entity_id, area, details)
        VALUES (NEW.user_id, 'circuit_breaker_activated', 'strategy', NEW.strategy_id, NEW.area,
                jsonb_build_object('reason', 'consecutive_losses',
                                   'count', v_strategy.consecutive_losses));

        RETURN NEW;
    END IF;

    -- Check % loss in N days
    IF v_strategy.circuit_breaker_loss_pct IS NOT NULL AND v_strategy.circuit_breaker_days IS NOT NULL THEN
        SELECT COALESCE(SUM(t.net_pnl), 0)
        INTO v_recent_pnl
        FROM trades t
        WHERE t.strategy_id = NEW.strategy_id
          AND t.status = 'closed'
          AND t.exited_at >= NOW() - (v_strategy.circuit_breaker_days || ' days')::INTERVAL;

        -- Get capital base for % calculation
        SELECT COALESCE(ba.allocated_amount, 1000)
        INTO v_recent_capital
        FROM bankroll_allocations ba
        WHERE ba.strategy_id = NEW.strategy_id
        LIMIT 1;

        IF v_recent_capital IS NULL OR v_recent_capital = 0 THEN
            v_recent_capital := 1000;
        END IF;

        v_loss_pct := ABS(LEAST(v_recent_pnl, 0)) / v_recent_capital * 100;

        IF v_loss_pct >= v_strategy.circuit_breaker_loss_pct THEN
            UPDATE strategies
            SET is_paused = TRUE,
                paused_at = NOW(),
                pause_reason = format('Circuit breaker: %.2f%% loss in %s days (limit: %.2f%%)',
                                      v_loss_pct, v_strategy.circuit_breaker_days, v_strategy.circuit_breaker_loss_pct)
            WHERE id = NEW.strategy_id;

            INSERT INTO audit_log (user_id, action, entity_type, entity_id, area, details)
            VALUES (NEW.user_id, 'circuit_breaker_activated', 'strategy', NEW.strategy_id, NEW.area,
                    jsonb_build_object('reason', 'loss_pct_exceeded',
                                       'loss_pct', v_loss_pct,
                                       'limit_pct', v_strategy.circuit_breaker_loss_pct,
                                       'days', v_strategy.circuit_breaker_days));
        END IF;
    END IF;

    -- Also run drawdown checks
    PERFORM check_drawdown_limits(NEW.user_id, NEW.strategy_id, NEW.area);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_circuit_breaker
    AFTER UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION check_circuit_breaker();

COMMENT ON FUNCTION check_circuit_breaker IS 'Automatic circuit breaker: pauses strategy on X% loss in N days or Y consecutive losses (FILE_SACRO 6.3). Also triggers drawdown checks.';

-- ============================================================================
-- 8. UPDATE BANKROLL BALANCE ON TRADE CLOSE
-- ============================================================================
-- Keeps bankroll current_balance in sync with trade P&L.

CREATE OR REPLACE FUNCTION update_bankroll_on_trade_close()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status != 'closed' OR OLD.status = 'closed' THEN
        RETURN NEW;
    END IF;

    IF NEW.bankroll_id IS NULL OR NEW.net_pnl IS NULL THEN
        RETURN NEW;
    END IF;

    -- Update bankroll balance
    UPDATE bankrolls
    SET current_balance = current_balance + NEW.net_pnl,
        peak_balance = GREATEST(peak_balance, current_balance + NEW.net_pnl)
    WHERE id = NEW.bankroll_id;

    -- Update allocation value
    IF NEW.allocation_id IS NOT NULL THEN
        UPDATE bankroll_allocations
        SET current_value = current_value + NEW.net_pnl,
            high_water_mark = GREATEST(high_water_mark, current_value + NEW.net_pnl)
        WHERE id = NEW.allocation_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bankroll_update
    AFTER UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION update_bankroll_on_trade_close();

COMMENT ON FUNCTION update_bankroll_on_trade_close IS 'Synchronizes bankroll balance with trade P&L on close. Updates peak for drawdown tracking.';

-- ===== END: 005_supabase_functions.sql =====
