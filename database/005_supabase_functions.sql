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
