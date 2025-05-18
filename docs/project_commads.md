## Dev commands

# Run generate migrations

cd packages/api-gateway && pnpm db:generate

# Run apply migrations

cd packages/api-gateway && pnpm db:migrate

# Run api gateway for development

cd packages/api-gateway && npm run start:dev

# Install dependencies for mobile app

cd packages/mobile/bookmarkaimobile && npm install

# Install ios dependencies for mobile app

cd packages/mobile/bookmarkaimobile/ios && pod install

# Run ios app

cd packages/mobile/bookmarkaimobile && npx react-native run-ios

# Run android app

cd packages/mobile/bookmarkaimobile && npx react-native run-android

# Start them again

./scripts/docker-start.sh

# Stop all services

./scripts/docker-stop.sh

# List all running containers

docker ps

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

# Install dependencies for infrastructure

cd infrastructure && pnpm install

# Run synth for infrastructure

cd infrastructure && pnpm run synth

# Run deploy for infrastructure

cd infrastructure && pnpm run deploy

# Disable the Husky pre-commit hooks

npx husky uninstall

# Enable the Husky pre-commit hooks

npx husky install
