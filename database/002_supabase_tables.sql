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
