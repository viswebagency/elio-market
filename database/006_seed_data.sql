-- ============================================================================
-- ELIO.MARKET — 006: SEED DATA
-- ============================================================================
-- Initial data: platform config, Italy regulations update, reference strategy.
-- Depends on: 002_supabase_tables.sql (tables + Italy initial data)
-- ============================================================================

-- ============================================================================
-- 1. PLATFORM CONFIGURATION TABLE + SEED
-- ============================================================================
-- Tabella chiave-valore per configurazione piattaforma.
-- Non esisteva nello schema originale, la creiamo qui.

CREATE TABLE IF NOT EXISTS platform_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE platform_config IS 'Platform-wide configuration. Key-value store for defaults, thresholds, budgets.';

-- Trigger updated_at
CREATE TRIGGER trg_platform_config_updated_at BEFORE UPDATE ON platform_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 1a. Livelli di rischio (FILE_SACRO section 6.7)
-- ---------------------------------------------------------------------------
INSERT INTO platform_config (key, value, description) VALUES
('risk_levels', '{
    "conservative": {
        "min_ev_pct": 5.0,
        "min_probability_pct": 60.0,
        "description": "Solo opportunita ad alto valore atteso e alta probabilita"
    },
    "moderate": {
        "min_ev_pct": 3.0,
        "min_probability_pct": 45.0,
        "description": "Equilibrio tra frequenza e qualita dei segnali"
    },
    "aggressive": {
        "min_ev_pct": 1.0,
        "min_probability_pct": null,
        "description": "Qualsiasi edge positivo, anche piccolo"
    }
}'::JSONB, 'Default risk level thresholds: EV minimo e probabilita minima per livello (FILE_SACRO 6.7)');

-- ---------------------------------------------------------------------------
-- 1b. Circuit breaker (FILE_SACRO section 6.1, 6.3)
-- ---------------------------------------------------------------------------
INSERT INTO platform_config (key, value, description) VALUES
('circuit_breakers', '{
    "per_strategy": {
        "max_drawdown_pct": 20,
        "description": "Regola 1: -20% drawdown per strategia -> pausa automatica"
    },
    "per_area": {
        "max_drawdown_pct": 25,
        "description": "Regola 2: -25% drawdown per area -> pausa area"
    },
    "global": {
        "max_drawdown_pct": 30,
        "description": "Regola 3: -30% drawdown globale -> TUTTO in pausa"
    }
}'::JSONB, 'Circuit breaker defaults: drawdown limits per strategia, area e globale (FILE_SACRO 6.1)');

-- ---------------------------------------------------------------------------
-- 1c. Allocation limits (FILE_SACRO section 6.1 regola 4)
-- ---------------------------------------------------------------------------
INSERT INTO platform_config (key, value, description) VALUES
('allocation_limits', '{
    "max_per_strategy_pct": 10,
    "description": "Regola 4: nessuna strategia riceve piu del 10% del bankroll area"
}'::JSONB, 'Max allocation per strategy as % of area bankroll (FILE_SACRO 6.1 rule 4)');

-- ---------------------------------------------------------------------------
-- 1d. Budget AI giornaliero (FILE_SACRO section 8)
-- ---------------------------------------------------------------------------
INSERT INTO platform_config (key, value, description) VALUES
('ai_budget', '{
    "daily_budget_eur": 5.00,
    "currency": "EUR",
    "models": {
        "analysis": "opus",
        "quick": "haiku",
        "default": "sonnet"
    },
    "description": "Budget massimo giornaliero per chiamate AI"
}'::JSONB, 'Daily AI budget and model preferences (FILE_SACRO section 8)');

-- ---------------------------------------------------------------------------
-- 1e. Paper trading defaults (FILE_SACRO section 5.2, 6.8)
-- ---------------------------------------------------------------------------
INSERT INTO platform_config (key, value, description) VALUES
('paper_trading', '{
    "default_balance_eur": 1000,
    "min_profitable_days_for_promotion": 30,
    "default_slippage_pct": 1.5,
    "description": "Paper trading: 1000 EUR default, 30 giorni profittevoli per promozione a live"
}'::JSONB, 'Paper trading defaults: initial balance and promotion requirements (FILE_SACRO 5.2, 6.8)');

-- ============================================================================
-- 2. ITALY REGULATIONS — UPDATE con dettagli completi
-- ============================================================================
-- Il record base e gia inserito in 002_supabase_tables.sql.
-- Aggiorniamo con i dettagli normativi piu specifici.

UPDATE country_regulations
SET tax_rules = '{
    "stocks": {
        "rate": 26,
        "type": "capital_gain",
        "regime": "dichiarativo o amministrato",
        "note": "26% su plusvalenze. Regime dichiarativo (DeGiro) o amministrato (banche italiane). Minusvalenze compensabili entro 4 anni."
    },
    "forex": {
        "rate": 26,
        "type": "capital_gain",
        "note": "26% su plusvalenze da contratti derivati su valute. Redditi diversi art. 67 TUIR."
    },
    "crypto": {
        "rate": 33,
        "type": "capital_gain",
        "threshold_eur": 2000,
        "note": "Dal 2026: 33% su plusvalenze superiori a 2.000 EUR/anno (L. 207/2024). Nessuna esenzione sotto soglia dal 2026. Obbligo monitoraggio quadro RW.",
        "normativa": "L. 207/2024 art. 1 comma 24-29, in vigore dal 01/01/2026"
    },
    "polymarket": {
        "rate": 26,
        "type": "redditi_diversi",
        "note": "Zona grigia: piattaforma crypto-based non regolamentata in Italia. Trattamento fiscale come redditi diversi, 26% su plusvalenze. Rischio riclassificazione come crypto (33%)."
    },
    "betfair": {
        "rate": 0,
        "type": "esente_adm",
        "note_adm": "Betfair Exchange e regolamentato ADM in Italia (licenza GAD 15211). Vincite da bookmaker ADM sono ESENTI da tassazione (art. 69 TUIR).",
        "note_non_adm": "Se il bookmaker NON e ADM: redditi diversi, tassazione ordinaria.",
        "adm_license": "GAD 15211"
    }
}'::JSONB,
disclaimers = '{
    "general": "Elio.Market non fornisce consulenza finanziaria personalizzata ai sensi del TUF (D.Lgs. 58/1998)",
    "past_performance": "Le performance passate non garantiscono risultati futuri",
    "capital_risk": "Il capitale investito puo essere perso totalmente",
    "responsibility": "L utente e il solo responsabile delle proprie decisioni di investimento e trading",
    "gambling": "Elio.Market non e un operatore di gioco e non gestisce scommesse. Il gioco d azzardo puo causare dipendenza.",
    "compliance": "L utente e responsabile della conformita alle normative del proprio paese di residenza",
    "crypto_2026": "Dal 2026 la tassazione su plusvalenze crypto in Italia e del 33% (L. 207/2024)",
    "tax_disclaimer": "Le informazioni fiscali sono indicative. Consultare un commercialista per la propria situazione specifica."
}'::JSONB,
updated_at = NOW()
WHERE country_code = 'IT';

-- ============================================================================
-- 3. SYSTEM USER + STRATEGIA DI RIFERIMENTO PM-001
-- ============================================================================
-- Creiamo un utente di sistema per le strategie template/riferimento.
-- Usiamo un UUID deterministico per poterlo referenziare.

-- 3a. Utente di sistema in auth.users (necessario per FK)
-- NOTA: su Supabase, auth.users e gestito dal sistema auth.
-- Usiamo un INSERT diretto con UUID fisso per il seed.
INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    role,
    aud,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'system@elio.market',
    '$2a$10$systemusernotloginablex',
    NOW(),
    'authenticated',
    'authenticated',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- 3b. Profilo di sistema
INSERT INTO profiles (
    id,
    display_name,
    country_code,
    timezone,
    locale,
    subscription_tier,
    questionnaire_completed,
    risk_understanding,
    expertise_level,
    active_areas
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Sistema Elio.Market',
    'IT',
    'Europe/Rome',
    'it',
    'elite',
    TRUE,
    TRUE,
    'expert',
    '{polymarket,betfair,stocks,forex,crypto}'
) ON CONFLICT (id) DO NOTHING;

-- 3c. Strategia di riferimento PM-001 "Compra la Paura, Vendi lo Spike"
INSERT INTO strategies (
    id,
    user_id,
    code,
    version,
    name,
    description,
    area,
    creation_mode,
    automation_level,
    status,
    risk_level,
    min_ev,
    min_probability,
    sizing_method,
    rules,
    rules_readable,
    max_drawdown,
    max_allocation_pct,
    circuit_breaker_loss_pct,
    circuit_breaker_days,
    max_consecutive_losses,
    tags,
    is_active
) VALUES (
    '00000000-0000-0000-0000-0000000a0001',
    '00000000-0000-0000-0000-000000000001',
    'PM-001',
    1,
    'Compra la Paura, Vendi lo Spike',
    'Swing trading su quote Polymarket. Compra contratti sottovalutati dal mercato (panico/disinteresse) con catalizzatore imminente, vendi sullo spike di attenzione. Bankroll tiering: 50% Tier1 (alta fiducia), 30% Tier2 (media), 20% Tier3 (speculativo). Mantenere sempre 20% liquidita.',
    'polymarket',
    'manual',
    'copilot',
    'observation',
    'aggressive',
    1.00,
    NULL,
    'fixed_percentage',
    '{
        "entry_rules": [
            {
                "id": "price_range",
                "condition": "QUANDO prezzo >= $0.05 E prezzo <= $0.45",
                "description": "Prezzo nel range di sottovalutazione",
                "params": {"min_price": 0.05, "max_price": 0.45}
            },
            {
                "id": "volume_min",
                "condition": "E volume_totale > $100.000",
                "description": "Volume sufficiente per liquidita",
                "params": {"min_volume_usd": 100000}
            },
            {
                "id": "expiry_window",
                "condition": "E scadenza < 30 giorni",
                "description": "Scadenza vicina per catalizzatore temporale",
                "params": {"max_days_to_expiry": 30}
            },
            {
                "id": "catalyst",
                "condition": "E catalizzatore_imminente = TRUE",
                "description": "Evento imminente che puo muovere il prezzo (elezione, voto, decisione, earnings)",
                "params": {"requires_catalyst": true}
            }
        ],
        "exit_rules": [
            {
                "id": "tp_1_third",
                "condition": "ESCI_SE profitto >= +50%",
                "action": "ALLORA vendi 1/3 posizione",
                "description": "Primo take profit: vendi un terzo",
                "params": {"profit_pct": 50, "sell_fraction": 0.333}
            },
            {
                "id": "tp_half",
                "condition": "ESCI_SE profitto >= +100%",
                "action": "ALLORA vendi 1/2 posizione rimanente",
                "description": "Secondo take profit: vendi meta del rimanente",
                "params": {"profit_pct": 100, "sell_fraction": 0.5}
            },
            {
                "id": "tp_full",
                "condition": "ESCI_SE profitto >= +200%",
                "action": "ALLORA vendi tutto tranne lottery ticket",
                "description": "Terzo take profit: esci quasi completamente, tieni un frammento speculativo",
                "params": {"profit_pct": 200, "sell_fraction": 0.95}
            },
            {
                "id": "stop_loss",
                "condition": "ESCI_SE perdita >= -30%",
                "action": "ALLORA vendi tutto",
                "description": "Stop loss rigido al -30%",
                "params": {"loss_pct": -30, "sell_fraction": 1.0}
            }
        ],
        "bankroll_tiers": {
            "tier1": {"allocation_pct": 50, "description": "Alta fiducia: segnale forte + catalizzatore chiaro"},
            "tier2": {"allocation_pct": 30, "description": "Media fiducia: segnale discreto, catalizzatore incerto"},
            "tier3": {"allocation_pct": 20, "description": "Speculativo: scommessa asimmetrica, bassa probabilita alto payoff"}
        },
        "liquidity_reserve_pct": 20,
        "circuit_breaker_total": {
            "loss_pct": 50,
            "action": "Pausa totale strategia",
            "description": "Se il bankroll totale scende del 50%, la strategia va in pausa automatica"
        }
    }'::JSONB,
    E'QUANDO: prezzo $0.05-$0.45 E volume > $100K E scadenza < 30gg E catalizzatore imminente\nALLORA: compra (sizing per tier)\nESCI_SE: +50% vendi 1/3 | +100% vendi 1/2 | +200% vendi tutto tranne lottery | -30% stop loss\nBANKROLL: 50% Tier1, 30% Tier2, 20% Tier3, 20% liquidita\nCIRCUIT BREAKER: -50% bankroll totale = pausa',
    50.00,
    10.00,
    50.00,
    30,
    5,
    '{swing_trading,polymarket,contrarian,catalyst_driven,fear_buying}',
    TRUE
) ON CONFLICT (user_id, code, version) DO NOTHING;

-- 3d. Parametri strategia PM-001
INSERT INTO strategy_parameters (strategy_id, param_name, param_value, param_min, param_max, param_type, description, is_optimizable) VALUES
('00000000-0000-0000-0000-0000000a0001', 'entry_min_price', 0.05, 0.03, 0.08, 'numeric', 'Prezzo minimo di ingresso ($)', TRUE),
('00000000-0000-0000-0000-0000000a0001', 'entry_max_price', 0.45, 0.35, 0.55, 'numeric', 'Prezzo massimo di ingresso ($)', TRUE),
('00000000-0000-0000-0000-0000000a0001', 'min_volume_usd', 100000, 50000, 200000, 'numeric', 'Volume minimo mercato ($)', TRUE),
('00000000-0000-0000-0000-0000000a0001', 'max_days_to_expiry', 30, 14, 45, 'integer', 'Giorni massimi alla scadenza', TRUE),
('00000000-0000-0000-0000-0000000a0001', 'tp1_profit_pct', 50, 30, 70, 'numeric', 'Take profit 1: +X% vendi 1/3', TRUE),
('00000000-0000-0000-0000-0000000a0001', 'tp2_profit_pct', 100, 80, 150, 'numeric', 'Take profit 2: +X% vendi 1/2', TRUE),
('00000000-0000-0000-0000-0000000a0001', 'tp3_profit_pct', 200, 150, 300, 'numeric', 'Take profit 3: +X% vendi tutto', TRUE),
('00000000-0000-0000-0000-0000000a0001', 'stop_loss_pct', -30, -40, -20, 'numeric', 'Stop loss: -X%', TRUE),
('00000000-0000-0000-0000-0000000a0001', 'liquidity_reserve_pct', 20, 10, 30, 'numeric', 'Percentuale bankroll da tenere liquida', TRUE),
('00000000-0000-0000-0000-0000000a0001', 'circuit_breaker_pct', -50, -60, -40, 'numeric', 'Circuit breaker: -X% bankroll totale', TRUE)
ON CONFLICT (strategy_id, param_name) DO NOTHING;
