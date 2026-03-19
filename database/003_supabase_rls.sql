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
