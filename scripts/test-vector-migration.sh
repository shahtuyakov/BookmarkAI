#!/bin/bash
# Test script for vector costs migration

set -e

echo "🧪 Testing Vector Costs Migration"
echo "================================"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must run from BookmarkAI root directory${NC}"
    exit 1
fi

echo -e "${YELLOW}1. First, ensure PostgreSQL is running...${NC}"
cd docker
docker compose up -d postgres
cd ..
sleep 5

echo -e "${YELLOW}2. Running the migration...${NC}"
cd packages/api-gateway

# Check if migration file exists
if [ ! -f "src/db/migrations/0010_vector_costs.sql" ]; then
    echo -e "${RED}Error: Migration file not found!${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Migration file found${NC}"

# Run the migration using psql directly (for testing)
echo -e "${YELLOW}3. Applying migration directly to test...${NC}"
PGPASSWORD=bookmarkai_password psql -h localhost -p 5433 -U bookmarkai -d bookmarkai_dev -f src/db/migrations/0010_vector_costs.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Migration applied successfully!${NC}"
else
    echo -e "${RED}✗ Migration failed${NC}"
    exit 1
fi

# Test the tables and views
echo -e "${YELLOW}4. Testing created objects...${NC}"
PGPASSWORD=bookmarkai_password psql -h localhost -p 5433 -U bookmarkai -d bookmarkai_dev << EOF
-- Check if vector_costs table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'vector_costs'
) as vector_costs_exists;

-- Check if views exist
SELECT EXISTS (
    SELECT FROM information_schema.views 
    WHERE table_schema = 'public' 
    AND table_name = 'hourly_vector_costs'
) as hourly_view_exists;

SELECT EXISTS (
    SELECT FROM information_schema.views 
    WHERE table_schema = 'public' 
    AND table_name = 'vector_budget_status'
) as budget_view_exists;

-- Check if materialized view exists
SELECT EXISTS (
    SELECT FROM pg_matviews 
    WHERE schemaname = 'public' 
    AND matviewname = 'daily_vector_costs'
) as daily_mv_exists;

-- Test inserting a sample record
INSERT INTO vector_costs (
    share_id,
    model,
    input_tokens,
    chunks_generated,
    total_cost,
    cost_per_token
) VALUES (
    NULL, -- No share_id for test
    'text-embedding-3-small',
    1000,
    2,
    0.00002,
    0.00000002
) RETURNING id, created_at;

-- Test the budget status view
SELECT * FROM vector_budget_status;

-- Clean up test data
DELETE FROM vector_costs WHERE share_id IS NULL;
EOF

echo -e "${GREEN}✅ Vector costs migration test completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Run the official Drizzle migration: pnpm run db:migrate"
echo "2. Generate TypeScript types: pnpm run db:generate"
echo "3. Start the vector worker to begin processing embeddings"

cd ../..