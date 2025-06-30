import { Injectable, OnModuleInit } from '@nestjs/common';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { ConfigService } from '../../../config/services/config.service';

export interface MLMetricLabels {
  task_type?: 'summarize_llm' | 'transcribe_whisper' | 'embed_vectors';
  status?: 'success' | 'failure' | 'timeout' | 'circuit_breaker_open';
  error_type?: string;
  backend?: 'api' | 'local';
}

@Injectable()
export class MLMetricsService implements OnModuleInit {
  private readonly registry: Registry;
  
  // Counters
  private readonly tasksSentCounter: Counter<'task_type' | 'status'>;
  private readonly taskRetryCounter: Counter<'task_type'>;
  private readonly connectionErrorsCounter: Counter<'error_type'>;
  private readonly circuitBreakerTripsCounter: Counter<string>;
  
  // Histograms
  private readonly taskPublishDurationHistogram: Histogram<'task_type' | 'status'>;
  private readonly messageSizeHistogram: Histogram<'task_type'>;
  
  // Gauges
  private readonly connectionStateGauge: Gauge<'state'>;
  private readonly queueDepthGauge: Gauge<'queue_name'>;
  private readonly circuitBreakerStateGauge: Gauge<string>;
  private readonly reconnectAttemptsGauge: Gauge<string>;
  
  constructor(private readonly configService: ConfigService) {
    this.registry = new Registry();
    
    // Initialize counters
    this.tasksSentCounter = new Counter({
      name: 'ml_producer_tasks_sent_total',
      help: 'Total number of ML tasks sent to RabbitMQ',
      labelNames: ['task_type', 'status'],
      registers: [this.registry],
    });
    
    this.taskRetryCounter = new Counter({
      name: 'ml_producer_task_retries_total',
      help: 'Total number of task retry attempts',
      labelNames: ['task_type'],
      registers: [this.registry],
    });
    
    this.connectionErrorsCounter = new Counter({
      name: 'ml_producer_connection_errors_total',
      help: 'Total number of RabbitMQ connection errors',
      labelNames: ['error_type'],
      registers: [this.registry],
    });
    
    this.circuitBreakerTripsCounter = new Counter({
      name: 'ml_producer_circuit_breaker_trips_total',
      help: 'Total number of times circuit breaker has tripped',
      registers: [this.registry],
    });
    
    // Initialize histograms
    this.taskPublishDurationHistogram = new Histogram({
      name: 'ml_producer_task_publish_duration_seconds',
      help: 'Time taken to publish ML tasks to RabbitMQ',
      labelNames: ['task_type', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });
    
    this.messageSizeHistogram = new Histogram({
      name: 'ml_producer_message_size_bytes',
      help: 'Size of messages sent to RabbitMQ',
      labelNames: ['task_type'],
      buckets: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000],
      registers: [this.registry],
    });
    
    // Initialize gauges
    this.connectionStateGauge = new Gauge({
      name: 'ml_producer_connection_state',
      help: 'Current RabbitMQ connection state (0=disconnected, 1=connecting, 2=connected, 3=closing, 4=closed)',
      labelNames: ['state'],
      registers: [this.registry],
    });
    
    this.queueDepthGauge = new Gauge({
      name: 'ml_producer_queue_depth',
      help: 'Estimated queue depth for ML queues',
      labelNames: ['queue_name'],
      registers: [this.registry],
    });
    
    this.circuitBreakerStateGauge = new Gauge({
      name: 'ml_producer_circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=open)',
      registers: [this.registry],
    });
    
    this.reconnectAttemptsGauge = new Gauge({
      name: 'ml_producer_reconnect_attempts',
      help: 'Number of reconnection attempts',
      registers: [this.registry],
    });
  }
  
  onModuleInit() {
    // Collect default Node.js metrics
    if (this.configService.get<boolean>('PROMETHEUS_COLLECT_DEFAULT_METRICS', true)) {
      collectDefaultMetrics({ register: this.registry });
    }
  }
  
  // Task metrics
  incrementTasksSent(taskType: string, status: 'success' | 'failure' | 'timeout' | 'circuit_breaker_open' | 'validation_error'): void {
    this.tasksSentCounter.inc({ task_type: taskType, status });
  }
  
  incrementTaskRetry(taskType: string): void {
    this.taskRetryCounter.inc({ task_type: taskType });
  }
  
  recordTaskPublishDuration(taskType: string, status: 'success' | 'failure', durationSeconds: number): void {
    this.taskPublishDurationHistogram.observe({ task_type: taskType, status }, durationSeconds);
  }
  
  recordMessageSize(taskType: string, sizeBytes: number): void {
    this.messageSizeHistogram.observe({ task_type: taskType }, sizeBytes);
  }
  
  // Connection metrics
  incrementConnectionError(errorType: string): void {
    this.connectionErrorsCounter.inc({ error_type: errorType });
  }
  
  setConnectionState(state: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'CLOSING' | 'CLOSED'): void {
    // Reset all states to 0
    this.connectionStateGauge.set({ state: 'DISCONNECTED' }, 0);
    this.connectionStateGauge.set({ state: 'CONNECTING' }, 0);
    this.connectionStateGauge.set({ state: 'CONNECTED' }, 0);
    this.connectionStateGauge.set({ state: 'CLOSING' }, 0);
    this.connectionStateGauge.set({ state: 'CLOSED' }, 0);
    
    // Set current state to 1
    this.connectionStateGauge.set({ state }, 1);
    
    // Also set numeric value for easier monitoring
    const stateValue = {
      'DISCONNECTED': 0,
      'CONNECTING': 1,
      'CONNECTED': 2,
      'CLOSING': 3,
      'CLOSED': 4,
    }[state];
    
    this.connectionStateGauge.set({}, stateValue);
  }
  
  setReconnectAttempts(attempts: number): void {
    this.reconnectAttemptsGauge.set(attempts);
  }
  
  // Circuit breaker metrics
  incrementCircuitBreakerTrips(): void {
    this.circuitBreakerTripsCounter.inc();
  }
  
  setCircuitBreakerState(isOpen: boolean): void {
    this.circuitBreakerStateGauge.set(isOpen ? 1 : 0);
  }
  
  // Queue metrics
  setQueueDepth(queueName: string, depth: number): void {
    this.queueDepthGauge.set({ queue_name: queueName }, depth);
  }
  
  // Get metrics for Prometheus endpoint
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
  
  // Get content type for Prometheus
  getContentType(): string {
    return this.registry.contentType;
  }
  
  // Helper to measure async operations
  async measureAsync<T>(
    operation: () => Promise<T>,
    taskType: string,
    onSuccess?: (result: T) => void,
    onError?: (error: Error) => void,
  ): Promise<T> {
    const timer = this.taskPublishDurationHistogram.startTimer({ task_type: taskType });
    
    try {
      const result = await operation();
      timer({ status: 'success' });
      this.incrementTasksSent(taskType, 'success');
      onSuccess?.(result);
      return result;
    } catch (error) {
      timer({ status: 'failure' });
      this.incrementTasksSent(taskType, 'failure');
      onError?.(error as Error);
      throw error;
    }
  }
}