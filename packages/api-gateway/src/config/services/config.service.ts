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
    // Fix: Use string comparison, not type comparison
    return (this.get('NODE_ENV', 'development') as string) === 'production';
  }
}
