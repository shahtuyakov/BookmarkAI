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

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
cd ..
pnpm -w run db:migrate

# Start ML services using Docker Compose
echo -e "${YELLOW}Starting ML workers with Docker Compose...${NC}"
cd docker

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating .env file for ML services...${NC}"
    cat > .env << EOF
# LLM Provider API Keys (add your own)
OPENAI_API_KEY=${OPENAI_API_KEY:-your_openai_api_key_here}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-your_anthropic_api_key_here}
EOF
fi

# Start the LLM worker container
docker-compose -f docker-compose.ml.yml up -d llm-worker

# Wait for worker to start
echo -e "${YELLOW}Waiting for worker to initialize...${NC}"
sleep 5

# Check if worker is running
if docker ps | grep -q bookmarkai-llm-worker; then
    echo -e "${GREEN}✓ LLM worker is running${NC}"
else
    echo -e "${RED}✗ LLM worker failed to start${NC}"
    echo "Check logs with: docker logs bookmarkai-llm-worker"
fi

cd ..

echo -e "${GREEN}✨ ML Services started successfully!${NC}"
echo ""
echo "Services running:"
echo "  - PostgreSQL: localhost:5433"
echo "  - Redis: localhost:6379"
echo "  - RabbitMQ: localhost:5672"
echo "  - RabbitMQ Management UI: http://localhost:15672 (user: ml, pass: ml_password)"
echo "  - LLM Worker: Running in Docker (bookmarkai-llm-worker)"
echo ""
echo "To view worker logs:"
echo "  docker logs -f bookmarkai-llm-worker"
echo ""
echo "To monitor Celery tasks with Flower:"
echo "  cd docker && docker-compose -f docker-compose.ml.yml --profile monitoring up flower"
echo ""
echo "To stop all services:"
echo "  ./scripts/stop-ml-services.sh"