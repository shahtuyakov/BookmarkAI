# Monitoring Troubleshooting Guide

This guide helps diagnose and resolve common monitoring issues in BookmarkAI.

## Quick Diagnostics

### Health Check Script

```bash
#!/bin/bash
# Save as check-monitoring.sh

echo "=== Checking Monitoring Stack Health ==="

# Check if services are running
echo -e "\n1. Service Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(prometheus|grafana|loki|tempo|jaeger|flower)"

# Check Prometheus targets
echo -e "\n2. Prometheus Targets:"
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# Check metrics endpoints
echo -e "\n3. Metrics Endpoints:"
for port in 3001 9091 9092 9093; do
  echo -n "Port $port: "
  curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/metrics || echo "Not responding"
done

# Check Grafana
echo -e "\n4. Grafana Status:"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health

echo -e "\n=== Health Check Complete ==="
```

## Common Issues and Solutions

### 1. Metrics Not Appearing in Prometheus

#### Symptoms
- Metrics queries return "no data"
- Prometheus targets show as "DOWN"
- Empty graphs in Grafana

#### Diagnosis
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check specific endpoint
curl -v http://localhost:9091  # Python worker example

# Check Docker networking
docker network ls
docker network inspect docker_bookmarkai-network
```

#### Solutions

**Service not running:**
```bash
# Start the service
docker-compose -f docker/docker-compose.ml.yml up -d llm-worker

# Check logs
docker logs bookmarkai-llm-worker --tail 50
```

**Network connectivity issues:**
```bash
# Test from Prometheus container
docker exec prometheus wget -O- http://host.docker.internal:9091

# If using Linux, may need to use container IP
docker inspect bookmarkai-llm-worker | grep IPAddress
```

**Metrics endpoint not exposed:**
```bash
# Check if port is mapped
docker port bookmarkai-llm-worker

# Verify environment variable
docker exec bookmarkai-llm-worker env | grep PROMETHEUS_METRICS_PORT
```

### 2. Grafana Dashboards Empty

#### Symptoms
- Dashboards show "No Data"
- Panels display errors
- Time series graphs are blank

#### Diagnosis
```bash
# Check Grafana data sources
curl -u admin:admin http://localhost:3000/api/datasources

# Test Prometheus query
curl "http://localhost:9090/api/v1/query?query=up"

# Check Grafana logs
docker logs grafana --tail 50
```

#### Solutions

**Wrong time range:**
- Adjust time range to when data was collected
- Check timezone settings

**Data source misconfigured:**
```bash
# Restart Grafana to reload provisioning
docker restart grafana

# Manually configure data source
# URL should be: http://prometheus:9090
```

**Query errors:**
- Use Query Inspector in panel edit mode
- Check for typos in metric names
- Verify label selectors

### 3. Python Worker Metrics Missing

#### Symptoms
- Worker endpoints return 404
- No worker metrics in Prometheus
- Multiprocess mode errors

#### Diagnosis
```bash
# Check worker logs
docker logs bookmarkai-whisper-worker --tail 100 | grep -i prometheus

# Verify multiproc directory
docker exec bookmarkai-whisper-worker ls -la /tmp/prometheus_multiproc_whisper/

# Check metrics server
docker exec bookmarkai-whisper-worker curl http://localhost:9092
```

#### Solutions

**Multiprocess directory issues:**
```bash
# Create directory in container
docker exec bookmarkai-whisper-worker mkdir -p /tmp/prometheus_multiproc_whisper
docker exec bookmarkai-whisper-worker chmod 777 /tmp/prometheus_multiproc_whisper
```

**Metrics server not started:**
```python
# Verify metrics initialization in worker code
# Should see prometheus_client.start_http_server(port)
```

**Environment variables:**
```yaml
# In docker-compose.ml.yml
environment:
  PROMETHEUS_METRICS_PORT: 9092
  PROMETHEUS_MULTIPROC_DIR: /tmp/prometheus_multiproc_whisper
```

### 4. High Memory Usage in Monitoring Stack

#### Symptoms
- Prometheus using excessive memory
- Grafana slow to respond
- Container restarts

#### Diagnosis
```bash
# Check memory usage
docker stats --no-stream | grep -E "(prometheus|grafana|loki)"

# Check Prometheus TSDB
docker exec prometheus du -sh /prometheus

# Check retention settings
docker exec prometheus cat /etc/prometheus/prometheus.yml | grep retention
```

#### Solutions

**Reduce retention:**
```yaml
# In docker-compose.yml
prometheus:
  command:
    - '--storage.tsdb.retention.time=7d'  # Default is 15d
    - '--storage.tsdb.retention.size=10GB'
```

**Optimize queries:**
- Use recording rules for complex queries
- Reduce dashboard refresh rates
- Limit query time ranges

**Resource limits:**
```yaml
# Add to service definition
deploy:
  resources:
    limits:
      memory: 2G
    reservations:
      memory: 1G
```

### 5. Flower Not Showing Tasks

#### Symptoms
- Flower UI shows no workers
- Task list is empty
- Connection errors

#### Diagnosis
```bash
# Check Flower logs
docker logs bookmarkai-flower

# Verify RabbitMQ connection
docker exec bookmarkai-flower celery -b amqp://ml:ml_password@rabbitmq:5672/ inspect active

# Check Flower API
curl -u admin:bookmarkai123 http://localhost:5555/api/workers
```

#### Solutions

**Connection string issues:**
```yaml
# Correct format in docker-compose.ml.yml
environment:
  CELERY_BROKER_URL: amqp://ml:ml_password@rabbitmq:5672/
```

**Authentication:**
- Verify RabbitMQ credentials
- Check basic auth for Flower UI

**Start with monitoring profile:**
```bash
docker-compose -f docker/docker-compose.ml.yml --profile monitoring up -d
```

### 6. Distributed Tracing Not Working

#### Symptoms
- No traces in Jaeger UI
- Tempo not receiving data
- Missing trace context

#### Diagnosis
```bash
# Check Jaeger
curl http://localhost:16686/api/services

# Check OTLP endpoint
curl -v http://localhost:4318/v1/traces

# Verify trace propagation
docker logs bookmarkai-llm-worker | grep -i trace
```

#### Solutions

**OTLP configuration:**
```python
# In application code
from opentelemetry.exporter.otlp.proto.http import OTLPSpanExporter

otlp_exporter = OTLPSpanExporter(
    endpoint="http://jaeger:4318/v1/traces"
)
```

**Environment variables:**
```yaml
environment:
  OTEL_EXPORTER_OTLP_ENDPOINT: http://jaeger:4318
  OTEL_SERVICE_NAME: bookmarkai-llm-worker
```

## Performance Optimization

### Prometheus Query Optimization

```promql
# Bad: Queries all time series
sum(rate(ml_cost_total[5m]))

# Good: Filters early
sum(rate(ml_cost_total{worker="llm"}[5m]))

# Use recording rules for complex queries
# In prometheus rules file:
groups:
  - name: ml_aggregations
    rules:
      - record: ml:cost_rate5m
        expr: sum(rate(ml_cost_total[5m])) by (service_type, worker)
```

### Grafana Dashboard Optimization

1. **Reduce Query Frequency**
   - Set appropriate refresh intervals
   - Use `$__interval` variable
   - Cache static queries

2. **Optimize Panel Queries**
   - Limit time ranges
   - Use `max_data_points`
   - Pre-aggregate in Prometheus

3. **Dashboard Settings**
   ```json
   {
     "refresh": "30s",
     "time": {
       "from": "now-6h",
       "to": "now"
     },
     "timezone": "browser"
   }
   ```

## Debugging Tools

### Prometheus Tools

```bash
# Check metric cardinality
curl -s http://localhost:9090/api/v1/label/__name__/values | jq '. | length'

# Find high cardinality metrics
curl -s http://localhost:9090/api/v1/query?query=prometheus_tsdb_symbol_table_size_bytes | jq

# Export metrics for analysis
curl -s http://localhost:9090/api/v1/query?query='{__name__=~"ml_.*"}' > metrics_dump.json
```

### Log Analysis

```bash
# Aggregate logs by service
docker-compose logs --tail=1000 | grep ERROR | sort | uniq -c

# Follow specific service logs
docker logs -f bookmarkai-llm-worker 2>&1 | grep -i metric

# Export logs for analysis
docker logs bookmarkai-whisper-worker > whisper_logs.txt 2>&1
```

### Network Debugging

```bash
# Check connectivity between containers
docker exec prometheus ping -c 3 host.docker.internal

# Trace network path
docker exec prometheus traceroute host.docker.internal

# Check DNS resolution
docker exec prometheus nslookup rabbitmq
```

## Maintenance Tasks

### Regular Cleanup

```bash
#!/bin/bash
# Monitoring cleanup script

# Clean up old Prometheus data
docker exec prometheus rm -rf /prometheus/snapshots/*

# Clean up Grafana temp files
docker exec grafana rm -rf /tmp/*

# Clean up Loki chunks
docker exec loki rm -rf /var/lib/loki/chunks_old

# Restart services
docker-compose -f docker/docker-compose.yml restart prometheus grafana loki
```

### Backup Procedures

```bash
# Backup Prometheus data
docker exec prometheus promtool tsdb snapshot /prometheus
docker cp prometheus:/prometheus/snapshots ./prometheus_backup

# Backup Grafana dashboards
for dashboard in $(curl -s http://localhost:3000/api/search | jq -r '.[].uid'); do
  curl -s http://localhost:3000/api/dashboards/uid/$dashboard > dashboard_$dashboard.json
done

# Backup alert rules
docker cp prometheus:/etc/prometheus/alerts ./alerts_backup
```

## Emergency Procedures

### Complete Monitoring Reset

```bash
# Stop all monitoring services
docker-compose -f docker/docker-compose.yml down

# Remove volumes (WARNING: Loses all data)
docker volume rm docker_prometheus-data docker_grafana-data docker_loki-data

# Restart fresh
docker-compose -f docker/docker-compose.yml up -d
```

### Service Recovery

```bash
# If Prometheus is corrupted
docker exec prometheus promtool tsdb repair /prometheus

# If Grafana won't start
docker exec grafana grafana-cli admin reset-admin-password admin

# If workers won't connect
docker-compose -f docker/docker-compose.ml.yml restart
```

## Getting Help

### Log Collection for Support

```bash
# Collect comprehensive logs
mkdir monitoring_debug
docker-compose logs > monitoring_debug/compose_logs.txt
docker ps -a > monitoring_debug/container_status.txt
docker network ls > monitoring_debug/networks.txt
tar -czf monitoring_debug.tar.gz monitoring_debug/
```

### Useful Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Troubleshooting](https://grafana.com/docs/grafana/latest/troubleshooting/)
- [Docker Networking Guide](https://docs.docker.com/network/)
- [Celery Monitoring](https://docs.celeryproject.org/en/stable/userguide/monitoring.html)