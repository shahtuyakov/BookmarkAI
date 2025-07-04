import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../config/services/config.service';
import { readFileSync, existsSync, watchFile } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { RateLimitConfig } from '../interfaces/rate-limiter.interface';

@Injectable()
export class RateLimitConfigService {
  private readonly logger = new Logger(RateLimitConfigService.name);
  private configs: Map<string, RateLimitConfig> = new Map();
  private configPath: string;
  private watchEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    // Look for config file in project root, not relative to api-gateway
    const projectRoot = join(__dirname, '..', '..', '..', '..', '..', '..');
    this.configPath = this.configService.get(
      'RATE_LIMIT_CONFIG_PATH',
      join(projectRoot, 'config', 'rate-limits.yaml'),
    );
    this.watchEnabled = this.configService.get('RATE_LIMIT_CONFIG_WATCH', true);
  }

  async onModuleInit() {
    await this.loadConfigurations();

    if (this.watchEnabled && existsSync(this.configPath)) {
      this.watchConfigFile();
    }
  }

  getConfig(service: string): RateLimitConfig | undefined {
    return this.configs.get(service);
  }

  getAllConfigs(): Map<string, RateLimitConfig> {
    return new Map(this.configs);
  }

  private async loadConfigurations(): Promise<void> {
    try {
      if (!existsSync(this.configPath)) {
        this.logger.warn(`Rate limit config file not found at ${this.configPath}, using defaults`);
        this.loadDefaultConfigs();
        return;
      }

      const fileContent = readFileSync(this.configPath, 'utf-8');
      const parsed = parse(fileContent);

      if (!parsed.services) {
        throw new Error('Invalid config file: missing "services" key');
      }

      this.configs.clear();

      for (const [serviceName, serviceConfig] of Object.entries(parsed.services)) {
        const config = this.validateAndTransformConfig(serviceName, serviceConfig as any);
        this.configs.set(serviceName, config);
      }

      this.logger.log(`Loaded ${this.configs.size} rate limit configurations from ${this.configPath}`);
    } catch (error) {
      this.logger.error('Failed to load rate limit configurations', error);
      this.loadDefaultConfigs();
    }
  }

  private validateAndTransformConfig(
    serviceName: string,
    rawConfig: any,
  ): RateLimitConfig {
    // Validate required fields
    if (!rawConfig.limits || !Array.isArray(rawConfig.limits)) {
      throw new Error(`Invalid config for ${serviceName}: missing or invalid "limits"`);
    }

    if (!rawConfig.backoff) {
      throw new Error(`Invalid config for ${serviceName}: missing "backoff"`);
    }

    // Transform limits based on algorithm
    const algorithm = rawConfig.algorithm || 'sliding_window';
    const limits = rawConfig.limits.map((limit: any) => {
      if (algorithm === 'sliding_window') {
        if (!limit.requests || !limit.window) {
          throw new Error(`Invalid sliding window limit for ${serviceName}`);
        }
        return {
          requests: limit.requests,
          window: limit.window,
          burst: limit.burst,
        };
      } else if (algorithm === 'token_bucket') {
        if (!limit.capacity || !limit.refillRate) {
          // If old format, try to convert
          if (limit.requests && limit.window) {
            return {
              capacity: limit.requests,
              refillRate: limit.requests / limit.window,
              burst: limit.burst,
            };
          }
          throw new Error(`Invalid token bucket limit for ${serviceName}`);
        }
        return {
          capacity: limit.capacity,
          refillRate: limit.refillRate,
          burst: limit.burst,
        };
      }
      throw new Error(`Unknown algorithm: ${algorithm}`);
    });

    // Validate backoff
    const backoff = {
      type: rawConfig.backoff.type || 'exponential',
      initialDelay: rawConfig.backoff.initialDelay || 1000,
      maxDelay: rawConfig.backoff.maxDelay || 60000,
      multiplier: rawConfig.backoff.multiplier || 2,
      jitter: rawConfig.backoff.jitter !== false,
    };

    return {
      service: serviceName,
      algorithm,
      limits,
      backoff,
      costMapping: rawConfig.costMapping,
      ttl: rawConfig.ttl || 3600,
    };
  }

  private loadDefaultConfigs(): void {
    const defaults: Record<string, Partial<RateLimitConfig>> = {
      reddit: {
        algorithm: 'sliding_window',
        limits: [{ requests: 60, window: 60 }],
        backoff: {
          type: 'exponential',
          initialDelay: 1000,
          maxDelay: 60000,
          multiplier: 2,
        },
      },
      openai: {
        algorithm: 'token_bucket',
        limits: [{ capacity: 500, refillRate: 8.33 }],
        costMapping: {
          'gpt-4': 10,
          'gpt-3.5-turbo': 1,
          'text-embedding-ada-002': 0.1,
        },
        backoff: {
          type: 'adaptive',
          initialDelay: 2000,
          maxDelay: 300000,
        },
      },
      anthropic: {
        algorithm: 'token_bucket',
        limits: [{ capacity: 100, refillRate: 1.67 }],
        costMapping: {
          'claude-3-opus': 15,
          'claude-3-sonnet': 3,
          'claude-3-haiku': 1,
        },
        backoff: {
          type: 'exponential',
          initialDelay: 2000,
          maxDelay: 120000,
          multiplier: 2,
        },
      },
      tiktok: {
        algorithm: 'sliding_window',
        limits: [{ requests: 100, window: 60 }],
        backoff: {
          type: 'exponential',
          initialDelay: 5000,
          maxDelay: 300000,
          multiplier: 2,
        },
      },
      twitter: {
        algorithm: 'sliding_window',
        limits: [{ requests: 300, window: 900 }], // 300 per 15 minutes
        backoff: {
          type: 'exponential',
          initialDelay: 3000,
          maxDelay: 900000, // 15 minutes
          multiplier: 3,
        },
      },
      youtube: {
        algorithm: 'token_bucket',
        limits: [{ capacity: 10000, refillRate: 0.116 }], // 10k per day
        costMapping: {
          'search': 100,
          'videos': 1,
          'channels': 1,
          'playlists': 1,
        },
        backoff: {
          type: 'adaptive',
          initialDelay: 5000,
          maxDelay: 3600000, // 1 hour
        },
      },
    };

    this.configs.clear();
    for (const [service, config] of Object.entries(defaults)) {
      this.configs.set(service, { service, ...config } as RateLimitConfig);
    }

    this.logger.log(`Loaded ${this.configs.size} default rate limit configurations`);
  }

  private watchConfigFile(): void {
    let reloadTimeout: NodeJS.Timeout;

    watchFile(this.configPath, { interval: 5000 }, (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        // Debounce reloads
        if (reloadTimeout) {
          clearTimeout(reloadTimeout);
        }

        reloadTimeout = setTimeout(() => {
          this.logger.log('Rate limit config file changed, reloading...');
          this.loadConfigurations();
        }, 1000);
      }
    });

    this.logger.log(`Watching rate limit config file for changes: ${this.configPath}`);
  }
}