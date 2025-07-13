#!/bin/bash
# Start ML services for BookmarkAI

set -e

echo "🚀 Starting BookmarkAI ML Services..."

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

# Load environment variables from the unified env system
ENVIRONMENT="${ENVIRONMENT:-development}"
echo -e "${YELLOW}Loading environment: ${ENVIRONMENT}${NC}"
set -a  # Mark variables for export
[ -f "./env/base.env" ] && source "./env/base.env"
[ -f "./env/${ENVIRONMENT}/shared.env" ] && source "./env/${ENVIRONMENT}/shared.env"
[ -f "./env/${ENVIRONMENT}/python-services.env" ] && source "./env/${ENVIRONMENT}/python-services.env"
set +a  # Stop marking for export

# Check for required API keys
if [ -z "$ML_OPENAI_API_KEY" ] || [ "$ML_OPENAI_API_KEY" = "your_openai_api_key_here" ]; then
    echo -e "${YELLOW}⚠️  Warning: ML_OPENAI_API_KEY not set - Whisper worker will not function${NC}"
    echo "Check env/base.env and set your OpenAI API key"
else
    # Export for compatibility with old variable name
    export OPENAI_API_KEY=$ML_OPENAI_API_KEY
fi

# Function to check if a service is running
check_service() {
    local service=$1
    local port=$2
    if nc -z localhost $port 2>/dev/null; then
        echo -e "${GREEN}✓ $service is running on port $port${NC}"
        return 0
    else
        echo -e "${RED}✗ $service is not running on port $port${NC}"
        return 1
    fi
}

# Start infrastructure services first (including RabbitMQ)
echo -e "${YELLOW}Starting infrastructure services...${NC}"
cd docker
docker compose up -d postgres redis rabbitmq

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Check infrastructure services
check_service "PostgreSQL" 5433
check_service "Redis" 6379
check_service "RabbitMQ" 5672
check_service "RabbitMQ Management" 15672

cd ..

# Start ML services using Docker Compose
echo -e "${YELLOW}Starting ML workers with Docker Compose...${NC}"
cd docker

# Start the ML worker containers using both compose files for proper network connectivity
echo -e "${YELLOW}Starting ML worker containers...${NC}"
docker compose -f docker-compose.yml -f docker-compose.ml.yml up -d llm-worker whisper-worker vector-worker

# Wait for workers to start
echo -e "${YELLOW}Waiting for workers to initialize...${NC}"
sleep 5

# Check if workers are running
workers_ok=true
if docker ps | grep -q bookmarkai-llm-worker; then
    echo -e "${GREEN}✓ LLM worker is running${NC}"
else
    echo -e "${RED}✗ LLM worker failed to start${NC}"
    echo "Check logs with: docker logs bookmarkai-llm-worker"
    workers_ok=false
fi

if docker ps | grep -q bookmarkai-whisper-worker; then
    echo -e "${GREEN}✓ Whisper worker is running${NC}"
else
    echo -e "${RED}✗ Whisper worker failed to start${NC}"
    echo "Check logs with: docker logs bookmarkai-whisper-worker"
    workers_ok=false
fi

if docker ps | grep -q bookmarkai-vector-worker; then
    echo -e "${GREEN}✓ Vector worker is running${NC}"
else
    echo -e "${RED}✗ Vector worker failed to start${NC}"
    echo "Check logs with: docker logs bookmarkai-vector-worker"
    workers_ok=false
fi

cd ..

if [ "$workers_ok" = true ]; then
    echo -e "${GREEN}✨ ML Services started successfully!${NC}"
else
    echo -e "${YELLOW}⚠️  ML Services started with warnings${NC}"
fi

echo ""
echo "Services running:"
echo "  - PostgreSQL: localhost:5433"
echo "  - Redis: localhost:6379"
echo "  - RabbitMQ: localhost:5672"
echo "  - RabbitMQ Management UI: http://localhost:15672 (user: ml, pass: ml_password)"
echo "  - LLM Worker: Running in Docker (bookmarkai-llm-worker)"
echo "  - Whisper Worker: Running in Docker (bookmarkai-whisper-worker)"
echo "  - Vector Worker: Running in Docker (bookmarkai-vector-worker)"
echo ""
echo "To view worker logs:"
echo "  docker logs -f bookmarkai-llm-worker      # LLM summarization logs"
echo "  docker logs -f bookmarkai-whisper-worker  # Transcription logs"
echo "  docker logs -f bookmarkai-vector-worker   # Vector embedding logs"
echo ""
echo "To monitor Celery tasks with Flower:"
echo "  cd docker && docker compose -f docker-compose.yml -f docker-compose.ml.yml --profile monitoring up flower"
echo ""
echo "To stop all services:"
echo "  ./scripts/stop-ml-services.sh"