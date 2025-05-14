# BookmarkAI Implementation Task Map

## Phase 0: Local Dev Environment (Week 0)

| Task ID | Task Description | Owner | Est. Duration | Dependencies | Notes |
|---------|-----------------|-------|---------------|--------------|-------|
| 0.1 | Set up mono-repo with pnpm workspace | DevOps | 1 day | - | Configure proper workspace structure for all components |
| 0.2 | Create Docker Compose configuration | DevOps | 2 days | 0.1 | Include all services: Postgres+pgvector, Redis, MinIO, Tempo+Loki |
| 0.3 | Implement AWS CDK infrastructure templates | DevOps | 3 days | 0.1 | Focus on dev environment first |
| 0.4 | Create database migration scripts | Backend | 2 days | 0.2 | Include vector extension setup |
| 0.5 | Develop seed data scripts | Backend | 1 day | 0.4 | Sample shares and embeddings |
| 0.6 | Document environment variables | DevOps | 1 day | 0.2, 0.3 | Create .env.example with all required variables |
| 0.7 | Set up dev environment documentation | DevOps | 1 day | 0.1-0.6 | README with setup instructions |
| 0.8 | Configure ESLint/Prettier and Git hooks | DevOps | 1 day | 0.1 | Prevent style churn; add ts-prune/pyright dead-code checks |
| 0.9 | Implement secrets handling sandbox | DevOps | 2 days | 0.6 | Set up .envrc with direnv, Vault dev server for secret-config separation |

## Phase 1: MVP Skeleton (Weeks 1-2)

| Task ID | Task Description | Owner | Est. Duration | Dependencies | Notes |
|---------|-----------------|-------|---------------|--------------|-------|
| 1.1 | Create NestJS+Fastify project structure | Backend | 2 days | 0.7 | Set up modules, controllers, services |
| 1.2 | Implement JWT auth middleware | Backend | 2 days | 1.1 | Use KMS for token signing |
| 1.3 | Develop health check endpoint | Backend | 1 day | 1.1 | Include DB & Redis connectivity checks |
| 1.4 | Implement /shares endpoint | Backend | 3 days | 1.1, 1.2 | Store minimal share data |
| 1.5 | Set up BullMQ worker | Backend | 2 days | 1.4 | Echo URL and update status |
| 1.6 | Create React Native mobile app shell | Mobile | 4 days | - | Basic navigation & auth flows |
| 1.7 | Implement iOS Share Extension | Mobile | 3 days | 1.6 | Swift implementation bridged to RN |
| 1.8 | Implement Android Intent Filter | Mobile | 3 days | 1.6 | Kotlin implementation bridged to RN |
| 1.9 | Create browser WebExtension | Frontend | 4 days | - | Add star button to supported sites |
| 1.10 | Set up ngrok for local testing | DevOps | 1 day | 1.4 | Enable mobile/extension testing against local API |
| 1.11 | Integrate mobile & extension with API | Mobile/Frontend | 3 days | 1.4-1.10 | Test end-to-end flow |
| 1.12 | Create API style guide | Backend | 2 days | 1.4 | Define naming conventions, pagination, error schema |
| 1.13 | Implement contract tests | QA | 2 days | 1.4, 1.11 | Use Pact or Dredd to ensure client/server compatibility |
| 1.14 | Add idempotency keys to /shares API | Backend | 2 days | 1.4 | Prevent duplicate processing when share-sheet double-fires |

## Phase 2: Metadata + Caption Fetch (Weeks 3-4)

| Task ID | Task Description | Owner | Est. Duration | Dependencies | Notes |
|---------|-----------------|-------|---------------|--------------|-------|
| 2.1 | Create content fetcher interfaces | Backend | 2 days | 1.5 | Define common interface for all platforms |
| 2.2 | Implement TikTok Display-API fetcher | Backend | 4 days | 2.1 | Handle rate limits & auth |
| 2.3 | Implement Reddit JSON fetcher | Backend | 3 days | 2.1 | Support different content types |
| 2.4 | Create X/Twitter stub fetcher | Backend | 2 days | 2.1 | Basic implementation |
| 2.5 | Set up Python microservice framework | ML | 3 days | 0.7 | Celery + aio-pika configuration |
| 2.6 | Develop caption extraction service | ML | 4 days | 2.5 | Extract native captions when available |
| 2.7 | Implement media download & storage | Backend | 3 days | 2.2-2.4 | Download videos to S3 |
| 2.8 | Create metadata storage schema | Backend | 2 days | 2.1 | Store platform-specific metadata |
| 2.9 | Set up worker status tracking | Backend | 2 days | 2.7, 2.8 | Track status of each processing step |
| 2.10 | Connect fetchers to orchestration worker | Backend | 3 days | 2.1-2.9 | Complete the flow |
| 2.11 | Implement rate-limit/back-off logic | Backend | 2 days | 2.2-2.4 | Create shared util for handling 429s across platforms |
| 2.12 | Create replayable test fixtures | QA | 3 days | 2.2-2.4 | Build sample responses for TikTok & Reddit for CI tests |
| 2.13 | Set up end-to-end tracing | DevOps | 3 days | 2.10 | Propagate traceparent in Redis messages for Node↔Python boundaries |

## Phase 3: Whisper + LLM Enrichment (Weeks 5-6)

| Task ID | Task Description | Owner | Est. Duration | Dependencies | Notes |
|---------|-----------------|-------|---------------|--------------|-------|
| 3.1 | Configure GPU Docker profile | DevOps | 2 days | 2.5 | Support GPU acceleration in local dev |
| 3.2 | Implement Whisper transcription service | ML | 4 days | 3.1 | Support both OpenAI API and local Whisper |
| 3.3 | Create transcript storage schema | Backend | 1 day | 3.2 | Store timestamps and segments |
| 3.4 | Implement GPT-4o-mini summarization | ML | 3 days | 3.2 | Generate TL;DR and tags |
| 3.5 | Build embedding generation service | ML | 3 days | 3.4 | Create vector embeddings |
| 3.6 | Set up pgvector storage | Backend | 2 days | 3.5 | Store embeddings in PostgreSQL |
| 3.7 | Integrate ML pipeline with orchestration | Backend | 4 days | 3.2-3.6 | Connect all enrichment steps |
| 3.8 | Optimize media handling for large files | ML | 3 days | 3.2 | Handle videos of different lengths |
| 3.9 | Implement content cleanup workflow | Backend | 2 days | 3.7 | Delete raw media after processing |
| 3.10 | Create prompt-versioning registry | ML | 2 days | 3.4 | Implement YAML-based prompt registry with unit tests |
| 3.11 | Develop synthetic profanity test-set | QA | 2 days | 3.2, 3.4 | Build test cases to validate content filtering pipeline |
| 3.12 | Ensure exactly-once semantics in worker chain | Backend | 3 days | 3.7 | Prevent duplicate processing in the pipeline |

## Phase 4: Vector Search & UI (Weeks 7-8)

| Task ID | Task Description | Owner | Est. Duration | Dependencies | Notes |
|---------|-----------------|-------|---------------|--------------|-------|
| 4.1 | Set up Next.js 14 web project | Frontend | 3 days | - | Configure app router & layout |
| 4.2 | Implement authentication in web app | Frontend | 2 days | 4.1 | JWT-based auth |
| 4.3 | Develop pgvector similarity queries | Backend | 3 days | 3.6 | Optimize HNSW indexes |
| 4.4 | Implement Drizzle ORM integration | Backend | 2 days | 4.3 | Type-safe database access |
| 4.5 | Create GraphQL/tRPC API for search | Backend | 4 days | 4.3, 4.4 | Expose search functionality |
| 4.6 | Build semantic search UI | Frontend | 3 days | 4.5 | Search bar with auto-suggestions |
| 4.7 | Develop infinite scroll feed | Frontend | 3 days | 4.5 | Display bookmarked content |
| 4.8 | Implement Python storyboard generator | ML | 4 days | 3.7 | Extract key frames & generate previews |
| 4.9 | Set up S3 signed uploads | Backend | 2 days | 4.8 | Secure storyboard uploads |
| 4.10 | Configure CloudFront for content delivery | DevOps | 2 days | 4.9 | Fast, cached access to storyboards |
| 4.11 | Integrate storyboards in web UI | Frontend | 3 days | 4.7, 4.10 | Display storyboards in feed |
| 4.12 | Create design system tokens | Frontend | 3 days | 4.1 | Implement colors, spacing, typography + Storybook |
| 4.13 | Perform accessibility audit | QA | 2 days | 4.6, 4.7, 4.11 | Use axe-playwright for WCAG and app-store compliance |
| 4.14 | Add Grafana Tempo exemplars | DevOps | 2 days | 2.13, 4.5 | Enhance tracing for API-to-DB spans |

## Phase 5: Payments & Cloud Deploy (Weeks 9-10)

| Task ID | Task Description | Owner | Est. Duration | Dependencies | Notes |
|---------|-----------------|-------|---------------|--------------|-------|
| 5.1 | Define subscription tiers & limits | Product | 2 days | - | Pro and Creator tier definitions |
| 5.2 | Implement Stripe integration | Backend | 4 days | 5.1 | Handle subscriptions & billing |
| 5.3 | Create subscription management UI | Frontend | 3 days | 5.2 | Allow users to manage subscriptions |
| 5.4 | Set up webhook signature validation | Backend | 2 days | 5.2 | Secure Stripe webhooks |
| 5.5 | Finalize AWS CDK infrastructure | DevOps | 4 days | 0.3 | Complete infrastructure definitions |
| 5.6 | Configure ECS Fargate services | DevOps | 3 days | 5.5 | Set up containerized services |
| 5.7 | Set up RDS PostgreSQL cluster | DevOps | 2 days | 5.5 | Configure with pgvector |
| 5.8 | Configure ElastiCache Redis cluster | DevOps | 2 days | 5.5 | Set up for production use |
| 5.9 | Set up S3 buckets & lifecycle policies | DevOps | 2 days | 5.5 | Configure Standard-IA → Glacier |
| 5.10 | Configure CloudFront distributions | DevOps | 2 days | 5.9 | Set up for production |
| 5.11 | Set up GitHub Actions CI/CD | DevOps | 3 days | 5.5-5.10 | Automate build & deployment |
| 5.12 | Implement blue-green deployment | DevOps | 3 days | 5.11 | Configure CodeDeploy |
| 5.13 | Add infrastructure drift detection | DevOps | 2 days | 5.11 | Set up CDK Diff in CI to prevent env discrepancies |
| 5.14 | Create data-retention policy documentation | Security | 2 days | 5.9 | Document S3 lifecycle, pg_dump cadence, GDPR procedures |
| 5.15 | Implement KMS key-rotation playbook | Security | 2 days | 5.5 | Create annual automated rotation tests |

## Phase 6: Beta & Hardening (Weeks 11-12)

| Task ID | Task Description | Owner | Est. Duration | Dependencies | Notes |
|---------|-----------------|-------|---------------|--------------|-------|
| 6.1 | Set up Temporal workflows | Backend | 4 days | 5.12 | For weekly digests & bulk imports |
| 6.2 | Implement MJML email templates | Frontend | 3 days | 6.1 | Create digest email templates |
| 6.3 | Configure SES/Postmark for email delivery | DevOps | 2 days | 6.2 | Set up email infrastructure |
| 6.4 | Create Grafana dashboards | DevOps | 3 days | 5.12 | Monitor system performance |
| 6.5 | Set up Prometheus alerts | DevOps | 2 days | 6.4 | Configure critical alerts |
| 6.6 | Configure PagerDuty rotation | DevOps | 1 day | 6.5 | Set up on-call rotation |
| 6.7 | Run OWASP ZAP security scan | Security | 2 days | 5.12 | Identify security vulnerabilities |
| 6.8 | Perform dependency audit | Security | 2 days | 5.12 | Check for vulnerable dependencies |
| 6.9 | Complete security checklist | Security | 3 days | 6.7, 6.8 | Verify all security measures |
| 6.10 | Set up beta user group | Product | 2 days | 5.12 | Invite initial users |
| 6.11 | Collect & implement beta feedback | All | 5 days | 6.10 | Iterate based on user feedback |
| 6.12 | Prepare for public launch | All | 3 days | 6.1-6.11 | Final checks and preparations |
| 6.13 | Run load & soak tests | QA | 3 days | 5.12 | Use k6 or Artillery to test /shares and vector search |
| 6.14 | Implement feature-flag system | Frontend/Backend | 3 days | 6.10 | Integrate GrowthBook/Unleash with Next.js |
| 6.15 | Create incident-response runbook | DevOps | 2 days | 6.6 | Define RACI, Slack channels, severity rubric |

## Phase 7: Enhancements (Post-Launch)

| Task ID | Task Description | Owner | Est. Duration | Dependencies | Notes |
|---------|-----------------|-------|---------------|--------------|-------|
| 7.1 | Implement comprehensive testing strategy | QA | 5 days | 6.12 | Jest, ts-mockito, supertest, Playwright |
| 7.2 | Set up test coverage gates | DevOps | 2 days | 7.1 | Minimum 85% coverage |
| 7.3 | Implement internationalization (i18n) | Frontend/Backend | 7 days | 6.12 | next-intl, i18next integration |
| 7.4 | Add content moderation | ML/Backend | 5 days | 6.12 | OpenAI moderations-v2 or Perspective API |
| 7.5 | Implement abuse reporting | Frontend/Backend | 3 days | 7.4 | Add report functionality |
| 7.6 | Enhance mobile store compliance | Mobile | 4 days | 6.12 | Address App Store/Play Store guidelines |
| 7.7 | Implement backup & DR strategy | DevOps | 5 days | 6.12 | pg_dump, Redis snapshots, cross-region |
| 7.8 | Create DR plan documentation | DevOps | 3 days | 7.7 | Document RTO/RPO targets |
| 7.9 | Set up PostHog analytics | Frontend/Backend | 4 days | 6.12 | Track feature usage and metrics |
| 7.10 | Create analytics dashboards | Product/DevOps | 3 days | 7.9 | Visualize usage data |
| 7.11 | Add in-app language switcher UI | Frontend | 3 days | 7.3 | Support opt-in auto-translate for summaries via GPT |
| 7.12 | Implement BI export job | DevOps | 4 days | 7.9 | Create nightly Redshift/BigQuery dump for deep analytics |