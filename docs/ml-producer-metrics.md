# ML Producer Prometheus Metrics

## Overview
The ML Producer service now exposes comprehensive Prometheus metrics for monitoring RabbitMQ message publishing, connection health, and task processing performance.

## Metrics Exposed

### Counters

#### `ml_producer_tasks_sent_total`
Total number of ML tasks sent to RabbitMQ.
- **Labels**: 
  - `task_type`: `summarize_llm`, `transcribe_whisper`, `embed_vectors`
  - `status`: `success`, `failure`, `timeout`, `circuit_breaker_open`

#### `ml_producer_task_retries_total`
Total number of task retry attempts.
- **Labels**: 
  - `task_type`: Task type being retried

#### `ml_producer_connection_errors_total`
Total number of RabbitMQ connection errors.
- **Labels**: 
  - `error_type`: Type of error encountered

#### `ml_producer_circuit_breaker_trips_total`
Total number of times the circuit breaker has tripped.

### Histograms

#### `ml_producer_task_publish_duration_seconds`
Time taken to publish ML tasks to RabbitMQ.
- **Labels**: 
  - `task_type`: Type of ML task
  - `status`: `success` or `failure`
- **Buckets**: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1

#### `ml_producer_message_size_bytes`
Size of messages sent to RabbitMQ.
- **Labels**: 
  - `task_type`: Type of ML task
- **Buckets**: 100, 500, 1000, 5000, 10000, 50000, 100000, 500000

### Gauges

#### `ml_producer_connection_state`
Current RabbitMQ connection state.
- **States**: 
  - 0: DISCONNECTED
  - 1: CONNECTING
  - 2: CONNECTED
  - 3: CLOSING
  - 4: CLOSED

#### `ml_producer_circuit_breaker_state`
Circuit breaker state.
- **Values**: 
  - 0: Closed (normal operation)
  - 1: Open (rejecting requests)

#### `ml_producer_reconnect_attempts`
Number of reconnection attempts.

## Endpoints

### Prometheus Format
`GET /api/metrics/prometheus`

Returns metrics in Prometheus text format. Requires authentication.

Example:
```
# HELP ml_producer_tasks_sent_total Total number of ML tasks sent to RabbitMQ
# TYPE ml_producer_tasks_sent_total counter
ml_producer_tasks_sent_total{task_type="summarize_llm",status="success"} 42
ml_producer_tasks_sent_total{task_type="transcribe_whisper",status="success"} 156
```

### JSON Format
`GET /api/metrics/ml-producer`

Returns metrics in JSON format for debugging and custom dashboards.

## Integration with Existing Systems

### Prometheus Configuration
Add the following job to your Prometheus configuration:

```yaml
scrape_configs:
  - job_name: 'bookmarkai-api-gateway'
    static_configs:
      - targets: ['api-gateway:3001']
    metrics_path: '/api/metrics/prometheus'
    bearer_token: 'YOUR_AUTH_TOKEN'
```

### Grafana Dashboard
Key queries for monitoring:

1. **Task Success Rate**:
```promql
rate(ml_producer_tasks_sent_total{status="success"}[5m]) / 
rate(ml_producer_tasks_sent_total[5m])
```

2. **Average Publish Duration**:
```promql
histogram_quantile(0.95, 
  rate(ml_producer_task_publish_duration_seconds_bucket[5m])
)
```

3. **Connection Health**:
```promql
ml_producer_connection_state == 2
```

4. **Circuit Breaker Status**:
```promql
ml_producer_circuit_breaker_state
```

## Testing

Use the provided test script:
```bash
cd packages/api-gateway
export AUTH_TOKEN="your-auth-token"
node test-ml-metrics.js
```

## Implementation Details

### Architecture
- Metrics are collected using the `prom-client` library
- Metrics service is injected into ML Producer service
- Gauges are updated on status checks
- Counters and histograms are updated on each operation

### Performance Impact
- Minimal overhead (< 1ms per operation)
- In-memory storage with efficient data structures
- No external dependencies for metric collection

## Future Enhancements

1. **Queue Depth Metrics**: Monitor queue sizes (requires RabbitMQ management API)
2. **Rate Limiting Metrics**: Track rate limit hits
3. **Dead Letter Queue Metrics**: Monitor failed messages
4. **Batch Processing Metrics**: Specific metrics for batch operations
5. **SLA Metrics**: Track SLA compliance for different task types

## Related Documentation
- [Connection Reliability](./ml-connection-reliability.md)
- [ML Analytics API](./ml-analytics-api.md)
- [Python Worker Metrics](./prometheus-metrics.md)