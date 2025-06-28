# ML Services Grafana Dashboards

This document describes the Grafana dashboards created for monitoring ML services in the BookmarkAI platform.

## Overview

Three comprehensive dashboards have been created to monitor different aspects of the ML infrastructure:

1. **ML Producer Monitoring** - Monitors the Node.js ML Producer service
2. **ML Analytics & Cost Monitoring** - Tracks ML task costs and analytics
3. **Python ML Services (Celery)** - Monitors Python Celery workers

## Dashboard Details

### 1. ML Producer Monitoring (`ml-producer-monitoring`)

This dashboard monitors the health and performance of the Node.js ML Producer service.

#### Panels:
- **Connection Health**
  - Connection Status (Connected/Disconnected/Connecting)
  - Reconnection Attempts
  - Circuit Breaker Status
  - Circuit Breaker Failures

- **Task Processing Metrics**
  - Task Send Rate (by task type and status)
  - Task Success Rate gauge
  - Tasks by Type (hourly breakdown)

- **Performance Metrics**
  - Task Publish Latency Percentiles (p50, p95, p99)
  - Message Size Distribution

- **Error & Retry Metrics**
  - Connection Error Rate
  - Task Retry Rate

### 2. ML Analytics & Cost Monitoring (`ml-analytics-monitoring`)

This dashboard provides insights into ML processing costs and analytics.

#### Panels:
- **Cost Overview**
  - Total Cost (24h)
  - Average Cost per Task
  - Cost by Task Type (24h)
  - Hourly Budget Usage gauge
  - Daily Budget Usage gauge

- **ML Task Performance**
  - ML Task Processing Duration percentiles
  - ML Task Completion Rate

- **Transcription Analytics**
  - Audio Duration Distribution
  - Transcriptions by Backend (24h)
  - Transcription Cost Rate

### 3. Python ML Services (Celery) (`python-ml-services`)

This dashboard monitors the Python Celery workers processing ML tasks.

#### Panels:
- **Celery Worker Status**
  - Flower Status
  - Active Workers count
  - Queued Tasks count
  - Worker CPU Load by hostname
  - Tasks Queued by Queue

- **Task Execution Metrics**
  - Task Execution Rate (sent/received/succeeded/failed)
  - Task Success Rate gauge
  - Tasks Completed (1h) by task type

- **Task Performance**
  - Task Runtime Percentiles (p50, p95, p99)
  - Task Failure Rate by Task

- **Queue Health**
  - Queue Length Over Time

## Setup Instructions

### 1. Ensure Grafana Configuration

The dashboards are automatically provisioned through Grafana's provisioning system. Ensure the following structure exists:

```
docker/grafana/provisioning/
├── datasources/
│   └── datasources.yaml
└── dashboards/
    ├── dashboards.yaml
    ├── ml-producer-dashboard.json
    ├── ml-analytics-dashboard.json
    └── python-ml-services-dashboard.json
```

### 2. Docker Compose Configuration

Ensure your `docker-compose.yml` includes the Grafana service with proper volume mounts:

```yaml
grafana:
  image: grafana/grafana:latest
  ports:
    - "3000:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
  volumes:
    - ./docker/grafana/provisioning:/etc/grafana/provisioning
    - grafana-storage:/var/lib/grafana
  networks:
    - monitoring
```

### 3. Start Services

```bash
docker-compose up -d grafana prometheus
```

### 4. Access Dashboards

1. Open Grafana at http://localhost:3000
2. Login with admin/admin (or your configured password)
3. Navigate to Dashboards → Browse
4. Look for the "ML Services" folder
5. Select any of the three dashboards

## Dashboard Usage

### Time Range Selection
- Use the time picker in the top right to adjust the time range
- Default ranges are optimized for each dashboard:
  - ML Producer: Last 1 hour
  - ML Analytics: Last 6 hours
  - Python Services: Last 1 hour

### Auto-refresh
- All dashboards are configured with 10-second auto-refresh
- Can be adjusted using the refresh dropdown

### Alerts
- Dashboards reference the alert rules defined in `prometheus-alerts-ml.yml`
- Configure alert notifications in Grafana → Alerting → Contact points

## Customization

### Adding New Panels

To add new panels to existing dashboards:

1. Edit the dashboard JSON file
2. Add new panel configuration in the `panels` array
3. Restart Grafana or reload provisioning

### Creating New Dashboards

1. Create new JSON file in `docker/grafana/provisioning/dashboards/`
2. Use existing dashboards as templates
3. Ensure unique `uid` and `title` fields
4. Add appropriate tags for organization

## Metrics Reference

### ML Producer Metrics
- `ml_producer_connection_state` - RabbitMQ connection state
- `ml_producer_tasks_sent_total` - Total tasks sent
- `ml_producer_task_publish_duration_seconds` - Task publish latency
- `ml_producer_circuit_breaker_state` - Circuit breaker state
- `ml_producer_message_size_bytes` - Message size distribution

### ML Analytics Metrics
- `ml_cost_usd_total` - Total cost in USD
- `ml_tasks_completed_total` - Tasks completed
- `ml_task_processing_duration_seconds` - Task processing duration
- `ml_audio_duration_seconds` - Audio duration for transcriptions
- `ml_transcriptions_total` - Total transcriptions

### Celery Metrics (via Flower)
- `celery_workers` - Number of active workers
- `celery_task_queued` - Tasks in queue
- `celery_task_sent_total` - Tasks sent
- `celery_task_succeeded_total` - Tasks succeeded
- `celery_task_failed_total` - Tasks failed
- `celery_task_runtime_seconds` - Task runtime duration

## Troubleshooting

### Dashboards Not Appearing
1. Check Grafana logs: `docker-compose logs grafana`
2. Verify provisioning files are mounted correctly
3. Check file permissions on dashboard JSON files

### No Data in Panels
1. Verify Prometheus is running and collecting metrics
2. Check metric endpoints are accessible
3. Verify metric names match between exporters and queries

### Performance Issues
1. Adjust time ranges to smaller windows
2. Increase panel refresh intervals
3. Optimize Prometheus queries if needed

## Best Practices

1. **Regular Monitoring**: Check dashboards daily for anomalies
2. **Alert Configuration**: Set up alerts for critical metrics
3. **Capacity Planning**: Use historical data for scaling decisions
4. **Cost Optimization**: Monitor cost metrics to optimize ML usage
5. **Performance Tuning**: Use latency metrics to identify bottlenecks