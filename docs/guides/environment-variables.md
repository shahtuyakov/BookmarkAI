# Environment Variables Guide

This document provides a comprehensive guide to environment variables used in the BookmarkAI project.

## Overview

BookmarkAI uses environment variables for configuration across all services. The variables are organized into logical categories and documented in the `.env.example` file at the project root.

## Setting Up Environment Variables

1. Copy the template to create your local environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file to customize values for your environment.

3. For local development, the environment variables will be automatically loaded via direnv (configured in Task 0.9).

## Variable Categories

The environment variables are organized into the following categories:

### Infrastructure / Deployment
Variables related to AWS and deployment infrastructure.

### Database Configuration
PostgreSQL and Redis connection parameters.

### Object Storage
MinIO/S3 configuration for media and storyboard storage.

### API Configuration
Settings for the API service, including port, CORS, and rate limiting.

### Authentication
JWT and cookie configuration for authentication.

### Worker Configuration
Settings for background processing workers.

### ML Services
Configuration for AI/ML services, including OpenAI API keys and model selection.

### Monitoring/Observability
Logging, tracing, and metrics configuration.

### Security & Secrets Management
Vault integration and secrets handling.

### Development Tools
Configuration for development utilities (pgAdmin, ngrok, etc.).

## Testing Environment Configuration

A test script is provided to verify your environment configuration:

```bash
node test-env.js
```

This script checks that essential environment variables are properly set.

## Sensitive Information

Sensitive information (API keys, passwords, etc.) should never be committed to the repository. Use the Vault integration (Task 0.9) for managing secrets in development.

## Docker Environment Integration

The Docker Compose configuration automatically uses variables from your `.env` file. Make sure the variable names in your `.env` file match those expected by the Docker services.

## Production Considerations

For production deployment:
- Use AWS Parameter Store or Secrets Manager instead of `.env` files
- Configure AWS CDK to use these secrets during deployment
- Ensure proper encryption for sensitive variables
- Follow the principle of least privilege for service access

## Adding New Variables

When adding new environment variables:
1. Update the `.env.example` file with the new variable
2. Add a descriptive comment explaining its purpose
3. Include default values where appropriate
4. Document whether the variable is required or optional
5. Update relevant documentation