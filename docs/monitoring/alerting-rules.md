# Alerting Rules Configuration

This document describes the alerting rules configured for BookmarkAI monitoring.

## Alert Configuration Files

- **ML Alerts**: `/docs/prometheus-alerts-ml.yml`
- **Video Workflow Alerts**: `/docker/prometheus/alerts/video-workflow-alerts.yml`

## Alert Categories

### 1. Service Health Alerts

#### MLProducerDown
- **Severity**: Critical
- **Condition**: ML Producer metrics endpoint unavailable for > 5 minutes
- **Query**: `up{job="ml-producer"} == 0`
- **Description**: API Gateway ML metrics endpoint is not responding
- **Action**: Check API Gateway health, restart if necessary

#### PythonWorkerDown
- **Severity**: Critical
- **Condition**: Python worker metrics unavailable for > 5 minutes
- **Query**: `up{job=~"llm-worker|whisper-worker|vector-worker"} == 0`
- **Description**: One or more Python ML workers are not responding
- **Action**: Check worker logs, restart affected workers

#### RabbitMQConnectionLost
- **Severity**: High
- **Condition**: RabbitMQ disconnected for > 2 minutes
- **Query**: `ml_producer_connection_state{state="DISCONNECTED"} == 1`
- **Description**: API Gateway lost connection to RabbitMQ
- **Action**: Check RabbitMQ health, network connectivity

### 2. Performance Alerts

#### HighTaskFailureRate
- **Severity**: High
- **Condition**: Task failure rate > 10% for 5 minutes
- **Query**: 
  ```promql
  (
    sum(rate(celery_task_failures_total[5m])) by (task_name) /
    sum(rate(celery_task_total[5m])) by (task_name)
  ) > 0.1
  ```
- **Description**: High failure rate for ML tasks
- **Action**: Check logs for errors, verify external API availability

#### SlowTaskProcessing
- **Severity**: Warning
- **Condition**: Average task duration > 5 minutes
- **Query**: 
  ```promql
  (
    rate(celery_task_duration_seconds_sum[5m]) /
    rate(celery_task_duration_seconds_count[5m])
  ) > 300
  ```
- **Description**: Tasks taking longer than expected
- **Action**: Check for performance bottlenecks, API rate limits

#### HighModelLatency
- **Severity**: Warning
- **Condition**: P95 model latency > 30 seconds
- **Query**: 
  ```promql
  histogram_quantile(0.95, 
    sum(rate(ml_model_latency_seconds_bucket[5m])) by (le, model)
  ) > 30
  ```
- **Description**: Model inference taking too long
- **Action**: Check API performance, consider load distribution

### 3. Budget and Cost Alerts

#### DailyBudgetNearLimit
- **Severity**: Warning
- **Condition**: Daily budget usage > 80%
- **Query**: 
  ```promql
  (1 - (ml_budget_remaining{period="daily"} / 100)) > 0.8
  ```
- **Description**: Daily ML budget approaching limit
- **Action**: Review usage patterns, adjust if necessary

#### HourlyBudgetExceeded
- **Severity**: High
- **Condition**: Hourly budget exceeded events increasing
- **Query**: 
  ```promql
  increase(ml_budget_exceeded_total{period="hourly"}[1h]) > 0
  ```
- **Description**: Hourly budget limits being exceeded
- **Action**: Investigate spike in usage, possible abuse

#### UnexpectedCostSpike
- **Severity**: High
- **Condition**: Cost increase > 200% compared to same hour yesterday
- **Query**: 
  ```promql
  (
    increase(ml_cost_total[1h]) /
    increase(ml_cost_total[1h] offset 24h)
  ) > 3
  ```
- **Description**: Unusual spike in ML costs
- **Action**: Check for abnormal usage, potential issues

### 4. Queue and Capacity Alerts

#### HighQueueDepth
- **Severity**: Warning
- **Condition**: Queue depth > 1000 for 10 minutes
- **Query**: 
  ```promql
  service_queue_depth{queue_type="concurrent_requests"} > 1000
  ```
- **Description**: Large backlog in processing queue
- **Action**: Scale workers, check for bottlenecks

#### CircuitBreakerOpen
- **Severity**: High
- **Condition**: Circuit breaker open
- **Query**: `ml_producer_circuit_breaker_state{state="open"} == 1`
- **Description**: Circuit breaker has tripped
- **Action**: Check downstream service health

#### RateLimitExceeded
- **Severity**: Warning
- **Condition**: Rate limit errors increasing
- **Query**: 
  ```promql
  increase(rate_limit_errors_total[5m]) > 10
  ```
- **Description**: Hitting API rate limits
- **Action**: Review rate limit configuration, implement backoff

### 5. Infrastructure Alerts

#### HighMemoryUsage
- **Severity**: Warning
- **Condition**: Container memory usage > 80%
- **Query**: 
  ```promql
  (
    container_memory_usage_bytes /
    container_spec_memory_limit_bytes
  ) > 0.8
  ```
- **Description**: Container approaching memory limit
- **Action**: Check for memory leaks, scale if needed

#### DiskSpaceLow
- **Severity**: High
- **Condition**: Disk usage > 85%
- **Query**: 
  ```promql
  (
    node_filesystem_avail_bytes /
    node_filesystem_size_bytes
  ) < 0.15
  ```
- **Description**: Running low on disk space
- **Action**: Clean up old data, expand storage

## Alert Routing

### Notification Channels

1. **Critical Alerts**
   - PagerDuty integration
   - Slack #alerts-critical
   - Email to on-call engineer

2. **High Severity**
   - Slack #alerts-high
   - Email to engineering team

3. **Warning**
   - Slack #alerts-warning
   - Dashboard annotations only

### Example Alertmanager Configuration

```yaml
route:
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h
  receiver: 'default'
  routes:
    - match:
        severity: critical
      receiver: pagerduty
    - match:
        severity: high
      receiver: slack-high
    - match:
        severity: warning
      receiver: slack-warning

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://localhost:9093/api/v1/alerts'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'

  - name: 'slack-high'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'
        channel: '#alerts-high'

  - name: 'slack-warning'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'
        channel: '#alerts-warning'
```

## Alert Testing

### Manual Alert Testing

```bash
# Trigger test alert
curl -X POST http://localhost:9090/-/reload

# Send test alert to Alertmanager
curl -H "Content-Type: application/json" -d '[
  {
    "labels": {
      "alertname": "TestAlert",
      "severity": "warning"
    },
    "annotations": {
      "summary": "This is a test alert"
    }
  }
]' http://localhost:9093/api/v1/alerts
```

### Alert Unit Tests

```promql
# Test queries in Prometheus console
# Example: Check if budget alert would fire
(1 - (ml_budget_remaining{period="daily"} / 100)) > 0.8
```

## Alert Suppression

### Maintenance Windows

```yaml
# In alerting rules
- alert: MLProducerDown
  expr: up{job="ml-producer"} == 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "ML Producer is down"
    description: "ML Producer has been down for more than 5 minutes"
    runbook_url: "https://wiki.bookmarkai.com/runbooks/ml-producer-down"
  # Suppress during maintenance
  inhibit_rules:
    - source_match:
        alertname: MaintenanceWindow
      target_match:
        alertname: MLProducerDown
```

### Alert Silencing

```bash
# Silence alerts via Alertmanager API
curl -X POST http://localhost:9093/api/v1/silences \
  -H "Content-Type: application/json" \
  -d '{
    "matchers": [
      {
        "name": "alertname",
        "value": "HighTaskFailureRate",
        "isRegex": false
      }
    ],
    "startsAt": "2024-06-29T12:00:00Z",
    "endsAt": "2024-06-29T14:00:00Z",
    "createdBy": "admin",
    "comment": "Scheduled maintenance"
  }'
```

## Best Practices

### Alert Design

1. **Actionable Alerts**
   - Every alert should have clear action steps
   - Include runbook links
   - Avoid noisy alerts

2. **Appropriate Thresholds**
   - Based on historical data
   - Account for normal variations
   - Regular threshold reviews

3. **Alert Fatigue Prevention**
   - Group related alerts
   - Use appropriate time windows
   - Implement smart routing

### Documentation

Each alert should include:
- Clear description
- Impact assessment
- Troubleshooting steps
- Escalation procedures
- Related dashboards/queries

### Regular Reviews

1. **Weekly Reviews**
   - Check alert frequency
   - Identify false positives
   - Adjust thresholds

2. **Monthly Analysis**
   - Alert effectiveness
   - Response times
   - Resolution patterns

## Runbook Links

- [ML Producer Down](https://wiki.bookmarkai.com/runbooks/ml-producer-down)
- [High Task Failure Rate](https://wiki.bookmarkai.com/runbooks/high-task-failure)
- [Budget Exceeded](https://wiki.bookmarkai.com/runbooks/budget-exceeded)
- [Circuit Breaker Open](https://wiki.bookmarkai.com/runbooks/circuit-breaker)
- [Rate Limit Exceeded](https://wiki.bookmarkai.com/runbooks/rate-limit)