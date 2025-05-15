-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a sample table with vector support
CREATE TABLE IF NOT EXISTS test_embeddings (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536) -- Assuming OpenAI embeddings dimension
);

-- Create a test user with limited permissions
CREATE USER bookmarkai_app WITH PASSWORD 'app_password';
GRANT CONNECT ON DATABASE bookmarkai_dev TO bookmarkai_app;
GRANT USAGE ON SCHEMA public TO bookmarkai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bookmarkai_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO bookmarkai_app;
