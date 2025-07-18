import { Injectable } from '@nestjs/common';
import { Counter, Histogram, register, Registry } from 'prom-client';

@Injectable()
export class AuthMetricsService {
  private readonly registry: Registry;
  
  // Counters
  private readonly authAttemptsCounter: Counter<string>;
  private readonly authSuccessCounter: Counter<string>;
  private readonly authFailureCounter: Counter<string>;
  private readonly newUserRegistrationCounter: Counter<string>;
  
  // Histograms
  private readonly authLatencyHistogram: Histogram<string>;
  private readonly tokenValidationHistogram: Histogram<string>;

  constructor() {
    // Use the global registry
    this.registry = register;

    // Authentication attempts counter
    this.authAttemptsCounter = new Counter({
      name: 'auth_attempts_total',
      help: 'Total number of authentication attempts',
      labelNames: ['provider', 'auth_type'],
      registers: [this.registry],
    });

    // Authentication success counter
    this.authSuccessCounter = new Counter({
      name: 'auth_success_total',
      help: 'Total number of successful authentications',
      labelNames: ['provider', 'auth_type', 'is_new_user'],
      registers: [this.registry],
    });

    // Authentication failure counter
    this.authFailureCounter = new Counter({
      name: 'auth_failure_total',
      help: 'Total number of failed authentications',
      labelNames: ['provider', 'auth_type', 'error_type'],
      registers: [this.registry],
    });

    // New user registration counter
    this.newUserRegistrationCounter = new Counter({
      name: 'auth_new_user_registration_total',
      help: 'Total number of new user registrations',
      labelNames: ['provider'],
      registers: [this.registry],
    });

    // Authentication latency histogram
    this.authLatencyHistogram = new Histogram({
      name: 'auth_latency_seconds',
      help: 'Authentication latency in seconds',
      labelNames: ['provider', 'auth_type'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    // Token validation latency histogram
    this.tokenValidationHistogram = new Histogram({
      name: 'auth_token_validation_seconds',
      help: 'Token validation latency in seconds',
      labelNames: ['provider'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry],
    });
  }

  /**
   * Record authentication attempt
   */
  recordAuthAttempt(provider: string, authType: string = 'social'): void {
    this.authAttemptsCounter.labels(provider, authType).inc();
  }

  /**
   * Record successful authentication
   */
  recordAuthSuccess(
    provider: string,
    authType: string = 'social',
    isNewUser: boolean = false,
  ): void {
    this.authSuccessCounter
      .labels(provider, authType, isNewUser ? 'true' : 'false')
      .inc();
    
    if (isNewUser) {
      this.newUserRegistrationCounter.labels(provider).inc();
    }
  }

  /**
   * Record failed authentication
   */
  recordAuthFailure(
    provider: string,
    authType: string = 'social',
    errorType: string = 'unknown',
  ): void {
    this.authFailureCounter.labels(provider, authType, errorType).inc();
  }

  /**
   * Record authentication latency
   */
  recordAuthLatency(
    provider: string,
    latencySeconds: number,
    authType: string = 'social',
  ): void {
    this.authLatencyHistogram.labels(provider, authType).observe(latencySeconds);
  }

  /**
   * Record token validation latency
   */
  recordTokenValidationLatency(provider: string, latencySeconds: number): void {
    this.tokenValidationHistogram.labels(provider).observe(latencySeconds);
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get content type for Prometheus metrics
   */
  getContentType(): string {
    return this.registry.contentType;
  }
}