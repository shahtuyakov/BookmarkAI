// scripts/seed/config.ts
import { DBConfig, RedisConfig } from './types';
import { getEnvironmentConfig } from './environments';

const envConfig = getEnvironmentConfig();

export const DB_CONFIG: DBConfig = envConfig.db;
export const REDIS_CONFIG: RedisConfig = envConfig.redis;
export const CLEAN_BEFORE_SEED: boolean = envConfig.clean;
export const MAX_RETRIES: number = envConfig.retries;