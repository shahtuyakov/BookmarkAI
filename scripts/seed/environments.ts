// scripts/seed/environments.ts
import { DBConfig, RedisConfig } from './types';

interface Environment {
  db: DBConfig;
  redis: RedisConfig;
  clean: boolean;
  retries: number;
}

const environments: Record<string, Environment> = {
  development: {
    db: {
      host: 'localhost',
      port: 5433,
      user: 'bookmarkai',
      password: 'bookmarkai_password',
      database: 'bookmarkai_dev'
    },
    redis: {
      host: 'localhost',
      port: 6379
    },
    clean: false,
    retries: 3
  },
  
  'ci-local': {
    db: {
      host: 'localhost',
      port: 5433,
      user: 'bookmarkai',
      password: 'bookmarkai_password',
      database: 'bookmarkai_dev'
    },
    redis: {
      host: 'localhost',
      port: 6379
    },
    clean: true,  // Clean by default for CI testing
    retries: 2
  },
  
  test: {
    db: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5433),
      user: process.env.DB_USER || 'bookmarkai',
      password: process.env.DB_PASSWORD || 'bookmarkai_password',
      database: process.env.DB_NAME || 'bookmarkai_test'
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379)
    },
    clean: true,
    retries: 2
  },
  
  ci: {
    db: {
      host: process.env.DB_HOST || 'postgres',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'bookmarkai',
      password: process.env.DB_PASSWORD || 'bookmarkai_password',
      database: process.env.DB_NAME || 'bookmarkai'
    },
    redis: {
      host: process.env.REDIS_HOST || 'redis',
      port: Number(process.env.REDIS_PORT || 6379)
    },
    clean: true,
    retries: 1
  }
};

export function getEnvironmentConfig(): Environment {
  const env = process.env.NODE_ENV || 'development';
  
  // Add debug logging to help troubleshoot environment selection
  console.log(`Using environment: ${env}`);
  
  if (!environments[env]) {
    console.warn(`Environment '${env}' not found, falling back to development`);
    return environments.development;
  }
  
  return environments[env];
}