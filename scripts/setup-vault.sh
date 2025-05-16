#!/usr/bin/env bash

# Script to set up and run a Vault development server for BookmarkAI
set -e

echo "Setting up Vault development server for BookmarkAI..."

# Check if Vault is installed
if ! command -v vault &> /dev/null; then
    echo "Vault not found. Please install Vault first."
    echo "Visit https://developer.hashicorp.com/vault/tutorials/getting-started/getting-started-install"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "jq not found. Please install jq for JSON processing."
    echo "Visit https://stedolan.github.io/jq/download/"
    exit 1
fi

# Data directory for Vault
DATA_DIR="$(pwd)/.vault-data"
mkdir -p "$DATA_DIR"

# Start Vault development server
echo "Starting Vault development server..."
vault server -dev -dev-root-token-id=dev-token-bookmarkai -dev-listen-address=127.0.0.1:8200 &
VAULT_PID=$!

# Sleep for a moment to let Vault start
sleep 2

# Export environment variables
export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=dev-token-bookmarkai

echo "Vault server running on $VAULT_ADDR"
echo "Root token: $VAULT_TOKEN"

# Enable the KV secrets engine version 2
echo "Enabling KV secrets engine..."
vault secrets enable -path=secret kv-v2

# Create some example secrets
echo "Creating example secrets in Vault..."

# Database secrets
vault kv put secret/bookmarkai/database \
    POSTGRES_USER=postgres \
    POSTGRES_PASSWORD=development_password_change_me

# API keys
vault kv put secret/bookmarkai/apikeys \
    OPENAI_API_KEY=example-api-key-replace-with-real-key

# JWT secrets
vault kv put secret/bookmarkai/jwt \
    JWT_SECRET=development-jwt-secret-replace-in-production \
    COOKIE_SECRET=development-cookie-secret-replace-in-production

echo "Vault setup complete!"
echo ""
echo "To use these secrets:"
echo "1. Export the following in your shell:"
echo "   export VAULT_ADDR=http://127.0.0.1:8200"
echo "   export VAULT_TOKEN=dev-token-bookmarkai"
echo ""
echo "2. Retrieve secrets with:"
echo "   vault kv get secret/bookmarkai/database"
echo "   vault kv get secret/bookmarkai/apikeys"
echo ""
echo "Press CTRL+C to stop the Vault server when you're done."

# Keep the script running
wait $VAULT_PID 