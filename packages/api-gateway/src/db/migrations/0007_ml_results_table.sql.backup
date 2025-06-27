-- Create ml_results table for storing ML processing results (ADR-025)
CREATE TABLE IF NOT EXISTS ml_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    result_data JSONB NOT NULL,
    model_version VARCHAR(100),
    processing_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Ensure unique constraint for deduplication
    CONSTRAINT uq_share_task UNIQUE (share_id, task_type)
);

-- Create indexes for performance
CREATE INDEX idx_ml_results_share_id ON ml_results(share_id);
CREATE INDEX idx_ml_results_task_type ON ml_results(task_type);
CREATE INDEX idx_ml_results_created_at ON ml_results(created_at);

-- Add comment explaining the table
COMMENT ON TABLE ml_results IS 'Stores results from ML processing tasks (transcription, summarization, embeddings) as per ADR-025';
COMMENT ON COLUMN ml_results.task_type IS 'Type of ML task: transcribe_whisper, summarize_llm, embed_vectors';
COMMENT ON COLUMN ml_results.result_data IS 'JSON containing task-specific results (summary text, transcripts, embeddings, etc.)';
COMMENT ON COLUMN ml_results.model_version IS 'Version/name of the ML model used for processing';
COMMENT ON COLUMN ml_results.processing_ms IS 'Time taken to process the task in milliseconds';