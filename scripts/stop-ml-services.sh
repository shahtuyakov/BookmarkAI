#!/bin/bash
# Stop ML services for BookmarkAI

set -e

echo "🛑 Stopping BookmarkAI ML Services..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Stop ML worker containers
echo -e "${YELLOW}Stopping ML worker containers...${NC}"

# Stop Docker services
echo -e "${YELLOW}Stopping Docker services...${NC}"

# Set default environment variable to avoid warnings
export ENVIRONMENT=${ENVIRONMENT:-development}

# Load environment variables
ENV_DIR="../env"
if [ -f "$ENV_DIR/base.env" ]; then
    set -a
    source "$ENV_DIR/base.env"
    set +a
fi
if [ -f "$ENV_DIR/${ENVIRONMENT}/shared.env" ]; then
    set -a
    source "$ENV_DIR/${ENVIRONMENT}/shared.env"
    set +a
fi
if [ -f "$ENV_DIR/${ENVIRONMENT}/python-services.env" ]; then
    set -a
    source "$ENV_DIR/${ENVIRONMENT}/python-services.env"
    set +a
fi

# Export minimal defaults if variables are still not set (for docker-compose parsing)
export DB_USER=${DB_USER:-postgres}
export DB_PASSWORD=${DB_PASSWORD:-password}
export DB_NAME=${DB_NAME:-bookmarkai}
export MQ_USER=${MQ_USER:-guest}
export MQ_PASSWORD=${MQ_PASSWORD:-guest}
export MQ_PORT=${MQ_PORT:-5672}
export CACHE_PORT=${CACHE_PORT:-6379}
export ML_OPENAI_API_KEY=${ML_OPENAI_API_KEY:-dummy}
export S3_MEDIA_BUCKET=${S3_MEDIA_BUCKET:-bookmarkai-media}

cd docker

# Check which workers are running
llm_running=false
whisper_running=false
vector_running=false

if docker ps | grep -q bookmarkai-llm-worker; then
    llm_running=true
fi

if docker ps | grep -q bookmarkai-whisper-worker; then
    whisper_running=true
fi

if docker ps | grep -q bookmarkai-vector-worker; then
    vector_running=true
fi

# Report what's being stopped
if [ "$llm_running" = true ] || [ "$whisper_running" = true ] || [ "$vector_running" = true ]; then
    echo "Stopping:"
    [ "$llm_running" = true ] && echo "  - LLM Worker"
    [ "$whisper_running" = true ] && echo "  - Whisper Worker"
    [ "$vector_running" = true ] && echo "  - Vector Worker"
fi

# Stop ML services
docker compose -f docker-compose.ml.yml down

# Optionally stop infrastructure services
read -p "Also stop infrastructure services (PostgreSQL, Redis, RabbitMQ)? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker compose down
    echo -e "${GREEN}✓ All services stopped${NC}"
else
    echo -e "${GREEN}✓ ML workers stopped (infrastructure still running)${NC}"
fi

cd ..

echo -e "${GREEN}✨ ML Services stopped successfully!${NC}"