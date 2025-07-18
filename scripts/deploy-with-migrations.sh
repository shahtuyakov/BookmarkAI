#!/bin/bash
# Deploy script with automatic database migrations

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Go to the project root directory
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting deployment with migrations...${NC}"

# Load environment variables from the unified env system
ENVIRONMENT="${ENVIRONMENT:-development}"
echo -e "${YELLOW}Environment: ${ENVIRONMENT}${NC}"

set -a  # Mark variables for export
[ -f "./env/base.env" ] && source "./env/base.env"
[ -f "./env/${ENVIRONMENT}/shared.env" ] && source "./env/${ENVIRONMENT}/shared.env"
set +a  # Stop marking for export

# Function to wait for PostgreSQL to be ready
wait_for_postgres() {
    echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if pg_isready -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5433}" -U "${DB_USER:-bookmarkai}" > /dev/null 2>&1; then
            echo -e "${GREEN}PostgreSQL is ready!${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}PostgreSQL failed to start after ${max_attempts} seconds${NC}"
    return 1
}

# Start Docker services
echo -e "${GREEN}Starting Docker services...${NC}"
docker compose -f ./docker/docker-compose.yml -f ./docker/docker-compose.override.yml up -d

# Wait for database to be ready
if ! wait_for_postgres; then
    echo -e "${RED}Deployment failed: Database not ready${NC}"
    exit 1
fi

# Run database migrations
echo -e "${GREEN}Running database migrations...${NC}"
cd "$PROJECT_ROOT/packages/api-gateway"

# Run migrations (always run to ensure all are applied)
echo -e "${YELLOW}Applying database migrations...${NC}"
if npm run db:migrate; then
    echo -e "${GREEN}Migrations applied successfully!${NC}"
else
    echo -e "${RED}Migration failed!${NC}"
    echo -e "${YELLOW}Attempting to continue with existing schema...${NC}"
fi

# Verify social auth migration
echo -e "${GREEN}Verifying social auth migration...${NC}"
MIGRATION_CHECK=$(docker exec docker-postgres-1 psql -U "${DB_USER:-bookmarkai}" -d "${DB_NAME:-bookmarkai_dev}" -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='users' AND column_name='provider';")

if [ "${MIGRATION_CHECK// /}" -eq "1" ]; then
    echo -e "${GREEN}Social auth migration verified!${NC}"
else
    echo -e "${RED}Warning: Social auth columns not found in database${NC}"
    echo -e "${YELLOW}Please check migration status manually${NC}"
fi

# Start API Gateway if not already running
echo -e "${GREEN}Starting API Gateway...${NC}"
cd "$PROJECT_ROOT"
if ! pgrep -f "nest start" > /dev/null; then
    echo -e "${YELLOW}Starting API Gateway in background...${NC}"
    nohup pnpm -w run dev:api > /tmp/api-gateway.log 2>&1 &
    echo -e "${GREEN}API Gateway started (PID: $!)${NC}"
else
    echo -e "${YELLOW}API Gateway already running${NC}"
fi

# Display service status
echo -e "${GREEN}Deployment complete! Service status:${NC}"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(postgres|redis|rabbitmq|bookmarkai)" | head -10

# Display social auth configuration
echo -e "${GREEN}Social Auth Configuration:${NC}"
echo -e "SOCIAL_AUTH_ENABLED: ${SOCIAL_AUTH_ENABLED:-false}"
if [ "${SOCIAL_AUTH_ENABLED}" == "true" ]; then
    echo -e "Google Client ID: ${GOOGLE_CLIENT_ID:0:20}..."
    echo -e "Apple Client ID: ${APPLE_CLIENT_ID:0:20}..."
fi

echo -e "${GREEN}Access points:${NC}"
echo -e "- API Gateway: http://localhost:3001"
echo -e "- Auth Metrics: http://localhost:3001/auth/metrics/prometheus"
echo -e "- Grafana: http://localhost:3000"
echo -e "- RabbitMQ: http://localhost:15672"