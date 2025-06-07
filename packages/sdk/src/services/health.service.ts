import { BookmarkAIClient } from '../client';

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version?: string;
  checks?: Record<string, {
    status: string;
    message?: string;
  }>;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening
  resetTimeout: number;        // Time in ms before attempting to close
  monitoringPeriod: number;    // Time window for counting failures
  halfOpenMaxAttempts: number; // Max attempts in half-open state
}

interface CircuitBreakerStats {
  failures: number;
  successes: number;
  lastFailureTime?: number;
  consecutiveSuccesses: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private stats: CircuitBreakerStats = {
    failures: 0,
    successes: 0,
    consecutiveSuccesses: 0,
  };
  private halfOpenAttempts = 0;
  private resetTimer?: NodeJS.Timeout;

  constructor(
    private config: CircuitBreakerConfig = {
      failureThreshold: 3,
      resetTimeout: 30000, // 30 seconds
      monitoringPeriod: 60000, // 1 minute
      halfOpenMaxAttempts: 3,
    }
  ) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === 'open') {
      throw new Error('Circuit breaker is OPEN - service unavailable');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): Readonly<CircuitBreakerStats> {
    return { ...this.stats };
  }

  /**
   * Manually close the circuit
   */
  close(): void {
    this.state = 'closed';
    this.stats = {
      failures: 0,
      successes: 0,
      consecutiveSuccesses: 0,
    };
    this.halfOpenAttempts = 0;
    this.clearResetTimer();
  }

  /**
   * Manually open the circuit
   */
  open(): void {
    this.state = 'open';
    this.scheduleReset();
  }

  private onSuccess(): void {
    this.stats.successes++;
    this.stats.consecutiveSuccesses++;

    if (this.state === 'half-open') {
      // Need consecutive successes to close
      if (this.stats.consecutiveSuccesses >= 2) {
        this.close();
      }
    }
  }

  private onFailure(): void {
    this.stats.failures++;
    this.stats.consecutiveSuccesses = 0;
    this.stats.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.open();
      }
    } else if (this.state === 'closed') {
      // Check if we should open the circuit
      if (this.stats.failures >= this.config.failureThreshold) {
        this.open();
      }
    }
  }

  private scheduleReset(): void {
    this.clearResetTimer();
    
    this.resetTimer = setTimeout(() => {
      this.state = 'half-open';
      this.halfOpenAttempts = 0;
      this.stats.consecutiveSuccesses = 0;
    }, this.config.resetTimeout);
  }

  private clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.clearResetTimer();
  }
}

export class HealthService {
  private circuitBreaker: CircuitBreaker;
  private lastHealthCheck?: HealthResponse;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    private client: BookmarkAIClient,
    private config: {
      enableAutoCheck?: boolean;
      checkInterval?: number;
      circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
    } = {}
  ) {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 30000,
      monitoringPeriod: 60000,
      halfOpenMaxAttempts: 3,
      ...config.circuitBreakerConfig,
    });

    if (config.enableAutoCheck) {
      this.startAutoHealthCheck();
    }
  }

  /**
   * Check if the API is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.check();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Perform a health check
   */
  async check(): Promise<HealthResponse> {
    return this.circuitBreaker.execute(async () => {
      const response = await this.client.request<HealthResponse>({
        url: '/healthz',
        method: 'GET',
        timeout: 5000, // 5 second timeout for health checks
      });

      this.lastHealthCheck = response.data;
      return response.data;
    });
  }

  /**
   * Get the last health check result
   */
  getLastHealthCheck(): HealthResponse | undefined {
    return this.lastHealthCheck;
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitStats(): Readonly<CircuitBreakerStats> {
    return this.circuitBreaker.getStats();
  }

  /**
   * Manually reset the circuit breaker
   */
  resetCircuit(): void {
    this.circuitBreaker.close();
  }

  /**
   * Start automatic health checking
   */
  private startAutoHealthCheck(): void {
    const interval = this.config.checkInterval || 30000; // 30 seconds default

    // Initial check
    this.check().catch(() => {
      // Ignore errors on initial check
    });

    this.healthCheckInterval = setInterval(() => {
      this.check().catch(() => {
        // Ignore errors in background checks
      });
    }, interval);
  }

  /**
   * Stop automatic health checking
   */
  stopAutoHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopAutoHealthCheck();
    this.circuitBreaker.destroy();
  }
}