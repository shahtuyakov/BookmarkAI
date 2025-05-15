# BookmarkAI Docker Environment

This directory contains Docker Compose configuration for all required services.

## Services
- **Postgres**: Database with pgvector extension
- **Redis**: Caching and message queue
- **MinIO**: S3-compatible object storage
- **Loki**: Log aggregation
- **Tempo**: Distributed tracing
- **Grafana**: Visualization dashboard
- **Prometheus**: Metrics collection

## Development Tools
- **pgAdmin**: Postgres management UI (http://localhost:5050)
- **MinIO Console**: Object storage UI (http://localhost:9001)
- **Grafana Dashboard**: Monitoring UI (http://localhost:3000)

## Usage

Start the environment:
```
./scripts/docker-start.sh
```

Stop the environment:
```
./scripts/docker-stop.sh
```

## Connecting to Services

### Postgres
- **Host**: localhost
- **Port**: 5433  # Changed from 5432
- **User**: bookmarkai
- **Password**: bookmarkai_password
- **Database**: bookmarkai_dev

### Redis
- **Host**: localhost
- **Port**: 6379

### MinIO
- **Endpoint**: http://localhost:9000
- **Access Key**: minioadmin
- **Secret Key**: minioadmin
- **Buckets**: bookmarkai-media, bookmarkai-storyboards
