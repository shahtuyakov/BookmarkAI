Looking at your CLAUDE.md file, it's well-structured but could be more focused and practical. Here's my review with an improved version:

## Key Issues:

1. **Tool References**: Mentions non-standard tools (ast-grep, TodoWrite) that Claude Code may not have
2. **Overly Prescriptive**: Tells Claude how to respond rather than focusing on project info
3. **Information Scatter**: Important details buried in long lists
4. **Missing Context**: Lacks practical examples of common tasks

## Improved CLAUDE.md:

```markdown
# CLAUDE.md

## Project Overview
BookmarkAI - A platform that captures social media content (TikTok, Reddit, X/Twitter, YouTube, Instagram) and enriches it with AI-powered summaries, transcripts, and smart search.

## Architecture
- **Monorepo Structure**: PNPM workspace with TypeScript/Python services
- **API**: NestJS with Fastify, PostgreSQL + pgvector, Redis/BullMQ
- **Mobile**: React Native 0.79 with share extensions
- **ML Pipeline**: Python Celery workers processing via RabbitMQ
- **Event Flow**: Content → API → Queue → ML Services → Database → Search

## Key Directories
```
BookmarkAI/
├── packages/api-gateway/        # Main API (NestJS)
├── packages/mobile/             # React Native app
├── packages/extension/          # Browser extension
├── packages/sdk/               # TypeScript SDK
├── python/                     # ML services (llm, whisper, vector, caption)
├── docs/architecture/decisions/ # ADRs documenting major decisions
└── env/                        # Environment configs (never commit actual .env files)
```

## Development Guidelines

### Code Style
**TypeScript**: 2 spaces, single quotes, semicolons, arrow functions preferred
**Python**: 4 spaces, double quotes, black formatter, max 88 chars

### Common Tasks

#### Adding an API Endpoint
1. Create controller method in `packages/api-gateway/src/modules/{module}/`
2. Add service logic and DTOs
3. Update OpenAPI spec: `apps/api/openapi.yaml`
4. Generate SDK types: `pnpm -w run sdk:generate`
5. Add tests

#### Debugging ML Pipeline
1. Check queue status: `docker exec ml-rabbitmq rabbitmqctl list_queues`
2. View worker logs: `docker logs -f bookmarkai-llm-worker`
3. Monitor Celery: http://localhost:5555
4. Check task results in `ml_results` table

#### Mobile Development
1. Start Metro: `pnpm -w run mobile:metro`
2. Run iOS: `pnpm -w run mobile:ios`
3. Components in: `packages/mobile/bookmarkaimobile/src/`
4. Share extension: `packages/mobile/bookmarkaimobile/ios/ShareExtension/`

## Essential Commands

### Daily Development
```bash
# Start everything
./scripts/docker-start.sh
pnpm -w run dev:api

# Database operations
pnpm -w run db:migrate
pnpm -w run db:generate

# Testing
pnpm test
pnpm lint
```

### Service-Specific
```bash
# API Gateway
pnpm --filter api-gateway start:dev
pnpm --filter api-gateway test

# Mobile
pnpm --filter @bookmarkai/mobile ios
pnpm --filter @bookmarkai/mobile test:contracts

# ML Services
./scripts/start-ml-services.sh
docker logs -f bookmarkai-vector-worker
```

## Architecture Patterns

### API Gateway (NestJS)
- **Pattern**: Repository pattern with dependency injection
- **Events**: BullMQ for async processing
- **Auth**: JWT with guards
- **Database**: Drizzle ORM with PostgreSQL

### ML Services (Python)
- **Pattern**: Celery workers with Redis broker
- **Models**: Loaded once at startup
- **Caching**: Redis for embeddings
- **Batching**: Process multiple items when possible

### Mobile (React Native)
- **State**: React Query for server state
- **Navigation**: React Navigation
- **Forms**: React Hook Form with Zod validation
- **Sharing**: Native share extensions

## Critical Information

### Database Schema
- `users`: Authentication and profiles
- `shares`: Main content storage
- `embeddings`: Vector embeddings (1536 dimensions)
- `ml_results`: Task results and metadata
- See: `packages/api-gateway/src/drizzle/schema/`

### Environment Variables
- Structure: `env/{environment}/{service}.env`
- Critical: `JWT_SECRET`, `DATABASE_URL`, `RABBITMQ_URL`, `OPENAI_API_KEY`
- Never commit actual .env files

### Common Issues

**Port Conflicts**
```bash
# Kill process on port 3001
kill -9 $(lsof -t -i:3001)
```

**ML Tasks Stuck**
- Check RabbitMQ queues
- Restart workers: `./scripts/ml-restart.sh`
- Check Redis connection

**Auth Failures**
- Verify JWT_SECRET matches across services
- Check Supabase connection
- Token expiration settings

## Performance Considerations
- **Vector Search**: Use pgvector HNSW indexes
- **Queue Depth**: Monitor with Grafana (http://localhost:3000)
- **Batching**: Group ML requests when possible
- **Caching**: Use Redis for hot data

## Testing Strategy
- Unit tests for business logic
- Integration tests for API endpoints
- Contract tests for mobile-API communication
- Load tests for ML services

## Monitoring
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Celery Flower**: http://localhost:5555

## Quick Reference
- **ADRs**: `docs/architecture/decisions/` - Read before major changes
- **API Spec**: `apps/api/openapi.yaml`
- **Commands**: `docs/project_commands_upd.md`
```