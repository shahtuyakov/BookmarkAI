-- Create llm_costs table for tracking LLM API usage and costs (ADR-025)
CREATE TABLE IF NOT EXISTS llm_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID REFERENCES shares(id) ON DELETE SET NULL,
    model_name VARCHAR(50) NOT NULL,
    provider VARCHAR(20) NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
    input_cost_usd DECIMAL(10,6) NOT NULL,
    output_cost_usd DECIMAL(10,6) NOT NULL,
    total_cost_usd DECIMAL(10,6) GENERATED ALWAYS AS (input_cost_usd + output_cost_usd) STORED,
    backend VARCHAR(20) NOT NULL DEFAULT 'api',
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Check constraints
    CONSTRAINT chk_input_tokens_positive CHECK (input_tokens > 0),
    CONSTRAINT chk_output_tokens_positive CHECK (output_tokens >= 0),
    CONSTRAINT chk_input_cost_positive CHECK (input_cost_usd >= 0),
    CONSTRAINT chk_output_cost_positive CHECK (output_cost_usd >= 0),
    CONSTRAINT chk_backend_valid CHECK (backend IN ('api', 'local')),
    CONSTRAINT chk_provider_valid CHECK (provider IN ('openai', 'anthropic', 'local'))
);

-- Create indexes for analytics queries
CREATE INDEX idx_llm_costs_created_at ON llm_costs(created_at);
CREATE INDEX idx_llm_costs_model_name ON llm_costs(model_name);
CREATE INDEX idx_llm_costs_provider ON llm_costs(provider);
CREATE INDEX idx_llm_costs_backend ON llm_costs(backend);
CREATE INDEX idx_llm_costs_share_id ON llm_costs(share_id);

-- Create daily aggregation materialized view for cost analysis
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_llm_costs AS
SELECT 
    DATE(created_at) as date,
    provider,
    model_name,
    backend,
    COUNT(*) as request_count,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(total_tokens) as total_tokens,
    SUM(input_cost_usd) as total_input_cost_usd,
    SUM(output_cost_usd) as total_output_cost_usd,
    SUM(total_cost_usd) as total_cost_usd,
    AVG(total_cost_usd) as avg_cost_per_request,
    AVG(input_tokens) as avg_input_tokens,
    AVG(output_tokens) as avg_output_tokens,
    AVG(processing_time_ms) as avg_processing_time_ms
FROM llm_costs
GROUP BY DATE(created_at), provider, model_name, backend
ORDER BY date DESC, provider, model_name;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_daily_llm_costs_unique 
ON daily_llm_costs (date, provider, model_name, backend);

-- Create hourly aggregation view for budget monitoring
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_llm_costs AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    provider,
    COUNT(*) as request_count,
    SUM(total_tokens) as total_tokens,
    SUM(total_cost_usd) as total_cost_usd
FROM llm_costs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), provider
ORDER BY hour DESC;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_hourly_llm_costs_unique 
ON hourly_llm_costs (hour, provider);

-- Add comments
COMMENT ON TABLE llm_costs IS 'Tracks individual LLM API costs for usage analysis and budget management';
COMMENT ON COLUMN llm_costs.share_id IS 'Reference to the share being summarized (nullable for orphaned records)';
COMMENT ON COLUMN llm_costs.model_name IS 'Model used (e.g., gpt-3.5-turbo, gpt-4, claude-3-opus)';
COMMENT ON COLUMN llm_costs.provider IS 'API provider: openai, anthropic, or local';
COMMENT ON COLUMN llm_costs.input_tokens IS 'Number of tokens in the input/prompt';
COMMENT ON COLUMN llm_costs.output_tokens IS 'Number of tokens in the output/completion';
COMMENT ON COLUMN llm_costs.total_tokens IS 'Generated column: input_tokens + output_tokens';
COMMENT ON COLUMN llm_costs.input_cost_usd IS 'Cost for input tokens in USD';
COMMENT ON COLUMN llm_costs.output_cost_usd IS 'Cost for output/completion tokens in USD';
COMMENT ON COLUMN llm_costs.total_cost_usd IS 'Generated column: total cost in USD';
COMMENT ON COLUMN llm_costs.backend IS 'Backend used: api (cloud provider) or local (self-hosted)';
COMMENT ON COLUMN llm_costs.processing_time_ms IS 'Time taken to process the request in milliseconds';

COMMENT ON MATERIALIZED VIEW daily_llm_costs IS 'Daily aggregation of LLM costs for monitoring and analysis';
COMMENT ON MATERIALIZED VIEW hourly_llm_costs IS 'Hourly aggregation for real-time budget monitoring (last 24 hours)';

-- Function to refresh the materialized views
CREATE OR REPLACE FUNCTION refresh_llm_cost_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_llm_costs;
    REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_llm_costs;
END;
$$ LANGUAGE plpgsql;

-- Create function to get current budget usage
CREATE OR REPLACE FUNCTION get_llm_budget_usage(
    p_hours INTEGER DEFAULT 1
)
RETURNS TABLE (
    provider VARCHAR,
    total_cost_usd DECIMAL,
    request_count BIGINT,
    total_tokens BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.provider,
        COALESCE(SUM(l.total_cost_usd), 0)::DECIMAL as total_cost_usd,
        COUNT(*)::BIGINT as request_count,
        COALESCE(SUM(l.total_tokens), 0)::BIGINT as total_tokens
    FROM llm_costs l
    WHERE l.created_at >= NOW() - INTERVAL '1 hour' * p_hours
    GROUP BY l.provider;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_llm_cost_views() IS 'Refreshes both daily and hourly LLM cost aggregation views';
COMMENT ON FUNCTION get_llm_budget_usage(INTEGER) IS 'Returns LLM budget usage for the specified number of hours (default: 1)';