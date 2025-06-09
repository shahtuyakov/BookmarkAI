## Dev commands (PNPM Optimized Monorepo)

### Installation & Setup

# Install all dependencies across the monorepo
pnpm install

# Install iOS dependencies for mobile app
cd packages/mobile/bookmarkaimobile/ios && pod install
rm -rf Pods Podfile.lock && pod deintegrate
pod cache clean --all
pod install --repo-update

### Database Operations

# Generate database migrations
pnpm -w run db:generate

# Apply database migrations
pnpm -w run db:migrate

### Development Servers

# Start API gateway in development mode
pnpm -w run dev:api

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

# Test Redis connectivity
docker exec -it docker-redis-1 redis-cli ping

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
