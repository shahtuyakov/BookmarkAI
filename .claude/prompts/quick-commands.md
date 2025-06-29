# Quick Commands Reference

## Development Workflow Commands

### Start Development Environment
```bash
# Quick start everything
pnpm install
./scripts/docker-start.sh
./scripts/start-ml-services.sh
pnpm -w run dev:api
```

### Service-Specific Development
```bash
# API Gateway
pnpm --filter api-gateway start:dev

# Extension (hot reload)
pnpm --filter @bookmarkai/extension dev

# SDK (watch mode)
pnpm --filter @bookmarkai/sdk dev

# Mobile
pnpm -w run mobile:metro
pnpm -w run mobile:ios
```

### Database Operations
```bash
# Migrations
pnpm -w run db:generate
pnpm -w run db:migrate

# Connect to DB
docker exec -it docker-postgres-1 psql -U bookmarkai -d bookmarkai_dev
```

### ML Services Testing
```bash
# Test ML pipeline
cd packages/api-gateway && pnpm test:ml-pipeline

# Test specific services
cd packages/api-gateway && node test-whisper-direct.js
cd packages/api-gateway && node test-embedding-task.js

# Health checks
docker exec bookmarkai-vector-worker python -c "from vector_service.tasks import health_check; print(health_check())"
```

### Quality Checks
```bash
# Before committing
pnpm -w run lint:all
pnpm -w run typecheck:all
pnpm -w run test:all
```

### Docker Management
```bash
# View logs
docker logs -f bookmarkai-api-gateway
docker logs -f bookmarkai-llm-worker
docker logs -f bookmarkai-whisper-worker

# Debug
docker ps
docker exec -it ml-rabbitmq rabbitmqctl list_queues
lsof -i :3001
```

### Troubleshooting
```bash
# Port conflicts
kill -9 $(lsof -t -i:3001)

# Clean Docker
docker builder prune -f
docker container prune -f

# Clean pnpm
pnpm store prune
pnpm install --force

# Clear Redis
docker exec -it docker-redis-1 redis-cli FLUSHALL
```

---
**Usage**: Reference this when you need to quickly execute BookmarkAI-specific commands.