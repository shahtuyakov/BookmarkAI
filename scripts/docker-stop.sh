#!/bin/bash
# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Go to the project root directory
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Load environment variables from the unified env system
ENVIRONMENT="${ENVIRONMENT:-development}"
set -a  # Mark variables for export
[ -f "./env/base.env" ] && source "./env/base.env"
[ -f "./env/${ENVIRONMENT}/shared.env" ] && source "./env/${ENVIRONMENT}/shared.env"
set +a  # Stop marking for export

# Now run docker compose with relative paths
docker compose -f ./docker/docker-compose.yml -f ./docker/docker-compose.override.yml down