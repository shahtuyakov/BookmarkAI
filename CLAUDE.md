# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Project Overview
BookmarkAI is a social media content capture and enrichment platform that captures content from social media platforms (TikTok, Reddit, X/Twitter), enriches it with AI-powered summaries and transcripts, and resurfaces items through search and digests.

## Technology Stack
- **Backend**: NestJS (TypeScript) with Fastify adapter, PostgreSQL 15 with pgvector, Redis/BullMQ
- **Mobile**: React Native 0.79 with TypeScript
- **Python Services**: ML/AI services for transcription, summarization, and embeddings
- **Infrastructure**: Docker Compose (local), AWS CDK for production deployment

## Architecture Patterns
- **Architecture Decision Records (ADRs)**:
   - contains the ADRs for the project `docs/architecture/decisions/`
   - contains the implementation notes for the ADRs `docs/context/tasks/`
   - contains the memory for the ADRs `docs/memory/`

## Essential Commands
   - contains the essential commands for the project `docs/project_commands_upd.md`

## Core Services Structure
```
BookmarkAI/
  ├── apps/api/                    # API specifications
  ├── packages/                    # Monorepo packages
  │   ├── api-gateway/            # NestJS backend (main API)
  │   ├── mobile/bookmarkaimobile/# React Native app
  │   ├── sdk/                    # Shared TypeScript SDK
  │   ├── extension/              # Browser extension
  │   └── orchestrator/           # Service orchestration
  ├── python/                     # ML/AI services
  │   ├── caption-service/        # Image captioning
  │   ├── llm-service/           # LLM integration
  │   ├── vector-service/        # Embeddings
  │   └── whisper-service/       # Transcription
  ├── infrastructure/            # AWS CDK definitions
  ├── docker/                    # Docker & monitoring setup
  ├── docs/                      # Documentation & ADRs
  └── scripts/
```

## Code Style and Structure
  - Write concise, technical code with accurate examples
  - Use functional and declarative programming patterns; avoid classes
  - Prefer iteration and modularization over code duplication
  - Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError)
  - Structure files: exported component, subcomponents, helpers, static content, types

## Tool Usage Priority
  1. **ast-grep (`sg`)**: Use for ALL syntax-aware searches. Examples:
     - `sg --lang typescript 'class $NAME'` - Find all classes
     - `sg --lang python 'def $FUNC($_):'` - Find all functions
     - `sg --pattern '$VAR = new $CLASS($_)'` - Find instantiations
  2. **Task tool**: Use for complex searches across multiple files
  3. **TodoWrite/TodoRead**: Use frequently for task tracking
  4. **Grep/Glob**: Use only for simple text searches or file patterns
  
## Development Workflow
  1. **Before making changes**:
     - Read relevant ADRs in `docs/architecture/decisions/`
     - Check `docs/memory/` for previous context
     - Use TodoWrite to plan tasks
  
  2. **When implementing features**:
     - Follow patterns in `.claude/patterns/`
     - Check existing similar implementations first
     - Update tests alongside implementation
     - Run lint/format before completion
  
  3. **For debugging**:
     - Check logs in `docker/logs/`
     - Use structured debugging approach
     - Consider microservice interactions
     - Check message queue health

## Service-Specific Guidelines

### API Gateway (NestJS)
  - Use dependency injection consistently
  - Follow repository pattern for data access
  - Implement proper DTO validation
  - Use guards for authentication/authorization
  - Emit events for async operations

### Python ML Services
  - Load models once at startup
  - Implement request batching
  - Use Redis for caching
  - Follow FastAPI best practices
  - Add proper error handling and retries

### React Native Mobile
  - Use functional components with hooks
  - Implement proper error boundaries
  - Follow atomic design principles
  - Use React Query for data fetching
  - Optimize for performance (memo, lazy loading)

## Critical Paths
  1. **Content Ingestion**: Extension → API Gateway → Queue → Python Services
  2. **Search**: Mobile → API Gateway → Vector Service → PostgreSQL
  3. **Digest Generation**: Scheduler → Orchestrator → LLM Service → Notifications

## Performance Considerations
  - Vector searches: Use pgvector indexes properly
  - Queue processing: Monitor queue depths
  - ML inference: Batch requests when possible
  - Database: Use connection pooling
  - Caching: Redis for hot data, embeddings cache

## Security Guidelines
  - Never commit secrets or API keys
  - Use environment variables for configuration
  - Validate all user inputs
  - Implement rate limiting on endpoints
  - Use HTTPS/TLS for all communications
  - Sanitize data before storage

## Testing Strategy
  - Unit tests for business logic
  - Integration tests for API endpoints
  - E2E tests for critical user flows
  - Load tests for ML services
  - Always run tests before marking task complete

## Error Handling
  - Use custom exception classes
  - Log errors with context
  - Return meaningful error messages
  - Implement retry mechanisms
  - Have fallback strategies

## Monitoring & Observability
  - Prometheus metrics for all services
  - Grafana dashboards for visualization
  - Structured logging with correlation IDs
  - Health checks for all services
  - Alert on queue depth and error rates

## RESPONSE FORMAT
  - **Utilize Chain-of-Thought (CoT) reasoning**
  - When uncertain, ask clarifying questions
  - Focus on working code over explanations
  - Test your implementation before completion
  - Keep responses concise and actionable

## Important Reminders
  - ALWAYS use TodoWrite for task planning
  - NEVER create files unless necessary
  - PREFER editing existing files
  - RUN lint/test commands before completion
  - CHECK ADRs for architectural decisions
  - USE ast-grep for code searches