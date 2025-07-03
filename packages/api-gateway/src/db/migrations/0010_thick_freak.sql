-- Additional enhancements for vector embedding features (ADR-025)
-- Note: vector_costs table is already created by Drizzle migration

-- Create daily aggregation materialized view for cost analysis
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_vector_costs AS
SELECT 
    DATE(created_at) as date,
    model,
    COUNT(*) as request_count,
    SUM(input_tokens) as total_input_tokens,
    SUM(chunks_generated) as total_chunks,
    SUM(total_cost) as total_cost_usd,
    AVG(total_cost) as avg_cost_per_request,
    AVG(input_tokens) as avg_input_tokens,
    AVG(chunks_generated) as avg_chunks_per_request,
    AVG(cost_per_token) as avg_cost_per_token,
    MIN(created_at) as first_request_at,
    MAX(created_at) as last_request_at
FROM vector_costs
GROUP BY DATE(created_at), model
ORDER BY date DESC, model;

-- Create index on the materialized view for faster queries
CREATE INDEX idx_daily_vector_costs_date ON daily_vector_costs(date);

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_daily_vector_costs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_vector_costs;
END;
$$;

-- Grant execute permission on the refresh function (adjust role as needed)
-- GRANT EXECUTE ON FUNCTION refresh_daily_vector_costs() TO your_app_role;

-- Create hourly budget view for real-time budget monitoring
CREATE VIEW hourly_vector_costs AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    model,
    COUNT(*) as request_count,
    SUM(input_tokens) as total_input_tokens,
    SUM(chunks_generated) as total_chunks,
    SUM(total_cost) as total_cost_usd,
    AVG(total_cost) as avg_cost_per_request
FROM vector_costs
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), model
ORDER BY hour DESC, model;

-- Create current budget status view
CREATE VIEW vector_budget_status AS
WITH hourly_usage AS (
    SELECT 
        COALESCE(SUM(total_cost), 0) as hourly_cost,
        COUNT(*) as hourly_requests
    FROM vector_costs
    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
),
daily_usage AS (
    SELECT 
        COALESCE(SUM(total_cost), 0) as daily_cost,
        COUNT(*) as daily_requests
    FROM vector_costs
    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
)
SELECT 
    hourly_usage.hourly_cost,
    hourly_usage.hourly_requests,
    daily_usage.daily_cost,
    daily_usage.daily_requests,
    -- These would be set from environment variables in the application
    -- Using defaults here for the view
    1.00 as hourly_limit,
    10.00 as daily_limit,
    CASE 
        WHEN hourly_usage.hourly_cost >= 1.00 THEN 'EXCEEDED'
        WHEN hourly_usage.hourly_cost >= 0.80 THEN 'WARNING'
        ELSE 'OK'
    END as hourly_status,
    CASE 
        WHEN daily_usage.daily_cost >= 10.00 THEN 'EXCEEDED'
        WHEN daily_usage.daily_cost >= 8.00 THEN 'WARNING'
        ELSE 'OK'
    END as daily_status
FROM hourly_usage, daily_usage;

-- Add comment for documentation
COMMENT ON TABLE vector_costs IS 'Tracks costs for vector embedding generation via OpenAI API';
COMMENT ON COLUMN vector_costs.model IS 'OpenAI embedding model used (e.g., text-embedding-3-small, text-embedding-3-large)';
COMMENT ON COLUMN vector_costs.input_tokens IS 'Number of tokens processed for embedding generation';
COMMENT ON COLUMN vector_costs.chunks_generated IS 'Number of embedding chunks created from the input';
COMMENT ON COLUMN vector_costs.total_cost IS 'Total cost in USD for this embedding operation';
COMMENT ON COLUMN vector_costs.cost_per_token IS 'Cost per token in USD for this model';

-- Add pgvector extension if not already added
CREATE EXTENSION IF NOT EXISTS vector;

-- Add IVFFlat index on embeddings table for faster similarity search if not exists
-- This is more efficient than the default index for large datasets
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'embeddings' 
        AND indexname = 'embeddings_embedding_ivfflat_idx'
    ) THEN
        CREATE INDEX embeddings_embedding_ivfflat_idx ON embeddings 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 10);
    END IF;
END $$;

-- Also create the transcription_costs table and views if they don't exist
-- (since the manual migration was backed up)
CREATE TABLE IF NOT EXISTS transcription_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID REFERENCES shares(id) ON DELETE SET NULL,
    model_name VARCHAR(50) NOT NULL DEFAULT 'whisper-1',
    provider VARCHAR(20) NOT NULL DEFAULT 'openai',
    audio_duration_seconds NUMERIC(10,2) NOT NULL,
    processing_time_ms INTEGER,
    cost_per_minute NUMERIC(10,6) NOT NULL DEFAULT 0.006,
    total_cost NUMERIC(10,6) GENERATED ALWAYS AS (audio_duration_seconds / 60.0 * cost_per_minute) STORED,
    is_silence BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT chk_audio_duration_positive CHECK (audio_duration_seconds >= 0),
    CONSTRAINT chk_cost_per_minute_positive CHECK (cost_per_minute >= 0),
    CONSTRAINT chk_provider CHECK (provider IN ('openai', 'local'))
);

-- Indexes for transcription_costs
CREATE INDEX IF NOT EXISTS idx_transcription_costs_created_at ON transcription_costs(created_at);
CREATE INDEX IF NOT EXISTS idx_transcription_costs_share_id ON transcription_costs(share_id);
CREATE INDEX IF NOT EXISTS idx_transcription_costs_provider ON transcription_costs(provider);

-- Daily transcription costs view
CREATE MATERIALIZED VIEW IF NOT EXISTS transcription_cost_analytics AS
SELECT 
    DATE(created_at) as date,
    provider,
    COUNT(*) as transcription_count,
    COUNT(DISTINCT share_id) as unique_shares,
    SUM(audio_duration_seconds) as total_audio_seconds,
    SUM(audio_duration_seconds) / 60.0 as total_audio_minutes,
    AVG(audio_duration_seconds) as avg_duration_seconds,
    SUM(total_cost) as total_cost_usd,
    AVG(total_cost) as avg_cost_per_transcription,
    SUM(CASE WHEN is_silence THEN 1 ELSE 0 END) as silence_count,
    AVG(processing_time_ms) as avg_processing_time_ms
FROM transcription_costs
GROUP BY DATE(created_at), provider
ORDER BY date DESC, provider;

-- Index for the materialized view
CREATE INDEX IF NOT EXISTS idx_transcription_analytics_date ON transcription_cost_analytics(date);

-- Function to refresh transcription analytics
CREATE OR REPLACE FUNCTION refresh_transcription_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY transcription_cost_analytics;
END;
$$;