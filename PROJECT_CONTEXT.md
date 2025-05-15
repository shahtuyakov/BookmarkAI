# BookmarkAI Project Context

*Last updated: 2025-05-15*

## Project Overview
BookmarkAI captures social-media content (TikTok, Reddit, X) via user-initiated sharing, enriches it with AI summaries/transcripts, and resurfaces items through search, digests, and integrations.

## Current Status
- **Phase**: 0 - Local Dev Environment (35% complete)
- **Sprint**: 1 (May 10-24)
- **Recent Milestones**: 
  - ✅ Mono-repo setup (May 15)
  - ✅ Docker environment configuration (May 15)
- **Upcoming Milestone**: MVP Skeleton (Phase 1) - Target: May 31

## Phase Progress
- **Phase 0**: 🏗️ 35% complete
  - ✅ 0.1: 100% - Set up mono-repo with pnpm workspace (completed)
  - ✅ 0.2: 100% - Docker Compose configuration (completed)
  - 🏗️ 0.3: 0% - Implement AWS CDK infrastructure templates (not started)
  - ⏱️ 0.4-0.9: 0% - Not started
- **Phase 1-7**: ⏱️ Not started

## Current Tech Stack
- **Languages**: TypeScript (Node 20), Python 3.12
- **Client**: React Native (mobile), Next.js 14 (web), WebExtension
- **Backend**: Fastify via NestJS adapter
- **Data**: PostgreSQL 15 + pgvector, Redis, S3
- **Infrastructure**: AWS CDK (TypeScript)
- **Observability**: Grafana, Prometheus, Tempo

## Local Environment
- **Database**: PostgreSQL with pgvector extension (port 5433)
- **Cache/Queue**: Redis (port 6379) 
- **Storage**: MinIO S3-compatible (ports 9000-9001)
- **Monitoring**: Grafana (port 3000), Prometheus (port 9090)
- **Tracing**: Tempo (port 3200)
- **Tools**: pgAdmin (port 5050)

## High-Level Architecture
1. **Capture Layer**: Mobile share extensions & browser extension for content saving
2. **API Gateway**: Validates JWT, rate-limits, stores data, publishes events
3. **Orchestration Worker**: Processes events, dispatches sub-tasks
4. **Python ML Workers**: Caption extraction, transcription, summarization
5. **Post-processing**: Finalizes records, marks status
6. **Inbox/Search**: Vector similarity search via pgvector
7. **Digest Service**: Weekly stats and email digests

## Current Focus
- Implementing AWS CDK infrastructure templates (Task 0.3)
- Preparing for database migration scripts (Task 0.4)
- Planning Phase 1 MVP Skeleton implementation

## Recent Decisions
- Using Redis Streams with BullMQ instead of SQS for better local development
- Implementing pgvector with HNSW for vector similarity search
- Structured project as a monorepo with pnpm workspace
- Configured Docker for comprehensive local development environment
- Using port 5433 for PostgreSQL to avoid conflicts with local instances

## Known Challenges
- Loki log aggregation service configuration pending resolution
- GPU configuration for Whisper transcription in development environment
- Rate limiting strategy for social media APIs
- Designing effective content moderation approach

## Next Steps
- Begin AWS CDK infrastructure templates (Task 0.3)
- Create database migration scripts (Task 0.4)
- Develop seed data scripts (Task 0.5)
- Document environment variables (Task 0.6)