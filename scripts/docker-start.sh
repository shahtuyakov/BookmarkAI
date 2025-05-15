#!/bin/bash
# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Go to the project root directory
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Now run docker compose with relative paths
docker compose -f ./docker/docker-compose.yml -f ./docker/docker-compose.override.yml up -d