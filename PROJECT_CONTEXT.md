# BookmarkAI Project Context

*Last updated: 2025-05-15*

## Project Overview
BookmarkAI captures social-media content (TikTok, Reddit, X) via user-initiated sharing, enriches it with AI summaries/transcripts, and resurfaces items through search, digests, and integrations.

## Current Status
- **Phase**: 0 - Local Dev Environment (90% complete)
- **Sprint**: 1 (May 10-24)
- **Upcoming Milestone**: MVP Skeleton (Phase 1) - Target: May 31

## Phase Progress
- **Phase 0**: 🏗️ 90% complete
  - ✅ 0.1-0.7: Complete
  - 🏗️ 0.8: 50% - Configure ESLint/Prettier and Git hooks (in progress)
  - 🏗️ 0.9: 25% - Implement secrets handling sandbox (started)
- **Phase 1-7**: ⏱️ Not started

## Current Tech Stack
- **Languages**: TypeScript (Node 20), Python 3.12
- **Client**: React Native (mobile), Next.js 14 (web), WebExtension
- **Backend**: Fastify via NestJS adapter
- **Data**: PostgreSQL 15 + pgvector, Redis, S3
- **Infrastructure**: AWS CDK (TypeScript)

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

## Known Challenges
- GPU configuration for Whisper transcription in development environment
- Rate limiting strategy for social media APIs
- Designing effective content moderation approach

## Next Steps
- Complete Phase 0 tasks
- Begin Phase 1 implementation
- Set up CI/CD pipeline