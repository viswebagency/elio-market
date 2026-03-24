-- ============================================================================
-- Live Safety State — persists kill switch + circuit breaker across cold starts
-- ============================================================================
-- On Vercel, each cron invocation may be a cold start. Without persistence,
-- a tripped kill switch or circuit breaker would reset and allow trading to
-- resume unsafely. This table stores exactly one row per safety component.

CREATE TABLE IF NOT EXISTS live_safety_state (
    id TEXT PRIMARY KEY,  -- 'kill_switch' or 'circuit_breaker'
    active BOOLEAN NOT NULL DEFAULT FALSE,
    activated_at TIMESTAMPTZ,
    activated_by TEXT,
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the two rows
INSERT INTO live_safety_state (id, active) VALUES
    ('kill_switch', FALSE),
    ('circuit_breaker', FALSE)
ON CONFLICT (id) DO NOTHING;
