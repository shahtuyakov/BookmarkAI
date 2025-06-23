#!/bin/bash

# Script to start ML services with proper dependencies

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Load environment variables if .env exists
if [ -f "$PROJECT_ROOT/.env" ]; then
    echo "Loading environment variables from .env..."
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

echo "Starting BookmarkAI ML Services..."

# Check if OPENAI_API_KEY is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "Error: OPENAI_API_KEY environment variable is not set"
    echo "Please set it using: export OPENAI_API_KEY=your_api_key"
    exit 1
fi

# Ensure base services are running
echo "Checking base services..."
cd "$PROJECT_ROOT/docker"
docker compose ps | grep -E "(postgres|redis|rabbitmq)" | grep -q "Up" || {
    echo "Base services not running. Starting them first..."
    docker compose up -d postgres redis rabbitmq
    echo "Waiting for services to be healthy..."
    sleep 10
}

# Run database migrations if needed
echo "Checking database migrations..."
cd "$PROJECT_ROOT/packages/api-gateway"
if [ -f "package.json" ]; then
    echo "Running database migrations..."
    pnpm run db:migrate || echo "Migration already applied or failed"
fi

# Start ML services
echo "Starting ML workers..."
cd "$PROJECT_ROOT/docker"
docker compose -f docker-compose.yml -f docker-compose.ml.yml up -d whisper-worker llm-worker vector-worker flower

# Show status
echo ""
echo "ML Services Status:"
docker compose -f docker-compose.yml -f docker-compose.ml.yml ps | grep -E "(whisper|llm|vector|flower)"

echo ""
echo "Services available at:"
echo "  - RabbitMQ Management: http://localhost:15672 (user: ml, pass: ml_password)"
echo "  - Celery Flower: http://localhost:5555"
echo ""
echo "To view logs: docker compose -f docker-compose.yml -f docker-compose.ml.yml logs -f [service-name]"
echo "To stop: ./scripts/docker-ml-stop.sh"