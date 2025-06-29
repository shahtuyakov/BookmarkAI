# BookmarkAI Environment Configuration

This directory contains the unified environment configuration system for all BookmarkAI services.

## Structure

```
env/
├── base.env                    # Shared variables across ALL environments and services
├── base.env.example           # Example base configuration (check this into git)
├── development/               # Development environment
│   ├── shared.env            # Dev-specific shared variables
│   ├── api-gateway.env       # API Gateway service variables
│   ├── python-services.env   # Python ML services variables
│   ├── mobile.env           # Mobile app variables
│   └── extension.env        # Browser extension variables
├── staging/                   # Staging environment
│   └── shared.env            # Staging-specific shared variables
└── production/               # Production environment
    └── shared.env            # Production-specific shared variables
```

## Variable Hierarchy

Variables are loaded in the following order (later files override earlier ones):

1. `base.env` - Base configuration for all environments
2. `{environment}/shared.env` - Environment-specific shared variables
3. `{environment}/{service}.env` - Service-specific variables

## Quick Start

1. Copy the example base configuration:
   ```bash
   cp env/base.env.example env/base.env
   ```

2. Update `env/base.env` with your actual values (API keys, passwords, etc.)

3. Run services with Docker Compose:
   ```bash
   # Development (default)
   docker-compose -f docker/docker-compose.yml up

   # Staging
   ENVIRONMENT=staging docker-compose -f docker/docker-compose.yml up

   # Production
   ENVIRONMENT=production docker-compose -f docker/docker-compose.yml up
   ```

## Variable Naming Conventions

- `DB_*` - Database configuration
- `CACHE_*` - Redis/caching configuration
- `MQ_*` - Message queue (RabbitMQ) configuration
- `STORAGE_*` - S3/MinIO object storage
- `AUTH_*` - Authentication configuration
- `ML_*` - Machine learning service configuration
- `MONITORING_*` - Observability configuration

## Service-Specific Files

### api-gateway.env
Node.js API Gateway specific configuration including:
- API port and host settings
- Service-specific feature flags
- Health check configuration

### python-services.env
Shared configuration for all Python ML services:
- Celery worker settings
- Python-specific database URLs
- Model cache directories

### mobile.env
React Native mobile app configuration:
- API endpoints
- Feature flags
- Platform-specific settings

### extension.env
Browser extension configuration:
- OAuth settings
- Extension permissions
- Browser-specific configs

## Validation

Run the validation script to check environment consistency:

```bash
npm run validate:env
# or
node scripts/validate-env.js
```

## Security Notes

- Never commit actual `.env` files to git
- Use strong, unique passwords for each environment
- Rotate secrets regularly
- Use AWS Secrets Manager for production secrets

## Migration from Old System

If you have existing `.env` files:

1. Back up your current environment files
2. Run the migration helper: `npm run migrate:env`
3. Verify all services start correctly
4. Remove old `.env` files

## Troubleshooting

### Service can't find environment variables
- Check the service's env_file configuration in docker-compose
- Verify the variable exists in the correct file
- Run the validation script

### Variable interpolation not working
- Ensure variables are defined before they're referenced
- Check for circular dependencies
- Use `${VAR:-default}` syntax for optional variables

### Different formats needed (URL vs individual vars)
- Services automatically construct URLs from individual variables
- Both formats are supported in the base configuration