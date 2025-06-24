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
cd docker

# Stop ML services
docker compose -f docker-compose.ml.yml down

# Optionally stop infrastructure services
read -p "Also stop infrastructure services (PostgreSQL, Redis)? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker compose down
    echo -e "${GREEN}✓ All services stopped${NC}"
else
    echo -e "${GREEN}✓ ML services stopped (infrastructure still running)${NC}"
fi

cd ..

echo -e "${GREEN}✨ ML Services stopped successfully!${NC}"