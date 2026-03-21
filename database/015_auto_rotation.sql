-- ============================================================================
-- ELIO.MARKET — 015: AUTO-ROTATION FOR CIRCUIT-BROKEN SESSIONS
-- ============================================================================
-- Adds cooldown and auto-rotation tracking to both paper_sessions (Polymarket)
-- and crypto_paper_sessions (Crypto).
-- When a session enters circuit breaker, a cooldown period is set.
-- After cooldown expires, the session is closed and a new one is created.
-- ============================================================================

-- --------------------------------------------------------------------------
-- paper_sessions (Polymarket)
-- --------------------------------------------------------------------------
ALTER TABLE paper_sessions
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_rotation_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_auto_rotations INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS parent_session_id UUID REFERENCES paper_sessions(id);

-- --------------------------------------------------------------------------
-- crypto_paper_sessions (Crypto)
-- --------------------------------------------------------------------------
ALTER TABLE crypto_paper_sessions
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_rotation_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_auto_rotations INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS parent_session_id UUID REFERENCES crypto_paper_sessions(id);

-- Indexes for efficient cooldown queries
CREATE INDEX IF NOT EXISTS idx_paper_sessions_cooldown
  ON paper_sessions(cooldown_until)
  WHERE is_circuit_broken = TRUE AND cooldown_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crypto_paper_sessions_cooldown
  ON crypto_paper_sessions(cooldown_until)
  WHERE is_circuit_broken = TRUE AND cooldown_until IS NOT NULL;
