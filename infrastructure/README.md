# BookmarkAI Infrastructure

This directory contains the AWS CDK code for deploying BookmarkAI infrastructure.

## Overview

The infrastructure is organized into four main stacks:

1. **Database Stack**: PostgreSQL with pgvector and Redis
2. **API Stack**: Fastify/NestJS API service
3. **Worker Stack**: Background job processing
4. **ML Stack**: Python-based ML services

## Local Development

### Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 16+ and npm/pnpm
- AWS CDK CLI (`npm install -g aws-cdk`)

### Setup

1. Install dependencies:
pnpm install

2. Bootstrap CDK (first-time only):
pnpm cdk bootstrap --profile bookmarkai-dev

3. Synthesize CloudFormation templates:
pnpm synth

4. Deploy development environment:
pnpm deploy:dev

### Useful Commands

- `pnpm build` - Compile TypeScript
- `pnpm watch` - Watch for changes and compile
- `pnpm test` - Run tests
- `pnpm cdk diff` - Compare deployed stack with current state
- `pnpm cdk synth` - Emit synthesized CloudFormation template

## Configuration

Environment-specific configurations are stored in `cdk.json` under the `context.environments` key.