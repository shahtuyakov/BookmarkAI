# Task 1.1 Implementation: NestJS+Fastify Project Structure

## Overview

This document details the implementation of Task 1.1: "Create NestJS+Fastify project structure" for the BookmarkAI project, following the modular monolith architecture defined in ADR-001.

## Objectives

1. Establish NestJS application with Fastify adapter
2. Create modular architecture with proper domain boundaries
3. Set up core infrastructure modules (config, database)
4. Implement a basic health check endpoint
5. Integrate with existing Drizzle ORM database setup

## Implementation Process

We followed a step-by-step approach to implement the modular monolith architecture:

### 1. Environment Setup

Added NestJS and Fastify dependencies to the existing package.json:

```bash
pnpm add @nestjs/common @nestjs/core @nestjs/platform-fastify fastify reflect-metadata
pnpm add class-validator class-transformer
pnpm add -D @nestjs/cli typescript ts-node
```

### 2. TypeScript Configuration

Created a TypeScript configuration file (`tsconfig.json`) optimized for NestJS:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

### 3. Application Entry Point

Created the main application entry point (`src/main.ts`) with Fastify adapter:

```typescript
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // Create a Fastify-based NestJS application
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true })
  );

  // Apply global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );

  // Set global prefix for all routes
  app.setGlobalPrefix('api');

  // Enable CORS for development
  app.enableCors();

  // Start the server
  const port = process.env.PORT || 3001;
  const host = process.env.HOST || '0.0.0.0';
  
  await app.listen(port, host);
  console.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap();
```

### 4. Root Module

Implemented the root application module (`src/app.module.ts`):

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Root module for BookmarkAI API Gateway
 * Follows the modular monolith architecture (ADR-001)
 */
@Module({
  imports: [
    // Core infrastructure modules
    ConfigModule,
    DatabaseModule,
    
    // Feature modules
    HealthModule,
    // More modules will be added as they're implemented
  ],
})
export class AppModule {}
```

### 5. Configuration Module

Created a global configuration module for environment variables:

```typescript
// src/config/config.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigService } from './services/config.service';

@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
```

```typescript
// src/config/services/config.service.ts
import { Injectable } from '@nestjs/common';
import * as dotenv from 'dotenv';

@Injectable()
export class ConfigService {
  private readonly envConfig: Record<string, string>;

  constructor() {
    // Load environment variables from .env file
    dotenv.config();
    this.envConfig = process.env;
  }

  /**
   * Get an environment variable
   * @param key The key to look up
   * @param defaultValue Optional default value
   */
  get<T = string>(key: string, defaultValue?: T): T {
    const value = this.envConfig[key];
    
    if (value === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Configuration key "${key}" not found`);
    }

    // Handle numeric values
    if (typeof defaultValue === 'number') {
      return Number(value) as unknown as T;
    }
    
    // Handle boolean values
    if (typeof defaultValue === 'boolean') {
      return (value === 'true') as unknown as T;
    }
    
    return value as unknown as T;
  }

  /**
   * Check if running in production environment
   */
  isProduction(): boolean {
    // Fixed type comparison issue
    return this.get('NODE_ENV', 'development') as string === 'production';
  }
}
```

### 6. Database Module

Created a database module that integrates with the existing Drizzle ORM setup:

```typescript
// src/database/database.module.ts
import { Module, Global } from '@nestjs/common';
import { DrizzleService } from './services/drizzle.service';

@Global()
@Module({
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class DatabaseModule {}
```

```typescript
// src/database/services/drizzle.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../db/schema';

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  private db: ReturnType<typeof drizzle>;

  constructor() {
    // Create PostgreSQL connection pool
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: Number(process.env.POSTGRES_PORT) || 5433,
      user: process.env.POSTGRES_USER || 'bookmarkai',
      password: process.env.POSTGRES_PASSWORD || 'bookmarkai_password',
      database: process.env.POSTGRES_DB || 'bookmarkai_dev',
    });

    // Create drizzle instance
    this.db = drizzle(this.pool, { schema });
  }

  // Get the database instance
  get database() {
    return this.db;
  }

  // Execute raw SQL (useful for health checks)
  async query(text: string, params: any[] = []): Promise<any> {
    return this.pool.query(text, params);
  }

  // Lifecycle hooks
  async onModuleInit() {
    // Test connection when module initializes
    try {
      await this.pool.query('SELECT 1');
      console.log('Database connection established');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    // Close the pool when the application shuts down
    await this.pool.end();
    console.log('Database connection closed');
  }
}
```

### 7. Health Module

Implemented a basic health module with database connectivity check:

```typescript
// src/modules/health/health.module.ts
import { Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

```typescript
// src/modules/health/controllers/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { DrizzleService } from '../../../database/services/drizzle.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DrizzleService) {}

  @Get()
  async check() {
    // Check database connection
    const dbStatus = await this.checkDatabase();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
      },
    };
  }

  private async checkDatabase() {
    try {
      await this.db.query('SELECT 1');
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', error: error.message };
    }
  }
}
```

### 8. Custom Type Fix for pgvector

Fixed the Drizzle ORM custom type for vector columns:

```typescript
// src/db/schema/embeddings.ts
import { pgTable, uuid, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';
import { shares } from './shares';

// Create a function that returns a custom vector type with specified dimensions
function vectorWithDimensions(dimensions: number) {
  return customType<{ data: number[] }>({
    dataType() {
      return `vector(${dimensions})`;
    },
  });
}

export const embeddings = pgTable('embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  shareId: uuid('share_id')
    .notNull()
    .references(() => shares.id, { onDelete: 'cascade' }),
  // Use the vector type with dimensions
  embedding: vectorWithDimensions(1536)('embedding').notNull(),
  dimensions: integer('dimensions').notNull().default(1536),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    shareIdIdx: index('idx_embeddings_share_id').on(table.shareId),
  };
});
```

### 9. Environment Configuration

Created `.env` file with necessary configuration:

```
# Server settings
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Database settings
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=bookmarkai
POSTGRES_PASSWORD=bookmarkai_password
POSTGRES_DB=bookmarkai_dev
```

### 10. Package.json Scripts

Added NestJS scripts to package.json:

```json
"scripts": {
  "build": "nest build",
  "format": "prettier --write \"src/**/*.ts\"",
  "start": "nest start",
  "start:dev": "nest start --watch",
  "start:debug": "nest start --debug --watch",
  "start:prod": "node dist/main",
  "test": "jest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "ts-node --transpile-only src/db/migrate.ts",
  "db:studio": "drizzle-kit studio"
}
```

## Challenges and Solutions

### 1. TypeScript Type Comparison

**Issue**: TypeScript error in config.service.ts regarding comparison of string literals.
```
error TS2367: This comparison appears to be unintentional because the types '"development"' and '"production"' have no overlap.
```

**Solution**: Cast the return value to string before comparison.
```typescript
return this.get('NODE_ENV', 'development') as string === 'production';
```

### 2. Custom Vector Type

**Issue**: Error with pgvector custom type implementation in Drizzle ORM.
```
error TS2339: Property 'asType' does not exist on type 'SQL<unknown>'.
```

**Solution**: Updated the custom type implementation to match Drizzle ORM v0.43.1 API.
```typescript
function vectorWithDimensions(dimensions: number) {
  return customType<{ data: number[] }>({
    dataType() {
      return `vector(${dimensions})`;
    },
  });
}
```

### 3. Port Conflict

**Issue**: Port 3000 already in use.
```
Error: listen EADDRINUSE: address already in use 0.0.0.0:3000
```

**Solution**: Changed to port 3001 in main.ts and .env files.

## Testing

We confirmed the successful implementation by:

1. Starting the NestJS application
2. Verifying all modules initialized correctly 
3. Checking that the server was listening on port 3001
4. Accessing the health endpoint at `/api/health`

The health endpoint returned a successful response with database status information.

## Project Structure

The final project structure follows modular monolith architecture:

```
packages/api-gateway/
├── src/
│   ├── config/
│   │   ├── config.module.ts
│   │   └── services/
│   │       └── config.service.ts
│   ├── database/
│   │   ├── database.module.ts
│   │   └── services/
│   │       └── drizzle.service.ts
│   ├── db/
│   │   ├── schema/
│   │   │   ├── embeddings.ts  (fixed)
│   │   │   ├── metadata.ts    (existing)
│   │   │   ├── shares.ts      (existing)
│   │   │   ├── transcripts.ts (existing)
│   │   │   └── users.ts       (existing)
│   │   ├── migrations/        (existing)
│   │   └── migrate.ts         (existing)
│   ├── modules/
│   │   └── health/
│   │       ├── health.module.ts
│   │       └── controllers/
│   │           └── health.controller.ts
│   ├── app.module.ts
│   └── main.ts
├── .env
├── package.json
└── tsconfig.json
```

## Next Steps

With Task 1.1 completed, the project is ready to proceed with:

1. **Task 1.2**: Implement JWT auth middleware
   - Create AuthModule with JWT strategy
   - Implement login/register endpoints
   - Set up AuthGuard for protected routes

2. **Task 1.3**: Develop health check endpoint (expand current implementation)
   - Add more detailed system checks
   - Integrate with @nestjs/terminus
   - Add Redis connectivity check

3. **Task 1.4**: Implement /shares endpoint
   - Create SharesModule with CRUD operations
   - Integrate with existing Drizzle schema
   - Implement pagination and filtering

## Conclusion

The implementation of Task 1.1 establishes a solid foundation for the BookmarkAI backend, following the modular monolith architecture defined in ADR-001. The structure is designed to be maintainable, extensible, and prepared for future growth.