#!/bin/sh

# Initialize Vault with secrets for BookmarkAI
# This script runs inside the Docker container

set -e

# We need to wait for Vault to be ready
echo "Waiting for Vault to be ready..."
until VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=dev-token-bookmarkai vault status > /dev/null 2>&1; do
  sleep 1
done

echo "Vault is ready! Initializing secrets..."

# Set environment variables
export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=dev-token-bookmarkai

# Enable KV secrets engine version 2
vault secrets enable -path=secret kv-v2

# Create database secrets
vault kv put secret/bookmarkai/database \
    POSTGRES_USER=bookmarkai \
    POSTGRES_PASSWORD=bookmarkai_password \
    POSTGRES_DB=bookmarkai_dev

# Create API keys
vault kv put secret/bookmarkai/apikeys \
    OPENAI_API_KEY=example-api-key-replace-with-real-key

# Create JWT secrets
vault kv put secret/bookmarkai/jwt \
    JWT_SECRET=development-jwt-secret-replace-in-production \
    COOKIE_SECRET=development-cookie-secret-replace-in-production

echo "Vault initialization complete!" 