# Prometheus Metrics Reference

This document describes all Prometheus metrics exposed by BookmarkAI services.

## API Gateway Metrics (ML Producer)

### Task Publishing Metrics

#### ml_producer_tasks_sent_total
- **Type**: Counter
- **Description**: Total number of ML tasks sent to RabbitMQ
- **Labels**:
  - `task_type`: Type of ML task (summarize_llm, transcribe_whisper, embed_vectors)
  - `status`: Publishing status (success, failure, timeout)
- **Example**: `ml_producer_tasks_sent_total{task_type="summarize_llm",status="success"} 42`

#### ml_producer_task_retries_total
- **Type**: Counter
- **Description**: Total number of task publishing retries
- **Labels**:
  - `task_type`: Type of ML task
- **Example**: `ml_producer_task_retries_total{task_type="transcribe_whisper"} 5`

### Connection Metrics

#### ml_producer_connection_state
- **Type**: Gauge
- **Description**: Current RabbitMQ connection state
- **Labels**:
  - `state`: Connection state (CONNECTED, DISCONNECTED, CONNECTING, ERROR)
- **Values**: 1 for active state, 0 for inactive
- **Example**: `ml_producer_connection_state{state="CONNECTED"} 1`

#### ml_producer_reconnect_attempts_total
- **Type**: Counter
- **Description**: Total number of reconnection attempts
- **Example**: `ml_producer_reconnect_attempts_total 3`

#### ml_producer_connection_errors_total
- **Type**: Counter
- **Description**: Total number of connection errors
- **Labels**:
  - `error_type`: Type of error encountered
- **Example**: `ml_producer_connection_errors_total{error_type="Connection timeout"} 2`

### Circuit Breaker Metrics

#### ml_producer_circuit_breaker_state
- **Type**: Gauge
- **Description**: Current circuit breaker state
- **Labels**:
  - `state`: Circuit state (open, closed, half_open)
- **Values**: 1 for active state, 0 for inactive
- **Example**: `ml_producer_circuit_breaker_state{state="closed"} 1`

#### ml_producer_circuit_breaker_trips_total
- **Type**: Counter
- **Description**: Total number of circuit breaker trips
- **Example**: `ml_producer_circuit_breaker_trips_total 0`

### Performance Metrics

#### ml_producer_publish_duration_seconds
- **Type**: Histogram
- **Description**: Time taken to publish messages to RabbitMQ
- **Labels**:
  - `task_type`: Type of ML task
- **Buckets**: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0
- **Example**: `ml_producer_publish_duration_seconds_bucket{task_type="embed_vectors",le="0.05"} 156`

#### ml_producer_message_size_bytes
- **Type**: Histogram
- **Description**: Size of messages published to RabbitMQ
- **Labels**:
  - `task_type`: Type of ML task
- **Buckets**: 100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000
- **Example**: `ml_producer_message_size_bytes_sum{task_type="summarize_llm"} 524288`

## Python ML Worker Metrics

### Cost and Budget Metrics

#### ml_cost_total
- **Type**: Counter
- **Description**: Total cost of ML operations in USD
- **Labels**:
  - `service_type`: Type of ML service (transcription, summarization, embedding)
  - `model`: Model used (e.g., whisper-api, gpt-4o-mini, text-embedding-3-small)
  - `worker`: Worker type (whisper, llm, vector)
- **Example**: `ml_cost_total{service_type="transcription",model="whisper-api",worker="whisper"} 12.45`

#### ml_budget_remaining
- **Type**: Gauge
- **Description**: Remaining budget in USD
- **Labels**:
  - `period`: Budget period (hourly, daily)
  - `worker`: Worker type
- **Example**: `ml_budget_remaining{period="daily",worker="llm"} 87.55`

#### ml_budget_exceeded_total
- **Type**: Counter
- **Description**: Number of times budget was exceeded
- **Labels**:
  - `period`: Budget period (hourly, daily)
  - `worker`: Worker type
- **Example**: `ml_budget_exceeded_total{period="hourly",worker="whisper"} 2`

### Processing Metrics

#### ml_audio_duration_seconds_total
- **Type**: Counter
- **Description**: Total audio duration processed in seconds
- **Labels**:
  - `service_type`: Type of service (transcription)
  - `model`: Model used
- **Example**: `ml_audio_duration_seconds_total{service_type="transcription",model="whisper-api"} 3600.5`

#### ml_model_latency_seconds
- **Type**: Histogram
- **Description**: Model inference latency
- **Labels**:
  - `model`: Model name
  - `operation`: Operation type (transcription, summarization, embedding)
- **Buckets**: 0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0
- **Example**: `ml_model_latency_seconds_bucket{model="gpt-4o-mini",operation="summarization",le="5.0"} 145`

### Task Metrics

#### celery_task_duration_seconds
- **Type**: Histogram
- **Description**: Duration of Celery task execution
- **Labels**:
  - `task_name`: Name of the Celery task
  - `worker_type`: Type of worker
- **Example**: `celery_task_duration_seconds_sum{task_name="whisper.tasks.transcribe_api",worker_type="whisper"} 1234.56`

#### celery_task_total
- **Type**: Counter
- **Description**: Total number of tasks executed
- **Labels**:
  - `task_name`: Name of the Celery task
  - `status`: Task status (success, failure, retry)
  - `worker_type`: Type of worker
- **Example**: `celery_task_total{task_name="llm.tasks.summarize",status="success",worker_type="llm"} 156`

#### celery_task_failures_total
- **Type**: Counter
- **Description**: Total number of task failures
- **Labels**:
  - `task_name`: Name of the Celery task
  - `exception_type`: Type of exception
  - `worker_type`: Type of worker
- **Example**: `celery_task_failures_total{task_name="vector.tasks.embed",exception_type="RateLimitError",worker_type="vector"} 3`

### Rate Limiting Metrics

#### rate_limit_errors_total
- **Type**: Counter
- **Description**: Total number of rate limit errors
- **Labels**:
  - `service`: Service name (whisper, llm, vector)
  - `resource`: Resource being rate limited (api_calls)
- **Example**: `rate_limit_errors_total{service="whisper",resource="api_calls"} 5`

#### service_queue_depth
- **Type**: Gauge
- **Description**: Current queue depth for rate-limited services
- **Labels**:
  - `service`: Service name
  - `queue_type`: Type of queue (concurrent_requests)
- **Example**: `service_queue_depth{service="whisper",queue_type="concurrent_requests"} 3`

## Common Query Examples

### Task Success Rate
```promql
# Success rate for each task type over last 5 minutes
rate(ml_producer_tasks_sent_total{status="success"}[5m]) / 
rate(ml_producer_tasks_sent_total[5m])
```

### Cost per Hour
```promql
# ML costs per hour by service
increase(ml_cost_total[1h])
```

### Average Task Duration
```promql
# Average task duration by task type
rate(celery_task_duration_seconds_sum[5m]) / 
rate(celery_task_duration_seconds_count[5m])
```

### Connection Health
```promql
# Check if any service is disconnected
ml_producer_connection_state{state="DISCONNECTED"} == 1
```

### Budget Usage Percentage
```promql
# Daily budget usage percentage by worker
(ml_budget_remaining{period="daily"} / 100) * 100
```

### Error Rate
```promql
# Task error rate over last 15 minutes
rate(celery_task_failures_total[15m])
```

### P95 Latency
```promql
# 95th percentile model latency
histogram_quantile(0.95, rate(ml_model_latency_seconds_bucket[5m]))
```

## Metric Naming Conventions

1. **Prefixes**:
   - `ml_producer_`: API Gateway ML producer metrics
   - `ml_`: General ML service metrics
   - `celery_`: Celery task metrics
   - `service_`: Service-specific metrics

2. **Suffixes**:
   - `_total`: Counters (monotonically increasing)
   - `_seconds`: Time durations
   - `_bytes`: Size measurements
   - `_state`: Current state (gauge)

3. **Labels**:
   - Use lowercase with underscores
   - Keep cardinality low
   - Include essential dimensions only

## Best Practices

1. **Querying**:
   - Use rate() for counters over time
   - Use increase() for total increase over period
   - Use histogram_quantile() for percentiles

2. **Alerting**:
   - Alert on rates, not absolute values
   - Include time windows in queries
   - Set appropriate thresholds

3. **Dashboard Design**:
   - Group related metrics
   - Show both current and historical data
   - Include relevant labels in legends