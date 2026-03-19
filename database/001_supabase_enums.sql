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
