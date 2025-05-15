# BookmarkAI

BookmarkAI captures social-media content (TikTok, Reddit, X) via user-initiated sharing, enriches it with AI summaries/transcripts, and resurfaces items through search, digests, and integrations.

## Development Environment Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [PNPM](https://pnpm.io/) v8 or higher
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- [Git](https://git-scm.com/)

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/your-organization/bookmarkai.git
   cd bookmarkai
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create an environment variables file:
   ```bash
   touch .env
   ```
   Add the following environment variables to the `.env` file:
   
   ```
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5433
   DB_USER=bookmarkai
   DB_PASSWORD=bookmarkai_password
   DB_NAME=bookmarkai_dev
   
   # Redis Configuration
   REDIS_HOST=localhost
   REDIS_PORT=6379
   
   # MinIO / S3 Configuration
   S3_ENDPOINT=http://localhost:9000
   S3_ACCESS_KEY=minioadmin
   S3_SECRET_KEY=minioadmin
   S3_BUCKET=bookmarkai-dev
   ```

4. Start the development environment:
   ```bash
   # Start all Docker services
   cd docker
   docker-compose up -d
   ```

5. Run database migrations and seed the database:
   ```bash
   pnpm run seed:all
   ```

### Docker Services

The project uses several Docker services:

- **PostgreSQL** (port 5433): Database with pgvector extension for vector similarity search
- **Redis** (port 6379): Used for caching and message queues
- **MinIO** (ports 9000, 9001): S3-compatible object storage
- **Grafana** (port 3000): Visualization for metrics and logs
- **Loki** (port 3100): Log aggregation
- **Tempo** (ports 14268, 3200, 9411): Distributed tracing
- **Prometheus** (port 9090): Metrics collection

### Project Structure

The project follows a monorepo structure with PNPM workspaces:

- `packages/`: Contains TypeScript packages
  - `api-gateway/`: NestJS/Fastify API service
  - `extension/`: Browser WebExtension
  - `fetchers/`: Content fetching modules
  - `mobile/`: React Native mobile app
  - `orchestrator/`: Task orchestration service
  - `shared/`: Shared utilities and types
  - `web/`: Next.js web application

- `python/`: Contains Python services
  - `caption-service/`: Extracts captions from videos
  - `llm-service/`: LLM-based summarization and tagging
  - `vector-service/`: Vector embedding generation
  - `whisper-service/`: Speech-to-text transcription
  - `shared/`: Shared Python utilities

- `docker/`: Docker Compose configurations and init scripts
- `scripts/`: Development and seeding scripts
- `infrastructure/`: AWS CDK infrastructure definitions

### Development Workflow

#### Running Services Locally

Each package can be run independently:

```bash
# Example: Run the API gateway
cd packages/api-gateway
pnpm dev
```

#### Seeding Data

The project includes several seeding scripts:

```bash
# Seed all data
pnpm run seed:all

# Seed specific data types
pnpm run seed:users
pnpm run seed:shares
pnpm run seed:transcripts
pnpm run seed:embeddings
```

#### Accessing Services

- API Gateway: http://localhost:3001
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)
- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090

## Developer Context System

This project uses a structured context tracking system:

- `PROJECT_CONTEXT.md` - Current project status
- `docs/context/daily/` - Daily developer journals
- `docs/context/tasks/` - Task-specific documentation

New developers should review these documents to understand the project status.

Daily workflow:
1. Run `./scripts/gen-daily-journal.sh` to create today's journal
2. Update your journal throughout the day
3. Reference task IDs in commits with `[type](task-id): message`

## Troubleshooting

### Common Issues

1. **Docker services not starting**: Ensure Docker is running and you have sufficient resources allocated.

2. **Database connection issues**: Check if the PostgreSQL service is running and the connection details in your `.env` file are correct.

3. **Permission errors with seed scripts**: Make sure you have proper permissions to run the scripts. Try running with sudo if necessary.

### Getting Help

If you encounter issues not covered in this documentation, please:

1. Check the project issues on GitHub
2. Review the daily journals for recent discussions
3. Reach out to the team on the project's communication channel