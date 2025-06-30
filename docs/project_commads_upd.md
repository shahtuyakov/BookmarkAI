## Dev commands (PNPM Optimized Monorepo)

### Installation & Setup

# Install all dependencies across the monorepo
pnpm install

# Install iOS dependencies for mobile app
cd packages/mobile/bookmarkaimobile/ios && pod install
rm -rf Pods Podfile.lock && pod deintegrate
pod cache clean --all

# Clean up
cd ios
rm -rf build/
rm -rf ~/Library/Developer/Xcode/DerivedData/BookmarkAI-*
rm -rf Pods/
rm Podfile.lock

# Clear CocoaPods cache
pod cache clean --all

pod install --repo-update

### Database Operations

# Generate database migrations
pnpm -w run db:generate

# Apply database migrations
pnpm -w run db:migrate

### Development Servers

# Start API gateway in development mode (locally)
pnpm -w run dev:api

# Run API gateway in Docker (from project root)
docker build -t bookmarkai-api-gateway -f docker/Dockerfile.api-gateway .

# Start with docker-compose (includes all dependencies)
docker compose -f docker/docker-compose.yml -f docker/docker-compose.api-gateway.yml up -d api-gateway

# Create Docker network if needed
docker network create docker_bookmarkai-network

# View API gateway logs
docker logs -f bookmarkai-api-gateway

# Start extension in development mode (hot reload)
pnpm -w run dev:extension

# Start SDK in development mode (watch/rebuild)
pnpm -w run dev:sdk

# Start mobile metro bundler
pnpm -w run mobile:metro

# Run iOS app
pnpm -w run mobile:ios

# Run Android app
pnpm -w run mobile:android

### Production Builds

# Build extension for production
pnpm -w run build:extension

# Build SDK (CommonJS + ESM + declarations)
pnpm -w run build:sdk

# Build all packages
pnpm -w run build:all

### Docker Services

# Start all Docker services
./scripts/docker-start.sh

# Stop all Docker services
./scripts/docker-stop.sh

# List all running containers
docker ps

### ML Worker Services

# Start ML workers (includes RabbitMQ, Redis, PostgreSQL if needed)
# Now includes both LLM and Whisper workers!
./scripts/start-ml-services.sh

docker compose --env-file ../env/base.env -f docker-compose.ml.yml up -d

# Stop ML workers
./scripts/stop-ml-services.sh

docker compose --env-file ../env/base.env -f docker-compose.ml.yml down

# View ML worker logs
docker logs -f bookmarkai-llm-worker
docker logs -f bookmarkai-whisper-worker
docker logs -f bookmarkai-vector-worker

# Access RabbitMQ Management UI
# URL: http://localhost:15672
# Credentials: ml/ml_password

# Monitor Celery workers with Flower (optional)
docker compose -f docker/docker-compose.ml.yml --profile monitoring up -d flower
# URL: http://localhost:5555
# Credentials: admin/bookmarkai123

# Test ML pipeline
cd packages/api-gateway && pnpm test:ml-pipeline

# Run ML worker locally for development
cd python/llm-service
python -m venv .venv
source .venv/bin/activate
pip install -e ../shared
pip install -e .
celery -A llm_service.celery_app worker --loglevel=info --queues=ml.summarize

# Run Whisper worker locally for development
cd python/whisper-service
python -m venv .venv
source .venv/bin/activate
pip install -e ../shared
pip install -e .
celery -A whisper_service.celery_app worker --loglevel=info --queues=ml.transcribe

# Run Vector worker locally for development
cd python/vector-service
python -m venv .venv
source .venv/bin/activate
pip install -e ../shared
pip install -e .
celery -A vector_service.celery_app worker --loglevel=info --queues=ml.embed

### Database Management

# Get the port of the postgres container
docker port docker-postgres-1

# Connect to the PostgreSQL container
docker exec -it docker-postgres-1 bash

# Inside the container, connect with the correct user and database
psql -U bookmarkai -d bookmarkai_dev

# List all tables
\dt

# Check structure of specific tables (if they exist)
\d users
\d shares
\d transcripts
\d embeddings

# Exit psql
\q

# Check ML results table
\d ml_results
SELECT * FROM ml_results;

# Check transcription costs table
\d transcription_costs
SELECT * FROM transcription_costs;

# View cost analytics
SELECT * FROM transcription_cost_analytics;

# Check vector embeddings and costs
\d vector_costs
SELECT * FROM vector_costs ORDER BY created_at DESC LIMIT 5;

# View vector budget status
SELECT * FROM vector_budget_status;

# View hourly vector costs
SELECT * FROM hourly_vector_costs ORDER BY hour DESC LIMIT 10;

# Check embeddings with pgvector
\d embeddings
SELECT COUNT(*) FROM embeddings;

# Find similar embeddings (example)
SELECT share_id, 1 - (embedding <=> '[0.1, 0.2, ...]'::vector) AS similarity 
FROM embeddings 
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector 
LIMIT 10;

# Test Redis connectivity
docker exec -it docker-redis-1 redis-cli ping

### Whisper Service & Video Transcription

# Test Whisper worker with direct RabbitMQ message
cd packages/api-gateway
node test-whisper-direct.js

# Test with TikTok URL (requires yt-dlp)
node test-whisper-tiktok.js

# Install yt-dlp locally (macOS)
brew install yt-dlp
# or
pip3 install yt-dlp

# Check yt-dlp installation
yt-dlp --version

# Rebuild Whisper Docker image after changes
docker compose -f docker/docker-compose.ml.yml build whisper-worker

# View Whisper worker environment
docker exec bookmarkai-whisper-worker env | grep OPENAI

# Test video URL extraction (TikTok)
yt-dlp --dump-json --no-download "https://www.tiktok.com/@user/video/123"

### Vector Embedding Service

# Test vector embedding task
cd packages/api-gateway
node test-embedding-task.js

# Run full vector integration test
./scripts/test-vector-integration.sh

# Test vector migration
./scripts/test-vector-migration.sh

# Monitor vector worker metrics
curl http://localhost:9093/metrics | grep ml_embeddings

# Check vector service health
docker exec bookmarkai-vector-worker python -c "from vector_service.tasks import health_check; print(health_check())"

# Rebuild vector Docker image after changes
docker compose -f docker/docker-compose.ml.yml build vector-worker

# View vector worker environment
docker exec bookmarkai-vector-worker env | grep VECTOR

### Infrastructure (AWS CDK)

# Install infrastructure dependencies
cd infrastructure && pnpm install

# Synthesize CloudFormation templates
cd infrastructure && pnpm run synth

# Deploy infrastructure
cd infrastructure && pnpm run deploy

### Mobile Development

# Setup ngrok tunnel for mobile app
export NGROK_AUTH_TOKEN=your_token_here
pnpm -w run dev:tunnel

# Alternative: Direct React Native metro (legacy)
cd packages/mobile/bookmarkaimobile && npx react-native start

### Extension Builds

# Development build (hot reload)
pnpm -w run dev:extension

# Production build
pnpm -w run build:extension

# SDK build variant (includes unified auth)
pnpm --filter @bookmarkai/extension build:sdk

### Quality Assurance

# Test all packages
pnpm -w run test:all

# Lint all packages
pnpm -w run lint:all

# Type check all packages
pnpm -w run typecheck:all

### Dependency Management

# Check for outdated dependencies
pnpm -w run deps:check

# Update dependencies
pnpm -w run deps:update

### Git Hooks

# Enable pre-commit hooks
npx husky install

# Disable pre-commit hooks
npx husky uninstall

## Quick Reference

### Available Workspace Packages:
- `api-gateway` - NestJS backend API
- `@bookmarkai/extension` - Browser extension
- `@bookmarkai/sdk` - TypeScript SDK  
- `@bookmarkai/mobile` - React Native mobile app
- Other packages: web, shared, fetchers, orchestrator

### Python ML Services:
- `python/llm-service` - LLM summarization worker ✓
- `python/whisper-service` - Audio/video transcription ✓ (OpenAI Whisper API)
- `python/vector-service` - Text embeddings ✓ (OpenAI text-embedding-3)
- `python/caption-service` - Image captioning (planned)
- `python/shared` - Shared Celery configuration ✓

### Common Filter Commands:
```bash
# Run specific package commands
pnpm --filter api-gateway start:dev
pnpm --filter @bookmarkai/extension dev
pnpm --filter @bookmarkai/mobile ios
pnpm --filter @bookmarkai/sdk build
pnpm --filter @bookmarkai/sdk dev
pnpm --filter @bookmarkai/sdk generate

# Run commands across multiple packages  
pnpm -r build    # Build all packages
pnpm -r test     # Test all packages
pnpm -r lint     # Lint all packages
```

### SDK-Specific Commands:
```bash
# Development (from root)
pnpm -w run dev:sdk              # Watch mode with auto-rebuild
pnpm -w run build:sdk            # Production build

# Direct commands (more options)
pnpm --filter @bookmarkai/sdk dev        # Watch mode  
pnpm --filter @bookmarkai/sdk build      # Build bundles + declarations
pnpm --filter @bookmarkai/sdk test       # Run SDK tests
pnpm --filter @bookmarkai/sdk lint       # Lint SDK code
pnpm --filter @bookmarkai/sdk generate   # Regenerate API client from OpenAPI
pnpm --filter @bookmarkai/sdk typecheck  # Type checking
```

### PNPM Optimizations Applied:
✅ Unified dependency versions via catalogs  
✅ Zero deprecated dependency warnings  
✅ React Native compatibility with isolated node-linker  
✅ Faster installs with content-addressable storage  
✅ Cross-platform SDK compatibility (web/mobile/extension)

### Contract Testing

# Build shared test matchers package
pnpm --filter @bookmarkai/test-matchers build

# Run consumer contract tests (React Native)
pnpm --filter @bookmarkai/mobile test:contracts

# Run provider verification (requires running API)
# First start PostgreSQL and Redis:
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name postgres postgres:15
docker run -d -p 6379:6379 --name redis redis:7

# Then in api-gateway:
pnpm --filter api-gateway db:migrate
pnpm --filter api-gateway start:test  # In one terminal
pnpm --filter api-gateway test:contracts:verify  # In another terminal

# Generate types from OpenAPI
pnpm --filter api-gateway generate:types
pnpm --filter api-gateway generate:all  # For all platforms

# View generated pact contracts
cat packages/mobile/bookmarkaimobile/pacts/*.json | jq .

# Run CI contract test pipeline locally
./test-contracts-local.sh

### Native Platform Contract Tests

# iOS contract tests
cd ios && xcodebuild test -scheme BookmarkAI -destination 'platform=iOS Simulator,name=iPhone 14' -only-testing:BookmarkAITests/ContractTests

# Android contract tests  
cd android && ./gradlew testDebugUnitTest --tests "*ContractTest*"

### Troubleshooting

# Clean Docker build cache
docker builder prune -f

# Remove all stopped containers
docker container prune -f

# Check disk space used by Docker
docker system df

# Clean up everything (WARNING: removes all Docker data)
docker system prune -a

# Fix pnpm module resolution issues
pnpm store prune
pnpm install --force

# Check which process is using a port (e.g., 3001)
lsof -i :3001

# Kill process using a port
kill -9 $(lsof -t -i:3001)

# Verify environment variables
printenv | grep -E "(DATABASE|REDIS|RABBITMQ|OPENAI)"

# Check ML worker queue status
docker exec -it ml-rabbitmq rabbitmqctl list_queues

# Debug RabbitMQ connections
docker exec -it ml-rabbitmq rabbitmqctl list_connections

# Clear Redis cache
docker exec -it docker-redis-1 redis-cli FLUSHALL