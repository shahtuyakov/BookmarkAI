# BookmarkAI Project Context

*Last updated: 2025-05-17*

## Project Overview
BookmarkAI captures social-media content (TikTok, Reddit, X) via user-initiated sharing, enriches it with AI summaries/transcripts, and resurfaces items through search, digests, and integrations.

## Current Status
- **Phase**: 0 - Local Dev Environment (96% complete)
- **Sprint**: 1 (May 10-24)
- **Upcoming Milestone**: MVP Skeleton (Phase 1) - Target: May 31

## Phase Progress
+ **Phase 0**: ✅ 100% complete
  - ✅ 0.1-0.3: Complete
  - ✅ 0.4: Complete - Database migration scripts
  - ✅ 0.5: Complete - Develop seed data scripts 
  - ✅ 0.8: Complete - Configure ESLint/Prettier and Git hooks
  - ✅ 0.9: Complete - Implement secrets handling sandbox
- **Phase 1-7**: ⏱️ Not started

## Current Tech Stack
- **Languages**: TypeScript (Node 20), Python 3.12
- **Client**: React Native (mobile), Next.js 14 (web), WebExtension
- **Backend**: Fastify via NestJS adapter
- **Data**: PostgreSQL 15 + pgvector, Redis, S3
- **Infrastructure**: AWS CDK (TypeScript)
- **ORM**: Drizzle ORM

## High-Level Architecture
1. **Capture Layer**: Mobile share extensions & browser extension for content saving
2. **API Gateway**: Validates JWT, rate-limits, stores data, publishes events
3. **Orchestration Worker**: Processes events, dispatches sub-tasks
4. **Python ML Workers**: Caption extraction, transcription, summarization
5. **Post-processing**: Finalizes records, marks status
6. **Inbox/Search**: Vector similarity search via pgvector
7. **Digest Service**: Weekly stats and email digests

## Current Focus
- Completing development environment setup
- Preparing for Phase 1 implementation
- Setting up project tracking and context system

## Recent Decisions
- Using Redis Streams with BullMQ instead of SQS for better local development
- Implementing pgvector with HNSW for vector similarity search
- Structuring project as a monorepo with pnpm workspace
- Using AWS CDK for infrastructure as code with modular stacks
- Designing security groups to avoid circular dependencies in CDK
- Using Drizzle ORM for database schema and migrations

## Known Challenges
- GPU configuration for Whisper transcription in development environment
- Rate limiting strategy for social media APIs
- Designing effective content moderation approach

## Next Steps
- Complete remaining Phase 0 tasks
- Begin Phase 1 implementation
- Set up CI/CD pipeline