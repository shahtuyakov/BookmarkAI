# BookmarkAI Service Monitoring Endpoints

This document lists all monitoring endpoints and ports for BookmarkAI services.

## Core Infrastructure Services

### PostgreSQL (pgvector)
- **Port**: 5433 (host) → 5432 (container)
- **Container**: postgres
- **Monitoring**: Via Prometheus postgres_exporter (if configured)
- **Health Check**: `pg_isready -U ${DB_USER} -d ${DB_NAME}`

### Redis
- **Port**: 6379
- **Container**: redis
- **Monitoring**: Via Prometheus redis_exporter (if configured)
- **Health Check**: `redis-cli ping`

### RabbitMQ
- **AMQP Port**: 5672
- **Management UI**: 15672
- **Container**: ml-rabbitmq
- **Metrics Endpoint**: http://localhost:15672/api/metrics (requires auth)
- **Default Credentials**: ml:ml_password

### MinIO (S3-compatible storage)
- **API Port**: 9000
- **Console Port**: 9001
- **Container**: minio
- **Health Check**: http://localhost:9000/minio/health/live

### Vault
- **Port**: 8200
- **Container**: vault
- **Health Check**: `vault status`
- **Dev Token**: dev-token-bookmarkai

## Monitoring Stack

### Prometheus
- **Port**: 9090
- **Container**: prometheus
- **Web UI**: http://localhost:9090
- **Targets**: http://localhost:9090/targets
- **Config**: `/docker/prometheus/prometheus.yml`
- **Scrape Targets**:
  - ML Producer: `host.docker.internal:3001/api/ml/metrics/prometheus`
  - LLM Worker: `host.docker.internal:9091`
  - Whisper Worker: `host.docker.internal:9092`
  - Vector Worker: `host.docker.internal:9093`
  - Flower: `host.docker.internal:5555`

### Grafana
- **Port**: 3000
- **Container**: grafana
- **Web UI**: http://localhost:3000
- **Auth**: Anonymous access with Admin role
- **Dashboards**:
  - ML Analytics Dashboard
  - ML Producer Dashboard
  - Python ML Services Dashboard
  - Video Workflow Monitoring

### Loki (Log Aggregation)
- **Port**: 3100
- **Container**: loki
- **Push API**: http://localhost:3100/loki/api/v1/push
- **Query API**: http://localhost:3100/loki/api/v1/query

### Tempo (Distributed Tracing)
- **Tempo Port**: 3200
- **Jaeger Ingest**: 14268
- **Zipkin**: 9411
- **Container**: tempo

### Jaeger (Distributed Tracing UI)
- **UI Port**: 16686
- **OTLP HTTP**: 4318
- **OTLP gRPC**: 4317
- **Container**: jaeger
- **Web UI**: http://localhost:16686

## Application Services

### API Gateway
- **API Port**: 3001
- **Container**: Running on host (development)
- **Metrics Endpoints**:
  - Prometheus: `/api/ml/metrics/prometheus`
  - JSON: `/api/ml/metrics/json`
- **Health Check**: `/health`

### Python ML Workers

#### LLM Service (Summarization)
- **Metrics Port**: 9091
- **Container**: bookmarkai-llm-worker
- **Queue**: ml.summarize
- **Prometheus Endpoint**: http://localhost:9091
- **Multiproc Dir**: `/tmp/prometheus_multiproc_llm`

#### Whisper Service (Transcription)
- **Metrics Port**: 9092
- **Container**: bookmarkai-whisper-worker
- **Queue**: ml.transcribe
- **Prometheus Endpoint**: http://localhost:9092
- **Multiproc Dir**: `/tmp/prometheus_multiproc_whisper`

#### Vector Service (Embeddings)
- **Metrics Port**: 9093
- **Container**: bookmarkai-vector-worker
- **Queue**: ml.embed
- **Prometheus Endpoint**: http://localhost:9093
- **Multiproc Dir**: `/tmp/prometheus_multiproc_vector`

### Celery Flower (Task Monitoring)
- **Port**: 5555
- **Container**: bookmarkai-flower
- **Web UI**: http://localhost:5555
- **Auth**: Basic Auth (admin:bookmarkai123)
- **Profile**: monitoring (optional)

## Accessing Metrics

### Direct Access

```bash
# API Gateway ML metrics
curl http://localhost:3001/api/ml/metrics/prometheus

# Python worker metrics
curl http://localhost:9091  # LLM worker
curl http://localhost:9092  # Whisper worker
curl http://localhost:9093  # Vector worker

# RabbitMQ metrics (requires auth)
curl -u ml:ml_password http://localhost:15672/api/overview
```

### Via Prometheus

1. Open Prometheus UI: http://localhost:9090
2. Check targets status: http://localhost:9090/targets
3. Query metrics:
   - `ml_producer_tasks_sent_total`
   - `ml_cost_total`
   - `ml_audio_duration_seconds_total`
   - `ml_budget_remaining`

### Via Grafana

1. Open Grafana: http://localhost:3000
2. Navigate to Dashboards → Browse
3. Select pre-configured dashboards:
   - ML Analytics Dashboard
   - Python ML Services Dashboard
   - Video Workflow Monitoring

## Network Configuration

### Docker Networks
- **bookmarkai-network**: Main network for all services
- **bookmarkai-ml**: ML services network
- **bookmarkai-main**: External network connecting to main services

### Port Mapping Summary

| Service | Host Port | Container Port | Purpose |
|---------|-----------|----------------|---------|
| API Gateway | 3001 | 3001 | REST API & ML Metrics |
| PostgreSQL | 5433 | 5432 | Database |
| Redis | 6379 | 6379 | Cache & Queue Backend |
| RabbitMQ | 5672/15672 | 5672/15672 | Message Broker |
| MinIO | 9000/9001 | 9000/9001 | Object Storage |
| Prometheus | 9090 | 9090 | Metrics Storage |
| Grafana | 3000 | 3000 | Dashboards |
| Jaeger | 16686 | 16686 | Tracing UI |
| Flower | 5555 | 5555 | Celery Monitoring |
| LLM Worker | 9091 | 9091 | Metrics |
| Whisper Worker | 9092 | 9092 | Metrics |
| Vector Worker | 9093 | 9093 | Metrics |

## Troubleshooting

### Common Issues

1. **Metrics not appearing in Prometheus**
   - Check target status at http://localhost:9090/targets
   - Verify service is running: `docker ps`
   - Check network connectivity: `docker network ls`

2. **Grafana dashboards empty**
   - Verify Prometheus data source is configured
   - Check time range selection
   - Confirm metrics are being scraped

3. **Worker metrics not available**
   - Ensure PROMETHEUS_MULTIPROC_DIR is set
   - Check worker logs: `docker logs bookmarkai-llm-worker`
   - Verify metrics port is exposed

### Debug Commands

```bash
# Check service logs
docker logs bookmarkai-llm-worker
docker logs prometheus
docker logs grafana

# Test metrics endpoints
curl -v http://localhost:9091
curl -v http://localhost:3001/api/ml/metrics/prometheus

# Check network connectivity
docker exec prometheus ping host.docker.internal
```