# BookmarkAI Monitoring Documentation

This directory contains comprehensive documentation for monitoring all BookmarkAI services, including metrics endpoints, dashboards, and alerting configurations.

## Overview

BookmarkAI uses a comprehensive monitoring stack that includes:
- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation
- **Tempo**: Distributed tracing
- **Jaeger**: Additional distributed tracing UI
- **Flower**: Celery task monitoring

## Quick Links

- [Service Endpoints](./service-endpoints.md) - All monitoring endpoints and ports
- [Prometheus Metrics](./prometheus-metrics.md) - Available metrics and their meanings
- [Grafana Dashboards](./grafana-dashboards.md) - Dashboard descriptions and usage
- [Alerting Rules](./alerting-rules.md) - Configured alerts and thresholds
- [Troubleshooting Guide](./troubleshooting.md) - Common monitoring issues and solutions

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Gateway   │     │  Python Workers │     │     Services    │
│   Port: 3001    │     │  LLM: 9091     │     │  Postgres: 5433 │
│ /api/ml/metrics │     │  Whisper: 9092 │     │  Redis: 6379    │
└────────┬────────┘     │  Vector: 9093  │     │  RabbitMQ: 5672 │
         │              └────────┬────────┘     └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │ Prometheus  │
              │ Port: 9090  │
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │   Grafana   │
              │ Port: 3000  │
              └─────────────┘
```

## Getting Started

### Accessing Monitoring Tools

1. **Grafana**: http://localhost:3000
   - Default access: Anonymous with Admin role
   - Pre-configured dashboards available

2. **Prometheus**: http://localhost:9090
   - Query interface for metrics
   - Target status at `/targets`

3. **Jaeger**: http://localhost:16686
   - Distributed tracing UI
   - Service dependency graphs

4. **Flower**: http://localhost:5555
   - Celery task monitoring
   - Basic auth: `admin:bookmarkai123`

### Starting the Monitoring Stack

```bash
# Start all monitoring services
docker-compose -f docker/docker-compose.yml up -d

# Start ML workers with monitoring
docker-compose -f docker/docker-compose.ml.yml up -d

# Start monitoring profile services (includes Flower)
docker-compose -f docker/docker-compose.ml.yml --profile monitoring up -d
```

## Key Metrics

### API Gateway Metrics
- ML task publishing rates
- Connection health
- Circuit breaker status
- Request latencies

### Python Worker Metrics
- Task processing rates
- Model inference times
- Budget usage
- Queue depths

### Infrastructure Metrics
- Database connections
- Redis memory usage
- RabbitMQ queue sizes
- Container resource usage

## Alerting

Alerts are configured in:
- `/docker/prometheus/alerts/video-workflow-alerts.yml`
- `/docs/prometheus-alerts-ml.yml`

Key alerts include:
- High error rates
- Budget exceeded
- Service downtime
- Queue backlog