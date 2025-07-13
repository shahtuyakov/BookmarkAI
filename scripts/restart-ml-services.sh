#!/bin/bash
# Restart ML services for BookmarkAI - clean restart
# This script ensures proper cleanup before starting services

set -e

echo "🔄 Restarting BookmarkAI ML Services..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Change to docker directory
cd docker

# Stop all services first
echo -e "${YELLOW}Stopping all services...${NC}"
docker compose -f docker-compose.yml -f docker-compose.ml.yml down

# Remove any orphaned containers
echo -e "${YELLOW}Cleaning up orphaned containers...${NC}"
docker container prune -f

# Start infrastructure services
echo -e "${YELLOW}Starting infrastructure services...${NC}"
docker compose up -d postgres redis rabbitmq

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for infrastructure services to be ready...${NC}"
sleep 15

# Start ML services using both compose files
echo -e "${YELLOW}Starting ML services...${NC}"
docker compose -f docker-compose.yml -f docker-compose.ml.yml up -d llm-worker whisper-worker vector-worker

# Wait a bit for services to initialize
sleep 5

# Check status
echo -e "${GREEN}Services status:${NC}"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(rabbitmq|llm-worker|whisper-worker|vector-worker|postgres|redis)" || true

echo -e "${GREEN}✨ ML Services restarted successfully!${NC}"
echo ""
echo "To view logs:"
echo "  docker logs -f rabbitmq                   # RabbitMQ logs"
echo "  docker logs -f bookmarkai-llm-worker      # LLM worker logs"
echo "  docker logs -f bookmarkai-whisper-worker  # Whisper worker logs"
echo "  docker logs -f bookmarkai-vector-worker   # Vector worker logs"