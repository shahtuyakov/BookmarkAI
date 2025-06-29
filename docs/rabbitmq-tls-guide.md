# RabbitMQ TLS/SSL Configuration Guide

## Overview
This guide covers setting up RabbitMQ with TLS/SSL support for both local development (using Docker cluster) and production (using Amazon MQ or other cloud services).

## Quick Start

### 1. Start Local RabbitMQ Cluster
```bash
# Start the 3-node RabbitMQ cluster with HAProxy
./scripts/start-rabbitmq-cluster.sh

# Test connections
./scripts/test-rabbitmq-tls.sh

# Stop cluster
./scripts/stop-rabbitmq-cluster.sh
```

### 2. Configure Your Application

#### For Non-TLS (Development - Cluster)
```bash
# .env
RABBITMQ_URL=amqp://ml:ml_password@localhost:5680/
CELERY_BROKER_URL=amqp://ml:ml_password@localhost:5680/
RABBITMQ_USE_SSL=false
```

#### For TLS (Production/Testing - Cluster)
```bash
# .env
RABBITMQ_URL=amqps://ml:ml_password@localhost:5690/
CELERY_BROKER_URL=amqps://ml:ml_password@localhost:5690/
RABBITMQ_USE_SSL=true
RABBITMQ_VERIFY_PEER=false  # For self-signed certs
```

#### Keep Using Existing Single Instance
```bash
# .env (no changes needed)
RABBITMQ_URL=amqp://ml:ml_password@localhost:5672/
CELERY_BROKER_URL=amqp://ml:ml_password@localhost:5672/
RABBITMQ_USE_SSL=false
```

## Architecture

### Local Cluster Setup
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ RabbitMQ 1  │     │ RabbitMQ 2  │     │ RabbitMQ 3  │
│  Port 5672  │     │  Port 5673  │     │  Port 5675  │
│  Port 5671  │     │  Port 5674  │     │  Port 5676  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                    ┌──────┴──────┐
                    │   HAProxy    │
                    │ Port 5670/69 │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │ Application │
                    └─────────────┘
```

### Connection Options
1. **Direct Node Access**: Connect directly to any node
2. **Load Balanced**: Connect through HAProxy for automatic failover
3. **TLS Support**: Both AMQP (5670) and AMQPS (5669) protocols

## TLS/SSL Configuration

### Self-Signed Certificates (Development)
The cluster setup automatically generates self-signed certificates:
```bash
cd docker/rabbitmq-cluster
./generate-certificates.sh
```

Generated files:
- `ca_certificate.pem` - Certificate Authority
- `server_certificate.pem` - Server certificate
- `server_key.pem` - Server private key
- `client_certificate.pem` - Client certificate (optional)
- `client_key.pem` - Client private key (optional)

### Python Configuration
The Python Celery configuration (`celery_config.py`) now supports:
- Automatic TLS detection from URL scheme
- Certificate verification options
- Custom CA certificates
- Client certificates for mutual TLS

Example with custom CA:
```python
os.environ['RABBITMQ_SSL_CACERT'] = '/path/to/ca_certificate.pem'
os.environ['RABBITMQ_VERIFY_PEER'] = 'true'
```

### Node.js Configuration
The ML Producer service (`ml-producer.service.ts`) now supports:
- Automatic TLS detection
- Certificate options for self-signed certs
- Connection options pass-through

Example for self-signed certificates:
```javascript
// Automatically handled when RABBITMQ_USE_SSL=true
// Or when URL starts with amqps://
```

## Testing TLS Connections

### Manual Testing
```bash
# Test non-TLS
curl -i -u ml:ml_password http://localhost:15670/api/overview

# Test with OpenSSL
openssl s_client -connect localhost:5671 -servername localhost

# Test with Python
python3 -c "
import pika
params = pika.URLParameters('amqps://ml:ml_password@localhost:5669/')
params.ssl_options.check_hostname = False
params.ssl_options.verify_mode = ssl.CERT_NONE
connection = pika.BlockingConnection(params)
print('Connected!')
connection.close()
"
```

### Automated Testing
```bash
# Run the test script
./scripts/test-rabbitmq-tls.sh
```

## High Availability Features

### Automatic Failover
HAProxy monitors all nodes and automatically routes traffic to healthy nodes:
- Health checks every 5 seconds
- Node marked down after 3 failures
- Node marked up after 2 successes

### Quorum Queues
The cluster automatically creates quorum queues for ML workloads:
```javascript
{
  'x-queue-type': 'quorum',
  'x-delivery-limit': 5,
  'replication-factor': 3
}
```

### Monitoring
- HAProxy stats: http://localhost:8404/stats (admin/admin)
- RabbitMQ Management: http://localhost:15670 (ml/ml_password)
- Prometheus metrics: Available on each node

## Migration Strategies

### From Single Instance to Cluster
1. Start cluster alongside existing instance
2. Update connection string to use cluster
3. Verify all services connected
4. Stop old instance

### From Local to Cloud (Amazon MQ)
1. Deploy Amazon MQ using CDK stack
2. Update connection strings to use AMQPS
3. No certificate configuration needed (handled by AWS)
4. Update environment variables

## Troubleshooting

### Connection Refused
- Check if all containers are running: `docker compose -f docker/docker-compose.rabbitmq-cluster.yml ps`
- Verify ports are not in use: `lsof -i :5670`

### TLS Handshake Failures
- Check certificate validity: `openssl x509 -in certificates/server_certificate.pem -text`
- Disable peer verification for self-signed: `RABBITMQ_VERIFY_PEER=false`
- Check certificate paths are correct

### Cluster Formation Issues
- Check Erlang cookie matches on all nodes
- Verify network connectivity between containers
- Check cluster status: `docker exec rabbitmq-node1 rabbitmqctl cluster_status`

### Performance Issues
- Monitor HAProxy stats for distribution
- Check queue depths in management UI
- Verify consumer counts are balanced

## Best Practices

1. **Development**: Use non-TLS with load balancer for simplicity
2. **Staging**: Use TLS with self-signed certificates
3. **Production**: Use managed service (Amazon MQ) or proper certificates
4. **Always**: Configure heartbeat and timeouts appropriately
5. **Monitor**: Set up alerts for queue depth and connection counts

## Environment Variables Reference

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| RABBITMQ_URL | Full connection URL | amqp://ml:ml_password@localhost:5672/ | amqps://ml:pass@host:5671/ |
| RABBITMQ_USE_SSL | Enable TLS | false | true |
| RABBITMQ_VERIFY_PEER | Verify server certificate | true | false |
| RABBITMQ_SSL_PROTOCOL | TLS protocol version | PROTOCOL_TLSv1_2 | PROTOCOL_TLSv1_3 |
| RABBITMQ_SSL_CACERT | CA certificate path | - | /path/to/ca.pem |
| RABBITMQ_SSL_CERTFILE | Client certificate | - | /path/to/client.pem |
| RABBITMQ_SSL_KEYFILE | Client private key | - | /path/to/client-key.pem |
| RABBITMQ_HEARTBEAT | Heartbeat interval (seconds) | 60 | 30 |
| RABBITMQ_CONNECTION_TIMEOUT | Connection timeout | 30 | 60 |
| CELERY_BROKER_POOL_LIMIT | Connection pool size | 10 | 20 |