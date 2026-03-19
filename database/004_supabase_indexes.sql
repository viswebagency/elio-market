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
