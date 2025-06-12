#!/bin/bash

echo "🔧 Testing Contract Testing Infrastructure Locally"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if command succeeded
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
    else
        echo -e "${RED}✗ $1 failed${NC}"
        exit 1
    fi
}

# 1. Install dependencies
echo "📦 Installing dependencies..."
pnpm install
check_status "Dependencies installed"

# 2. Build test matchers
echo "🏗️  Building test matchers package..."
pnpm --filter @bookmarkai/test-matchers build
check_status "Test matchers built"

# 3. Check if PostgreSQL and Redis are running
echo "🔍 Checking dependencies..."
if ! nc -z localhost 5432; then
    echo -e "${RED}PostgreSQL is not running on port 5432${NC}"
    echo "Run: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name postgres postgres:15"
    exit 1
fi
check_status "PostgreSQL is running"

if ! nc -z localhost 6379; then
    echo -e "${RED}Redis is not running on port 6379${NC}"
    echo "Run: docker run -d -p 6379:6379 --name redis redis:7"
    exit 1
fi
check_status "Redis is running"

# 4. Generate API types
echo "🔄 Generating API types..."
cd packages/api-gateway
pnpm run generate:types
check_status "API types generated"

# 5. Run consumer contract tests
echo "🧪 Running React Native consumer contract tests..."
cd ../mobile/bookmarkaimobile
pnpm test:contracts
check_status "Consumer contract tests passed"

# 6. Run provider verification
echo "✅ Running provider verification..."
cd ../../api-gateway
pnpm test:contracts:verify
check_status "Provider verification passed"

echo -e "${GREEN}🎉 All contract tests passed successfully!${NC}"