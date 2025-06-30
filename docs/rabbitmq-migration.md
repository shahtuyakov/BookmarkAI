# RabbitMQ Migration Guide: Docker to Amazon MQ

## Overview
This guide documents the migration from a single Docker RabbitMQ instance to a highly available Amazon MQ RabbitMQ cluster.

## Architecture Changes

### Current State
- Single RabbitMQ container in Docker
- Local connection: `amqp://ml:ml_password@localhost:5672/`
- No TLS/SSL encryption
- Manual management and updates

### Target State
- Amazon MQ managed RabbitMQ cluster
- Multi-AZ deployment (production)
- TLS/SSL encryption: `amqps://ml:****@b-xxxx.mq.region.amazonaws.com:5671/`
- Automatic failover and backups
- CloudWatch monitoring and alerts

## Deployment Steps

### 1. Deploy RabbitMQ Infrastructure

```bash
# Set AWS credentials
export AWS_PROFILE=bookmarkai-dev
export CDK_DEFAULT_ACCOUNT=123456789012  # Replace with your AWS account ID
export CDK_DEFAULT_REGION=us-east-1

# Optional: Set email for CloudWatch alerts
export ALERT_EMAIL=alerts@example.com

# Deploy the RabbitMQ stack
cd infrastructure
npm run build
cdk deploy BookmarkAI-RabbitMQ-Dev
```

### 2. Retrieve Connection Information

After deployment, note the outputs:
- **BrokerEndpoint**: The AMQPS endpoint URL
- **BrokerSecretArn**: ARN of the secret containing credentials
- **BrokerConsoleUrl**: Management console URL

### 3. Update Environment Variables

Update your `.env` files with the new connection information:

```bash
# Old configuration
RABBITMQ_URL=amqp://ml:ml_password@localhost:5672/
MQ_HOST=localhost
MQ_PORT=5672
MQ_USER=ml
MQ_PASSWORD=ml_password

# New configuration
RABBITMQ_URL=amqps://ml:${RABBITMQ_PASSWORD}@${RABBITMQ_ENDPOINT}:5671/
RABBITMQ_USE_SSL=true
RABBITMQ_VERIFY_PEER=true
MQ_HOST=${RABBITMQ_ENDPOINT}
MQ_PORT=5671
MQ_USER=ml
MQ_PASSWORD=${RABBITMQ_PASSWORD}  # Retrieved from Secrets Manager
```

### 4. Retrieve Password from Secrets Manager

```bash
# Get the password from AWS Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id bookmarkai/dev/rabbitmq \
  --query SecretString \
  --output text | jq -r '.password'
```

### 5. Update Application Code

The application code updates are required for TLS support:
- Python Celery configuration (see next steps)
- Node.js ML Producer (see next steps)

### 6. Migration Strategy

#### Phase 1: Parallel Testing (Recommended)
1. Deploy Amazon MQ cluster
2. Update staging environment to use Amazon MQ
3. Run tests to verify functionality
4. Monitor for any issues

#### Phase 2: Gradual Migration
1. Update services one by one:
   - Start with non-critical services
   - Monitor each service after update
   - Roll back if issues occur
2. Use feature flags to switch between local and cloud RabbitMQ

#### Phase 3: Production Cutover
1. Schedule maintenance window
2. Stop all services
3. Export queue definitions from Docker RabbitMQ
4. Import queue definitions to Amazon MQ (if needed)
5. Update all services with new connection strings
6. Start services and verify
7. Keep Docker RabbitMQ running for 48 hours as backup

## Monitoring and Alerts

### CloudWatch Metrics
The stack creates the following alarms:
- CPU utilization > 80%
- Memory usage > 80%
- Connection count anomalies
- Message throughput drops

### Management Console
Access the RabbitMQ management console:
1. Use the URL from stack outputs
2. Login with username: `ml`
3. Password from Secrets Manager

### Logs
CloudWatch Logs are available at:
`/aws/amazonmq/broker/bookmarkai-dev`

## Rollback Plan

If issues occur during migration:

1. **Immediate Rollback**:
   ```bash
   # Revert environment variables
   RABBITMQ_URL=amqp://ml:ml_password@localhost:5672/
   RABBITMQ_USE_SSL=false
   # Restart services
   ```

2. **Data Recovery**:
   - Queues are durable and will persist
   - Messages in flight may need reprocessing
   - Monitor dead letter queues

## Cost Considerations

### Development Environment
- Instance: mq.t3.micro
- Cost: ~$25/month
- Single instance (no HA)

### Production Environment
- Instance: mq.m5.large (3 nodes)
- Cost: ~$750/month
- Multi-AZ deployment
- Automatic backups

## Security Considerations

1. **Network Security**:
   - Broker is not publicly accessible
   - Only accessible within VPC
   - Security group restricts access

2. **Encryption**:
   - TLS 1.2 for all connections
   - Encryption at rest enabled
   - Secrets stored in AWS Secrets Manager

3. **Authentication**:
   - Username/password authentication
   - Consider IAM authentication for production

## Troubleshooting

### Connection Issues
```bash
# Test connection with amqp-tools
npm install -g amqp-tools
amqp-declare-queue --url="amqps://ml:password@broker-endpoint:5671/" --queue=test

# Check security group rules
aws ec2 describe-security-groups --group-ids sg-xxxxxx
```

### TLS Certificate Issues
```bash
# Verify TLS connection
openssl s_client -connect broker-endpoint:5671 -servername broker-endpoint
```

### Performance Issues
- Check CloudWatch metrics
- Verify instance size is appropriate
- Review queue configurations

## Next Steps

After successful infrastructure deployment:
1. Update Python Celery configuration for TLS support
2. Update Node.js ML Producer for TLS support
3. Test with non-production workloads
4. Plan production migration schedule