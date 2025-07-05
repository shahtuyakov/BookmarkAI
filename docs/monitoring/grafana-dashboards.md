# Grafana Dashboards Guide

This document describes the Grafana dashboards available for monitoring BookmarkAI services.

## Accessing Grafana

- **URL**: http://localhost:3000
- **Authentication**: Anonymous access with Admin role (development)
- **Default Time Range**: Last 6 hours

## Pre-configured Dashboards

### 1. ML Analytics Dashboard
**File**: `/docker/grafana/provisioning/dashboards/ml-analytics-dashboard.json`

#### Overview
Comprehensive view of all ML operations across the system, including costs, performance, and usage patterns.

#### Key Panels
- **ML Costs Overview**
  - Total costs by service type (transcription, summarization, embedding)
  - Cost trends over time
  - Budget utilization gauges

- **Processing Volume**
  - Audio minutes transcribed
  - Documents summarized
  - Embeddings generated

- **Model Performance**
  - Inference latencies by model
  - Success/failure rates
  - Queue depths

#### Use Cases
- Monitor ML spending against budgets
- Identify cost optimization opportunities
- Track ML usage patterns

### 2. ML Producer Dashboard
**File**: `/docker/grafana/provisioning/dashboards/ml-producer-dashboard.json`

#### Overview
Focuses on the API Gateway's ML task publishing system and RabbitMQ integration.

#### Key Panels
- **Task Publishing**
  - Tasks sent by type (real-time counter)
  - Success/failure/timeout breakdown
  - Publishing latency histogram

- **Connection Health**
  - RabbitMQ connection state
  - Reconnection attempts
  - Error types and frequencies

- **Circuit Breaker**
  - Current state (open/closed/half-open)
  - Trip history
  - Recovery patterns

- **Performance Metrics**
  - Message size distribution
  - Publishing duration percentiles
  - Throughput graphs

#### Use Cases
- Monitor API Gateway health
- Debug connection issues
- Optimize message publishing

### 3. Python ML Services Dashboard
**File**: `/docker/grafana/provisioning/dashboards/python-ml-services-dashboard.json`

#### Overview
Detailed metrics for Python ML workers (LLM, Whisper, Vector services).

#### Key Panels
- **Worker Status**
  - Active workers by type
  - Task processing rates
  - Worker utilization

- **Task Execution**
  - Task duration by type
  - Success/failure rates
  - Retry patterns

- **Budget Monitoring**
  - Remaining budget (hourly/daily)
  - Budget exceeded events
  - Cost per task type

- **Performance Analysis**
  - Model latency breakdowns
  - Queue wait times
  - Processing throughput

#### Use Cases
- Monitor worker health
- Track budget consumption
- Identify performance bottlenecks

### 4. Video Workflow Monitoring
**File**: `/docker/grafana/provisioning/dashboards/video-workflow-monitoring.json`

#### Overview
End-to-end monitoring of video processing workflows.

#### Key Panels
- **Workflow Overview**
  - Videos processed
  - Average processing time
  - Success rate

- **Stage Breakdown**
  - Download duration
  - Transcription time
  - Summarization time
  - Embedding generation time

- **Error Analysis**
  - Failure points
  - Error types
  - Retry success rates

- **Resource Usage**
  - Storage consumption
  - Network bandwidth
  - Compute utilization

#### Use Cases
- Track video processing SLAs
- Identify workflow bottlenecks
- Monitor resource consumption

## Dashboard Features

### Time Range Selection
- Quick ranges: Last 5m, 15m, 30m, 1h, 6h, 12h, 24h, 7d, 30d
- Custom range picker
- Auto-refresh options: 5s, 10s, 30s, 1m, 5m

### Variable Templates
Most dashboards include template variables for filtering:
- `worker_type`: Filter by ML worker (llm, whisper, vector)
- `task_type`: Filter by task type
- `time_range`: Dynamic time range selection

### Annotations
- Deployment markers
- Incident annotations
- Budget threshold crossings

### Alerting Integration
Dashboards are integrated with Prometheus alerts:
- Visual alert indicators
- Alert history panels
- Direct links to alert details

## Creating Custom Dashboards

### Data Sources
All dashboards use the following data sources:
- **Prometheus**: Primary metrics source
- **Loki**: Log queries (if needed)
- **Tempo**: Trace data (if needed)

### Panel Types
Common panel types used:
- **Graph**: Time series data
- **Stat**: Single statistics
- **Gauge**: Progress/utilization
- **Table**: Detailed breakdowns
- **Heatmap**: Distribution analysis

### Query Examples

#### Task Success Rate
```promql
sum(rate(ml_producer_tasks_sent_total{status="success"}[5m])) by (task_type) / 
sum(rate(ml_producer_tasks_sent_total[5m])) by (task_type)
```

#### Cost per Hour
```promql
sum(increase(ml_cost_total[1h])) by (service_type)
```

#### Worker Utilization
```promql
avg(rate(celery_task_duration_seconds_sum[5m])) by (worker_type) / 
(avg(celery_worker_concurrency) by (worker_type) * 60)
```

## Dashboard Management

### Importing Dashboards
1. Navigate to Dashboards → Browse
2. Click "Import"
3. Upload JSON file or paste JSON
4. Select data source mappings
5. Click "Import"

### Exporting Dashboards
1. Open dashboard
2. Click share icon → Export
3. Choose "Export for sharing externally"
4. Save JSON file

### Version Control
Dashboard JSON files are stored in:
```
/docker/grafana/provisioning/dashboards/
```

These are automatically loaded when Grafana starts.

## Best Practices

### Dashboard Design
1. **Organization**
   - Group related metrics
   - Use consistent color schemes
   - Maintain logical flow

2. **Performance**
   - Limit number of queries per panel
   - Use appropriate time ranges
   - Cache frequent queries

3. **Usability**
   - Add helpful descriptions
   - Use meaningful panel titles
   - Include units and thresholds

### Query Optimization
1. **Aggregation**
   - Pre-aggregate where possible
   - Use recording rules for complex queries
   - Minimize label cardinality

2. **Time Windows**
   - Match query ranges to display needs
   - Use appropriate functions (rate, increase, etc.)
   - Consider data retention policies

## Troubleshooting

### Common Issues

1. **No Data**
   - Check Prometheus targets
   - Verify time range selection
   - Confirm metrics are being scraped

2. **Slow Queries**
   - Reduce time range
   - Simplify aggregations
   - Check Prometheus performance

3. **Missing Panels**
   - Verify data source configuration
   - Check panel query syntax
   - Review Grafana logs

### Debug Mode
Enable query inspector:
1. Edit panel
2. Click "Query Inspector"
3. View raw query and response

## Alert Dashboard Integration

### Alert Status Panels
Include alert status in dashboards:
```promql
ALERTS{alertname=~"ML.*", alertstate="firing"}
```

### Alert History
Show recent alert activations:
```promql
changes(ALERTS_FOR_STATE[24h])
```

## Mobile and TV Mode

### Mobile View
- Responsive design enabled
- Simplified layouts available
- Touch-friendly controls

### TV/Kiosk Mode
1. Append `&kiosk` to URL
2. Auto-cycles through dashboards
3. Hides all UI chrome

Example:
```
http://localhost:3000/d/ml-analytics/ml-analytics-dashboard?kiosk
```