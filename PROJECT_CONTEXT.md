# BookmarkAI Project Context

_Last updated: 2025-05-17_

## Project Overview

BookmarkAI captures social-media content (TikTok, Reddit, X) via user-initiated sharing, enriches it with AI summaries/transcripts, and resurfaces items through search, digests, and integrations.

## Current Status

- **Phase**: 1 - MVP Skeleton (8% complete)
- **Sprint**: 1 (May 10-24)
- **Recent Milestone**: ✅ Phase 0 - Local Dev Environment (Completed May 17)
- **Current Milestone**: 🏗️ Phase 1 - MVP Skeleton (Target: May 31)

## Phase Progress

- **Phase 0**: ✅ 100% complete

  - ✅ 0.1: Complete - Set up mono-repo with pnpm workspace
  - ✅ 0.2: Complete - Create Docker Compose configuration
  - ✅ 0.3: Complete - Implement AWS CDK infrastructure templates
  - ✅ 0.4: Complete - Database migration scripts
  - ✅ 0.5: Complete - Develop seed data scripts
  - ✅ 0.6: Complete - Document environment variables
  - ✅ 0.7: Complete - Set up dev environment documentation
  - ✅ 0.8: Complete - Configure ESLint/Prettier and Git hooks
  - ✅ 0.9: Complete - Implement secrets handling sandbox

- **Phase 1**: 🏗️ 8% complete

  - ✅ 1.1: Complete - Create NestJS+Fastify project structure
  - ⏱️ 1.2: Not started - Implement JWT auth middleware
  - ⏱️ 1.3: Not started - Develop health check endpoint
  - ⏱️ 1.4: Not started - Implement /shares endpoint
  - ⏱️ 1.5-1.14: Not started

- **Phase 2-7**: ⏱️ Not started

## Current Tech Stack

- **Languages**: TypeScript (Node 20), Python 3.12
- **API Framework**: NestJS with Fastify adapter
- **Client**: React Native (mobile), Next.js 14 (web), WebExtension (planned)
- **Backend**: NestJS with Fastify, BullMQ (planned)
- **Data**: PostgreSQL 15 + pgvector, Redis, S3
- **Infrastructure**: AWS CDK (TypeScript)
- **ORM**: Drizzle ORM

## High-Level Architecture

1. **Capture Layer**: Mobile share extensions & browser extension for content saving
2. **API Gateway**: NestJS+Fastify application with modular structure
3. **Orchestration Worker**: Processes events, dispatches sub-tasks (planned)
4. **Python ML Workers**: Caption extraction, transcription, summarization (planned)
5. **Post-processing**: Finalizes records, marks status (planned)
6. **Inbox/Search**: Vector similarity search via pgvector (planned)
7. **Digest Service**: Weekly stats and email digests (planned)

## Current Focus

- Implementing Phase 1 MVP Skeleton
- Next task: JWT auth middleware (Task 1.2)
- Expanding health check endpoint (Task 1.3)
- Implementing /shares endpoint (Task 1.4)

## Recent Decisions

- Implemented modular monolith architecture using NestJS with Fastify (ADR-001)
- Integrated existing Drizzle ORM setup with NestJS dependency injection
- Selected port 3001 for the API gateway to avoid conflicts
- Used global modules for configuration and database access
- Implemented custom pgvector type compatible with Drizzle ORM v0.43.1

## Known Challenges

- Ensuring proper module boundaries as the application grows
- Integrating authentication with future mobile and web clients
- Planning microservice extraction path for ML components
- Designing effective vector search strategies for content retrieval

## Next Steps

- Complete remaining tasks in Phase 1
- Set up CI/CD pipeline for automated deployment
- Begin planning for Phase 2 (Metadata + Caption Fetch)
