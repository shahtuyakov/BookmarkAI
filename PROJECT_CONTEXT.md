# PROJECT_CONTEXT.md

_Last updated: 2025-05-17_

## Project Overview

BookmarkAI captures social-media content (TikTok, Reddit, X) via user-initiated sharing, enriches it with AI summaries/transcripts, and resurfaces items through search, digests, and integrations.

## Current Status

- **Phase**: 1 - MVP Skeleton (26% complete)
- **Sprint**: 1 (May 10-24)
- **Recent Milestones**: 
  - ✅ JWT Auth with Email Verification (Completed May 17)
  - ✅ /shares endpoint implementation (Completed May 17)
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

- **Phase 1**: 🏗️ 26% complete

  - ✅ 1.1: Complete - Create NestJS+Fastify project structure
  - ✅ 1.2: Complete - Implement JWT auth middleware with email verification
  - ✅ 1.3: Complete - Develop health check endpoint
  - ✅ 1.4: Complete - Implement /shares endpoint with idempotency
  - 🏗️ 1.5: In Progress - Set up BullMQ worker (15%)
  - ⏱️ 1.6-1.14: Not started

- **Phase 2-7**: ⏱️ Not started

## Current Tech Stack

- **Languages**: TypeScript (Node 20), Python 3.12
- **API Framework**: NestJS with Fastify adapter
- **Client**: React Native (mobile), Next.js 14 (web), WebExtension (planned)
- **Backend**: NestJS with Fastify, BullMQ (initial integration)
- **Authentication**: JWT with AWS KMS, Refresh tokens, Email verification
- **Data**: PostgreSQL 15 + pgvector, Redis, S3
- **Infrastructure**: AWS CDK (TypeScript)
- **ORM**: Drizzle ORM
- **Email**: Ethereal (dev), AWS SES (production)

## Recent Enhancements

- **Enhanced Authentication System**:
  - Email verification flow with secure tokens
  - Password reset functionality
  - User profile management
  - Role-based access control

- **Shares API Endpoint**:
  - Implemented RESTful /shares endpoint with proper validation
  - Added platform detection (TikTok, Reddit, Twitter, X)
  - Integrated with BullMQ for background processing
  - Implemented cursor-based pagination for efficient listing
  - Added Redis-based idempotency handling with 24h TTL
  - Created comprehensive error handling system
  - Added rate limiting (10 req/10s) to prevent abuse

## High-Level Architecture

1. **User Authentication**: JWT-based auth with refresh tokens and email verification
2. **Capture Layer**: Mobile share extensions & browser extension for content saving
3. **API Gateway**: NestJS+Fastify application with modular structure
4. **Orchestration Worker**: Processes events, dispatches sub-tasks (in progress)
5. **Python ML Workers**: Caption extraction, transcription, summarization (planned)
6. **Post-processing**: Finalizes records, marks status (planned)
7. **Inbox/Search**: Vector similarity search via pgvector (planned)
8. **Digest Service**: Weekly stats and email digests (planned)

## Current Focus

- Completing Phase 1 MVP Skeleton
- Next task: Expand BullMQ worker setup (Task 1.5)
- Followed by: Create React Native mobile app shell (Task 1.6)

## Recent Decisions

- Enhanced JWT auth with email verification and password reset
- Implemented token family tracking to prevent refresh token attacks
- Created Redis-based idempotency system for the /shares endpoint
- Adopted cursor-based pagination for better performance with large datasets
- Developed comprehensive error handling system with specific error codes

## Known Challenges

- Ensuring proper auth integration with mobile and extension clients
- Planning microservice extraction path for ML components
- Designing effective vector search strategies for content retrieval
- Managing background job reliability with potential rate limiting from external APIs

## Next Steps

- Complete remaining tasks in Phase 1
- Set up CI/CD pipeline for automated deployment
- Begin planning for Phase 2 (Metadata + Caption Fetch)