-- ============================================================================
-- ELIO.MARKET — 008: KNOWLEDGE BASE AI
-- ============================================================================
-- Shared AI Knowledge Base: caches AI analyses to avoid duplicate calls.
-- Three cache levels: L1 (exact), L2 (delta), L3 (template).
-- Depends on: 002_supabase_tables.sql
-- ============================================================================

-- ============================================================================
-- 1. KB MARKET PROFILES — Static profiles per market/asset
-- ============================================================================

CREATE TABLE kb_market_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Market identification
    market_id TEXT NOT NULL,
    area TEXT NOT NULL CHECK (area IN ('prediction', 'exchange_betting', 'stocks', 'forex', 'crypto')),

    -- Profile data
    profile_data JSONB NOT NULL DEFAULT '{}',
    summary TEXT,

    -- Price tracking for invalidation
    last_known_price DECIMAL(20,8),
    price_at_generation DECIMAL(20,8),

    -- Versioning
    version INT NOT NULL DEFAULT 1,

    -- Timestamps
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(market_id, area)
);

COMMENT ON TABLE kb_market_profiles IS 'Cached market/asset profiles. Updated daily or on significant price change.';

CREATE TRIGGER trg_kb_market_profiles_updated_at BEFORE UPDATE ON kb_market_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 2. KB ANALYSES — AI-generated analyses (cached)
-- ============================================================================

CREATE TABLE kb_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Market reference
    market_id TEXT NOT NULL,
    area TEXT NOT NULL CHECK (area IN ('prediction', 'exchange_betting', 'stocks', 'forex', 'crypto')),

    -- Analysis type
    analysis_type TEXT NOT NULL CHECK (analysis_type IN (
        'market_overview',
        'entry_analysis',
        'exit_analysis',
        'risk_assessment'
    )),

    -- Content
    content TEXT NOT NULL,
    structured_data JSONB NOT NULL DEFAULT '{}',
    confidence DECIMAL(5,2) NOT NULL DEFAULT 0,
    data_points_used JSONB NOT NULL DEFAULT '[]',

    -- Source tracking
    cache_level TEXT NOT NULL DEFAULT 'fresh' CHECK (cache_level IN ('fresh', 'l1_exact', 'l2_delta', 'l3_template')),
    source_analysis_id UUID REFERENCES kb_analyses(id) ON DELETE SET NULL,

    -- Price at generation (for invalidation)
    price_at_generation DECIMAL(20,8),

    -- Cost tracking
    estimated_cost_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
    tokens_used INT NOT NULL DEFAULT 0,

    -- Versioning and expiry
    version INT NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE kb_analyses IS 'AI-generated analyses cached with multi-level invalidation.';

CREATE TRIGGER trg_kb_analyses_updated_at BEFORE UPDATE ON kb_analyses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 3. KB ANALYSIS REQUESTS — Request log for cache hit/miss metrics
-- ============================================================================

CREATE TABLE kb_analysis_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Who requested
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

    -- What was requested
    market_id TEXT NOT NULL,
    area TEXT NOT NULL CHECK (area IN ('prediction', 'exchange_betting', 'stocks', 'forex', 'crypto')),
    analysis_type TEXT NOT NULL CHECK (analysis_type IN (
        'market_overview',
        'entry_analysis',
        'exit_analysis',
        'risk_assessment'
    )),

    -- Result
    cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
    cache_level TEXT CHECK (cache_level IN ('l1_exact', 'l2_delta', 'l3_template', 'miss')),
    analysis_id UUID REFERENCES kb_analyses(id) ON DELETE SET NULL,

    -- Cost
    estimated_cost_saved_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
    response_time_ms INT,

    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE kb_analysis_requests IS 'Log of all KB analysis requests for cache hit/miss metrics.';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Market profiles
CREATE INDEX idx_kb_market_profiles_market ON kb_market_profiles(market_id);
CREATE INDEX idx_kb_market_profiles_area ON kb_market_profiles(area);
CREATE INDEX idx_kb_market_profiles_expires ON kb_market_profiles(expires_at);

-- Analyses
CREATE INDEX idx_kb_analyses_market ON kb_analyses(market_id);
CREATE INDEX idx_kb_analyses_area ON kb_analyses(area);
CREATE INDEX idx_kb_analyses_type ON kb_analyses(analysis_type);
CREATE INDEX idx_kb_analyses_market_type ON kb_analyses(market_id, analysis_type);
CREATE INDEX idx_kb_analyses_expires ON kb_analyses(expires_at);
CREATE INDEX idx_kb_analyses_cache_level ON kb_analyses(cache_level);
CREATE INDEX idx_kb_analyses_created ON kb_analyses(created_at DESC);

-- Requests
CREATE INDEX idx_kb_requests_user ON kb_analysis_requests(user_id);
CREATE INDEX idx_kb_requests_market ON kb_analysis_requests(market_id);
CREATE INDEX idx_kb_requests_cache_hit ON kb_analysis_requests(cache_hit);
CREATE INDEX idx_kb_requests_requested ON kb_analysis_requests(requested_at DESC);
