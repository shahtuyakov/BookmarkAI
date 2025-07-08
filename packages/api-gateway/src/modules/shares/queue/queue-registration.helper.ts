import { DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '../../../config/services/config.service';
import { getAllQueueNames } from './priority-queue.constants';
import { SHARE_QUEUE } from './share-queue.constants';

/**
 * Helper to register all priority queues
 */
export class QueueRegistrationHelper {
  /**
   * Register all platform/priority queues with BullMQ
   */
  static registerQueues(): DynamicModule[] {
    const modules: DynamicModule[] = [];
    
    // Register legacy queue for backward compatibility
    modules.push(
      BullModule.registerQueueAsync({
        name: SHARE_QUEUE.NAME,
        inject: [ConfigService],
        useFactory: async (configService: ConfigService) => ({
          redis: {
            host: configService.get('CACHE_HOST', 'localhost'),
            port: configService.get('CACHE_PORT', 6379),
          },
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: false,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          },
        }),
      })
    );
    
    // Register all priority queues
    const queueNames = getAllQueueNames();
    
    for (const queueName of queueNames) {
      modules.push(
        BullModule.registerQueueAsync({
          name: queueName,
          inject: [ConfigService],
          useFactory: async (configService: ConfigService) => ({
            redis: {
              host: configService.get('CACHE_HOST', 'localhost'),
              port: configService.get('CACHE_PORT', 6379),
            },
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: false,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
            },
          }),
        })
      );
    }
    
    return modules;
  }
  
  /**
   * Get queue injection tokens for dependency injection
   */
  static getQueueInjectionTokens(): string[] {
    const tokens = [`BullQueue_${SHARE_QUEUE.NAME}`];
    
    const queueNames = getAllQueueNames();
    for (const queueName of queueNames) {
      tokens.push(`BullQueue_${queueName}`);
    }
    
    return tokens;
  }
}