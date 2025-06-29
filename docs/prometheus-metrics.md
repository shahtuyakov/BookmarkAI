# Prometheus Metrics for ML Workers

This document describes the Prometheus metrics implementation for BookmarkAI ML workers (ADR-025 Phase 1.1).

## Overview

Each ML worker (LLM and Whisper) exposes Prometheus metrics on dedicated ports:
- **LLM Worker**: Port 9091
- **Whisper Worker**: Port 9092

## Available Metrics

### Task Metrics
- `ml_tasks_total` - Total number of ML tasks processed (labels: task_name, status, worker_type)
- `ml_task_duration_seconds` - Time spent processing ML tasks (histogram)
- `ml_task_errors_total` - Total number of ML task errors (labels: task_name, error_type, worker_type)
- `ml_active_tasks` - Number of currently active ML tasks (gauge)

### Cost Metrics
- `ml_cost_dollars_total` - Total cost of ML operations in dollars (labels: task_type, model, worker_type)
- `ml_budget_remaining_dollars` - Remaining budget in dollars (gauge, labels: budget_type, service)
- `ml_budget_exceeded_total` - Number of times budget was exceeded (counter)

### Usage Metrics
- `ml_tokens_processed_total` - Total tokens processed (LLM only, labels: task_type, model, token_type)
- `ml_audio_duration_seconds_total` - Total audio duration processed (Whisper only)

### Performance Metrics
- `ml_model_latency_seconds` - Model inference latency (histogram, labels: model, task_type)

### Worker Info
- `ml_worker` - Worker information (info metric with hostname, worker_type, python_version, service)

## Usage

### Starting Services with Metrics

1. Rebuild the Docker images to include prometheus-client:
```bash
docker compose -f docker/docker-compose.ml.yml build
```

2. Start the ML services:
```bash
./scripts/start-ml-services.sh
```

3. Verify metrics endpoints:
```bash
./scripts/test-prometheus-metrics.sh
```

### Accessing Metrics

- LLM Worker: http://localhost:9091/metrics
- Whisper Worker: http://localhost:9092/metrics

### Example Queries

```promql
# Task success rate by worker type
rate(ml_tasks_total{status="success"}[5m]) / rate(ml_tasks_total[5m])

# Average task duration
histogram_quantile(0.95, ml_task_duration_seconds)

# Total ML costs per hour
increase(ml_cost_dollars_total[1h])

# Budget utilization
ml_budget_remaining_dollars / (ml_budget_remaining_dollars + ml_cost_dollars_total)

# Model latency P95
histogram_quantile(0.95, ml_model_latency_seconds)
```

## Integration with Task Code

The metrics are automatically collected via:

1. **Task decorator** - `@task_metrics(worker_type='llm')` automatically tracks task start/end, duration, and status
2. **Manual tracking** - For specific metrics like cost, tokens, and model latency

Example:
```python
@app.task(...)
@task_metrics(worker_type='llm')
def summarize_content(...):
    # Task execution is automatically tracked
    
    # Track model latency
    model_start = time.time()
    result = llm_client.generate_summary(...)
    track_model_latency(time.time() - model_start, model, 'summarization')
    
    # Track costs and tokens
    track_ml_cost(cost, 'summarization', model, 'llm')
    track_tokens(tokens['input'], 'summarization', model, 'input')
```

## Multiprocess Mode

For production deployment with multiple worker processes, set the `PROMETHEUS_MULTIPROC_DIR` environment variable to enable multiprocess mode:

```yaml
environment:
  PROMETHEUS_MULTIPROC_DIR: /tmp/prometheus_multiproc
```

## Next Steps

1. **Set up Prometheus server** to scrape these endpoints
2. **Create Grafana dashboards** for visualization (Phase 1.3)
3. **Add alerts** for budget exceeded, high error rates, etc.
4. **Integrate with KEDA** for autoscaling based on queue metrics

## Testing

To generate test metrics, run some ML tasks:

```bash
# Test LLM summarization
cd packages/api-gateway
node test-llm-summarization.js

# Test Whisper transcription  
node test-whisper-integration.js
```

Then check the metrics endpoints to see the generated metrics.