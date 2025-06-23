-- Create ml_results table for storing ML task outputs
CREATE TABLE IF NOT EXISTS ml_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    result_data JSONB NOT NULL,
    model_version VARCHAR(100),
    processing_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_ml_results_share_id ON ml_results(share_id);
CREATE INDEX idx_ml_results_task_type ON ml_results(task_type);
CREATE INDEX idx_ml_results_created_at ON ml_results(created_at);

-- Create unique constraint to prevent duplicate processing
CREATE UNIQUE INDEX idx_ml_results_share_task ON ml_results(share_id, task_type);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ml_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ml_results_updated_at_trigger
    BEFORE UPDATE ON ml_results
    FOR EACH ROW
    EXECUTE FUNCTION update_ml_results_updated_at();