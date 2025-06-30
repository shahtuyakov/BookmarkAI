Setup vector memory system for Claude Code using BookmarkAI infrastructure.

Steps:
1. Create vector memory tables in BookmarkAI database
2. Set up embedding generation endpoint
3. Create MCP server configuration
4. Test with a sample memory storage
5. Configure auto-capture triggers

Commands to run:
```bash
# Create the schema
psql -U bookmarkai -d bookmarkai_dev << 'EOF'
-- Claude Memory Tables
CREATE TABLE IF NOT EXISTS claude_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    content TEXT NOT NULL,
    context JSONB,
    importance FLOAT DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claude_memory_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID REFERENCES claude_memories(id),
    embedding vector(1536) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claude_embeddings 
ON claude_memory_embeddings USING hnsw (embedding vector_cosine_ops);
EOF

# Test the connection
psql -U bookmarkai -d bookmarkai_dev -c "SELECT 'Vector memory ready!' as status;"
```

Next: Create simple API endpoint for memory storage