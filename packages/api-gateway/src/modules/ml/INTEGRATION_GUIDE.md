# ML Producer Enhanced Service Integration Guide

## Quick Start

To integrate the enhanced ML producer service with improved reliability:

### 1. Update the ML Module

Replace the existing service registration in `ml.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MLProducerEnhancedService } from './ml-producer-enhanced.service';
import { MLMetricsService } from './services/ml-metrics.service';
import { MLAnalyticsController } from './controllers/ml-analytics.controller';
import { MLMetricsController } from './controllers/ml-metrics.controller';
import { MLAnalyticsService } from './services/ml-analytics.service';

@Module({
  providers: [
    MLProducerEnhancedService,  // Use enhanced service
    MLMetricsService,
    MLAnalyticsService,
  ],
  controllers: [
    MLAnalyticsController,
    MLMetricsController,
  ],
  exports: [MLProducerEnhancedService],  // Export enhanced service
})
export class MLModule {}
```

### 2. Update Service Injections

In any service or controller that uses ML producer, update the injection:

```typescript
// Before
constructor(
  private readonly mlProducer: MLProducerService,
) {}

// After
constructor(
  private readonly mlProducer: MLProducerEnhancedService,
) {}
```

### 3. No API Changes Required

The enhanced service maintains the same public API, so no changes are needed in calling code:

```typescript
// These methods work exactly the same
await this.mlProducer.publishSummarizationTask(shareId, content, options);
await this.mlProducer.publishTranscriptionTask(shareId, mediaUrl, options);
await this.mlProducer.publishEmbeddingTask(shareId, content, options);
```

### 4. New Status Information

The enhanced service provides additional status information:

```typescript
// Get detailed status including retry queue
const status = this.mlProducer.getStatus();
console.log({
  connectionState: status.connectionState,
  reconnectAttempts: status.reconnectAttempts,
  circuitBreakerOpen: status.circuitBreakerOpen,
  retryQueueSize: status.retryQueueSize,        // NEW
  pendingConfirms: status.pendingConfirms,      // NEW
});
```

### 5. Optional Environment Variables

You can fine-tune the behavior with these environment variables:

```bash
# Connection settings
RABBITMQ_HEARTBEAT=60                # Heartbeat interval (seconds)
RABBITMQ_CONNECTION_TIMEOUT=10000    # Connection timeout (ms)

# Future: Additional tuning options
# ML_MAX_MESSAGE_RETRIES=3          # Max retry attempts
# ML_CIRCUIT_BREAKER_THRESHOLD=10   # Failures before opening
# ML_CIRCUIT_BREAKER_COOLDOWN=30000 # Cooldown period (ms)
```

## Testing the Integration

1. **Run the test suite**:
```bash
cd packages/api-gateway
chmod +x test-ml-producer-reliability.js
./test-ml-producer-reliability.js all
```

2. **Monitor enhanced metrics**:
```bash
# Prometheus metrics
curl http://localhost:3001/api/ml/metrics/prometheus

# JSON metrics (includes new fields)
curl http://localhost:3001/api/ml/metrics/json | jq .
```

3. **Test reliability improvements**:
```bash
# Test connection resilience
./test-ml-producer-reliability.js connection-resilience

# Test message retry
./test-ml-producer-reliability.js message-retry

# Test circuit breaker
./test-ml-producer-reliability.js circuit-breaker
```

## Key Improvements

1. **Jittered Reconnection**: Prevents thundering herd during mass reconnects
2. **Message Retry Queue**: Failed messages are retried with exponential backoff
3. **Publisher Confirm Timeout**: Prevents indefinite waiting on confirms
4. **Health Monitoring**: Proactive connection health checks every 30s
5. **Enhanced Circuit Breaker**: Higher threshold (10) for better stability

## Rollback Plan

If you need to rollback to the original service:

1. Change imports back to `MLProducerService`
2. Update the module provider registration
3. The API remains the same, so no other changes needed

## Monitoring

Add these alerts to your monitoring system:

```yaml
- alert: MLProducerRetryQueueHigh
  expr: ml_producer_retry_queue_size > 50
  for: 5m

- alert: MLProducerCircuitBreakerOpen
  expr: ml_producer_circuit_breaker_open == 1
  for: 2m

- alert: MLProducerDisconnected
  expr: ml_producer_connection_state != 3
  for: 3m
```