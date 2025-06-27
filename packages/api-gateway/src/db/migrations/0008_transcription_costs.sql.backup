-- Create transcription_costs table for tracking Whisper API usage and costs (ADR-025)
CREATE TABLE IF NOT EXISTS transcription_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID REFERENCES shares(id) ON DELETE SET NULL,
    audio_duration_seconds DECIMAL(10,2) NOT NULL,
    billing_usd DECIMAL(10,6) NOT NULL,
    backend VARCHAR(20) NOT NULL DEFAULT 'api',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Check constraints
    CONSTRAINT chk_duration_positive CHECK (audio_duration_seconds > 0),
    CONSTRAINT chk_billing_positive CHECK (billing_usd >= 0),
    CONSTRAINT chk_backend_valid CHECK (backend IN ('api', 'local'))
);

-- Create indexes for analytics queries
CREATE INDEX idx_transcription_costs_created_at ON transcription_costs(created_at);
CREATE INDEX idx_transcription_costs_backend ON transcription_costs(backend);
CREATE INDEX idx_transcription_costs_share_id ON transcription_costs(share_id);

-- Create daily aggregation materialized view for cost analysis
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_transcription_costs AS
SELECT 
    DATE(created_at) as date,
    backend,
    COUNT(*) as transcription_count,
    SUM(audio_duration_seconds) as total_seconds,
    SUM(audio_duration_seconds) / 3600 as total_hours,
    SUM(billing_usd) as total_cost_usd,
    AVG(billing_usd) as avg_cost_per_transcription,
    AVG(audio_duration_seconds) as avg_duration_seconds
FROM transcription_costs
GROUP BY DATE(created_at), backend
ORDER BY date DESC, backend;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_daily_transcription_costs_unique 
ON daily_transcription_costs (date, backend);

-- Add comments
COMMENT ON TABLE transcription_costs IS 'Tracks individual transcription costs for Whisper API usage analysis and GPU break-even calculations';
COMMENT ON COLUMN transcription_costs.share_id IS 'Reference to the share being transcribed (nullable for orphaned records)';
COMMENT ON COLUMN transcription_costs.audio_duration_seconds IS 'Duration of audio transcribed in seconds';
COMMENT ON COLUMN transcription_costs.billing_usd IS 'Cost in USD for this transcription';
COMMENT ON COLUMN transcription_costs.backend IS 'Backend used: api (OpenAI Whisper) or local (GPU)';

COMMENT ON MATERIALIZED VIEW daily_transcription_costs IS 'Daily aggregation of transcription costs for monitoring and break-even analysis';

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_daily_transcription_costs()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_transcription_costs;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger-based refresh (optional - can be called manually or via cron)
COMMENT ON FUNCTION refresh_daily_transcription_costs() IS 'Refreshes the daily cost aggregation view. Can be called manually or scheduled.';