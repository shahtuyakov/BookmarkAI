#!/bin/bash

# BookmarkAI Environment Setup Helper
# This script helps set up the new environment structure

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_DIR="$PROJECT_ROOT/env"

echo "🚀 BookmarkAI Environment Setup"
echo "==============================="

# Check if env directory exists
if [ ! -d "$ENV_DIR" ]; then
    echo "❌ Error: env directory not found at $ENV_DIR"
    exit 1
fi

# Function to setup environment
setup_environment() {
    local env_name=$1
    
    if [ ! -f "$ENV_DIR/base.env" ]; then
        if [ -f "$ENV_DIR/base.env.example" ]; then
            echo "📄 Creating base.env from example..."
            cp "$ENV_DIR/base.env.example" "$ENV_DIR/base.env"
            echo "⚠️  Please update $ENV_DIR/base.env with your actual values!"
        else
            echo "❌ Error: base.env.example not found!"
            exit 1
        fi
    else
        echo "✅ base.env already exists"
    fi
    
    # Check environment-specific files
    if [ ! -f "$ENV_DIR/$env_name/shared.env" ]; then
        echo "⚠️  Warning: $ENV_DIR/$env_name/shared.env not found"
    fi
}

# Function to migrate old env files
migrate_old_env() {
    echo ""
    echo "🔄 Checking for old .env files to migrate..."
    
    local migrated=0
    
    # Check root .env
    if [ -f "$PROJECT_ROOT/.env" ]; then
        echo "Found .env in project root"
        echo "→ You may want to review and migrate relevant variables to env/base.env"
        migrated=$((migrated + 1))
    fi
    
    # Check service-specific .env files
    for service_dir in "$PROJECT_ROOT/packages/api-gateway" "$PROJECT_ROOT/python/llm-service"; do
        if [ -f "$service_dir/.env" ]; then
            local service_name=$(basename "$service_dir")
            echo "Found .env in $service_name"
            echo "→ Consider migrating to env/development/${service_name}.env"
            migrated=$((migrated + 1))
        fi
    done
    
    if [ $migrated -eq 0 ]; then
        echo "✅ No old .env files found"
    else
        echo ""
        echo "📝 Migration tips:"
        echo "1. Copy shared variables (DB, Redis, etc.) to env/base.env"
        echo "2. Copy environment-specific overrides to env/{environment}/shared.env"
        echo "3. Copy service-specific variables to env/{environment}/{service}.env"
        echo "4. Run 'npm run validate:env' to check consistency"
    fi
}

# Main setup
echo ""
echo "Setting up development environment..."
setup_environment "development"

# Offer to set up other environments
echo ""
read -p "Set up staging environment? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    setup_environment "staging"
fi

echo ""
read -p "Set up production environment? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    setup_environment "production"
fi

# Check for migration
migrate_old_env

# Run validation
echo ""
echo "🔍 Running environment validation..."
if command -v node &> /dev/null; then
    node "$SCRIPT_DIR/validate-env.js" || true
else
    echo "⚠️  Node.js not found, skipping validation"
fi

echo ""
echo "✅ Environment setup complete!"
echo ""
echo "Next steps:"
echo "1. Update env/base.env with your actual values"
echo "2. Run 'docker-compose -f docker/docker-compose.yml up' to start services"
echo "3. Use 'ENVIRONMENT=staging' or 'ENVIRONMENT=production' to switch environments"