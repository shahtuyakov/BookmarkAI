import { Module, Global } from '@nestjs/common';
import { DistributedRateLimiterService } from './services/distributed-rate-limiter.service';
import { RateLimitConfigService } from './services/rate-limit-config.service';

@Global()
@Module({
  providers: [DistributedRateLimiterService, RateLimitConfigService],
  exports: [DistributedRateLimiterService, RateLimitConfigService],
})
export class RateLimiterModule {}