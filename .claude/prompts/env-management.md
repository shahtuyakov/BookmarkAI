# Environment Management Prompt

I need to work with environment variables for {SERVICE_NAME} in {ENVIRONMENT} environment.

## Environment Structure
BookmarkAI uses a hierarchical environment system:

```
env/
├── base.env                    # Shared across ALL environments/services
├── development/               
│   ├── shared.env            # Dev-specific shared variables
│   ├── api-gateway.env       # API Gateway service variables
│   ├── python-services.env   # Python ML services variables
│   ├── mobile.env           # Mobile app variables
│   └── extension.env        # Browser extension variables
├── staging/shared.env        # Staging environment
└── production/shared.env     # Production environment
```

## Variable Loading Order (later overrides earlier):
1. `base.env` - Base configuration
2. `{environment}/shared.env` - Environment-specific shared
3. `{environment}/{service}.env` - Service-specific

## Task Request:
{DESCRIBE_TASK}

## Expected Actions:
1. Check relevant environment files for the service/environment
2. Validate environment variable naming conventions:
   - `DB_*` - Database configuration
   - `CACHE_*` - Redis/caching 
   - `MQ_*` - RabbitMQ message queue
   - `STORAGE_*` - S3/MinIO storage
   - `AUTH_*` - Authentication
   - `ML_*` - Machine learning services
   - `MONITORING_*` - Observability

3. Verify environment setup with validation:
   ```bash
   npm run validate:env
   ```

4. Test service startup with environment:
   ```bash
   # Development
   docker-compose -f docker/docker-compose.yml up
   
   # Staging  
   ENVIRONMENT=staging docker-compose -f docker/docker-compose.yml up
   ```

## Security Reminders:
- Never commit actual .env files to git
- Use env/base.env.example as template
- Verify variables exist in correct hierarchy level
- Check for sensitive data exposure

Please help with environment configuration following this structure.