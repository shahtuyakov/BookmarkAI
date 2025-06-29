# BookmarkAI KEDA Autoscaling Configuration

This directory contains Kubernetes manifests for deploying BookmarkAI ML workers with KEDA autoscaling.

## Overview

The ML workers (LLM, Whisper, Vector) are deployed as Kubernetes Deployments with KEDA ScaledObjects that automatically scale based on:
- RabbitMQ queue length
- CPU/Memory utilization
- Custom Prometheus metrics
- Task processing rates

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│    RabbitMQ     │────▶│   ML Workers    │
│   (Publishes)   │     │    (Queues)     │     │  (KEDA Scaled)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                          │
                               ▼                          ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │      KEDA       │     │   Prometheus    │
                        │   (Monitors)    │────▶│   (Metrics)     │
                        └─────────────────┘     └─────────────────┘
```

## Prerequisites

1. **Kubernetes Cluster** (1.23+)
2. **KEDA** installed (v2.13.0)
3. **Prometheus** for metrics
4. **RabbitMQ** deployed
5. **PostgreSQL** with pgvector
6. **Redis** for Celery results

## Installation

### 1. Install KEDA

```bash
# Using kubectl
kubectl apply --server-side -f https://github.com/kedacore/keda/releases/download/v2.13.0/keda-2.13.0.yaml

# Or using Helm
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda --create-namespace --version 2.13.0
```

### 2. Deploy Base Configuration

```bash
# Create namespaces and base resources
kubectl apply -k k8s/base/

# For specific environment (dev/staging/prod)
kubectl apply -k k8s/overlays/dev/
```

### 3. Using Helm (Alternative)

```bash
# Install dependencies
cd helm/bookmarkai-ml
helm dependency update

# Install the chart
helm install bookmarkai-ml . \
  --namespace bookmarkai-ml \
  --create-namespace \
  --values values.yaml \
  --set rabbitmq.password=your-password \
  --set postgresql.password=your-password
```

## Scaling Configuration

### LLM Worker
- **Queue**: `ml.summarize`
- **Min Replicas**: 1
- **Max Replicas**: 10
- **Target Queue Length**: 5 messages per replica
- **Scale Up**: When queue > 5 messages or CPU > 70%
- **Scale Down**: After 5 minutes of low activity

### Whisper Worker
- **Queue**: `ml.transcribe`
- **Min Replicas**: 1
- **Max Replicas**: 5
- **Target Queue Length**: 2 messages per replica
- **Scale Up**: When queue > 2 messages or Memory > 70%
- **Scale Down**: After 10 minutes (longer due to resource intensity)

### Vector Worker
- **Queue**: `ml.embed`
- **Min Replicas**: 1 (always ready)
- **Max Replicas**: 20
- **Target Queue Length**: 10 messages per replica
- **Scale Up**: Aggressive scaling for batch processing
- **Scale Down**: After 3 minutes

## Custom Metrics

The configuration uses several custom metrics:

1. **Queue Length**: Direct RabbitMQ queue monitoring
2. **Task Rate**: `celery_task_received_total` rate
3. **Processing Duration**: `ml_*_duration_seconds` histograms
4. **Batch Size**: `ml_embedding_batch_size` for vector tasks

## Resource Management

### Resource Requests/Limits

| Worker  | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---------|-------------|-----------|----------------|--------------|
| LLM     | 500m        | 2000m     | 1Gi            | 2Gi          |
| Whisper | 1000m       | 4000m     | 2Gi            | 4Gi          |
| Vector  | 250m        | 1000m     | 512Mi          | 1Gi          |

### Storage

- Whisper worker uses PVC for video storage (50Gi)
- Prometheus multiproc directory for metrics
- EmptyDir volumes for temporary data

## Monitoring

### Prometheus Metrics

All workers expose metrics on:
- LLM: Port 9091
- Whisper: Port 9092
- Vector: Port 9093

### Key Metrics to Monitor

```promql
# Queue depth
rabbitmq_queue_messages{queue="ml.summarize"}

# Task processing rate
rate(celery_task_received_total[5m])

# Worker saturation
sum(celery_worker_busy) by (worker_type)

# Scaling events
keda_scaler_active{scaledObject="llm-worker-scaler"}
```

## Troubleshooting

### Workers Not Scaling

1. Check KEDA operator logs:
```bash
kubectl logs -n keda deployment/keda-operator
```

2. Verify ScaledObject status:
```bash
kubectl describe scaledobject llm-worker-scaler -n bookmarkai-ml
```

3. Check RabbitMQ connection:
```bash
kubectl logs -n bookmarkai-ml deployment/llm-worker | grep AMQP
```

### High Resource Usage

1. Review current scaling:
```bash
kubectl get hpa -n bookmarkai-ml
kubectl get pods -n bookmarkai-ml -l app=llm-worker
```

2. Check metrics:
```bash
kubectl top pods -n bookmarkai-ml
```

### Slow Scale Down

KEDA uses stabilization windows to prevent flapping:
- Increase `cooldownPeriod` for more stability
- Decrease for faster scale down
- Adjust `pollingInterval` for responsiveness

## Security Considerations

1. **Secrets Management**: Use Kubernetes secrets or external secret operators
2. **Network Policies**: Implement to restrict pod communication
3. **Pod Security**: Non-root user, read-only filesystem
4. **RBAC**: KEDA requires specific permissions for scaling

## Production Checklist

- [ ] Configure proper resource limits based on load testing
- [ ] Set up PodDisruptionBudgets for availability
- [ ] Implement proper secret management (e.g., Sealed Secrets)
- [ ] Configure node affinity for GPU nodes (if needed)
- [ ] Set up monitoring and alerting
- [ ] Test scaling behavior under load
- [ ] Configure proper log aggregation
- [ ] Implement backup strategy for persistent volumes

## Advanced Configuration

### Custom Scaling Behavior

Modify the `behavior` section in ScaledObjects for fine-tuned control:

```yaml
behavior:
  scaleUp:
    policies:
    - type: Percent
      value: 200  # Scale up by 200%
      periodSeconds: 30
  scaleDown:
    policies:
    - type: Pods
      value: 1  # Remove 1 pod at a time
      periodSeconds: 60
```

### Multi-Region Deployment

For multi-region setups:
1. Use regional RabbitMQ clusters
2. Configure KEDA per region
3. Implement cross-region metrics aggregation

## Contributing

When modifying scaling configurations:
1. Test in development environment first
2. Monitor metrics for at least 24 hours
3. Document any custom metrics or triggers
4. Update resource recommendations based on profiling