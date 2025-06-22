#!/bin/bash

# Script to stop ML services

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "Stopping BookmarkAI ML Services..."

cd "$PROJECT_ROOT/docker"

# Stop ML services
docker compose -f docker-compose.yml -f docker-compose.ml.yml down whisper-worker llm-worker vector-worker flower

echo "ML services stopped."
echo ""
echo "Note: Base services (postgres, redis, rabbitmq) are still running."
echo "To stop all services: ./scripts/docker-stop.sh"