# RabbitMQ Infrastructure Deployment

## Overview
This CDK stack deploys Amazon MQ for RabbitMQ to provide a highly available message broker for BookmarkAI ML services.

## Features
- **High Availability**: Multi-AZ deployment for production (single instance for dev)
- **Security**: TLS encryption, VPC isolation, IAM integration
- **Monitoring**: CloudWatch metrics and alarms
- **Backup**: Automatic daily backups with 7-day retention
- **Management**: Web-based management console

## Prerequisites
1. AWS CDK CLI installed: `npm install -g aws-cdk`
2. AWS credentials configured
3. Node.js 18+ and npm installed
4. VPC already deployed (via DatabaseStack)

## Stack Configuration

### Development Environment
- Instance Type: `mq.t3.micro` (1 vCPU, 1GB RAM)
- Deployment: Single instance
- Cost: ~$25/month

### Production Environment
- Instance Type: `mq.m5.large` (2 vCPU, 8GB RAM)
- Deployment: 3-node cluster across multiple AZs
- Cost: ~$750/month

## Deployment Instructions

### 1. Install Dependencies
```bash
cd infrastructure
npm install
```

### 2. Configure Environment
```bash
# Set AWS account and region
export CDK_DEFAULT_ACCOUNT=123456789012  # Your AWS account ID
export CDK_DEFAULT_REGION=us-east-1

# Optional: Set alert email for CloudWatch notifications
export ALERT_EMAIL=alerts@example.com
```

### 3. Deploy the Stack
```bash
# Build TypeScript
npm run build

# Deploy RabbitMQ stack
cdk deploy BookmarkAI-RabbitMQ-Dev

# Or deploy all stacks
cdk deploy --all
```

### 4. Get Connection Information
After deployment, note these outputs:
- `BrokerEndpoint`: AMQPS endpoint for connections
- `BrokerSecretArn`: Secret containing credentials
- `BrokerConsoleUrl`: Management console URL

### 5. Retrieve Credentials
```bash
# Get the password from Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id bookmarkai/dev/rabbitmq \
  --query SecretString \
  --output text | jq -r '.password'
```

## Stack Resources

### Network Resources
- Security Group with AMQPS (5671) and HTTPS (443) access
- VPC endpoints for AWS services
- Private subnet deployment

### Amazon MQ Resources
- RabbitMQ broker (version 3.13)
- Configuration with optimized settings
- CloudWatch log group

### Monitoring Resources
- CPU utilization alarm (>80%)
- Memory usage alarm (>80%)
- Optional SNS topic for email alerts

### Security Resources
- Secrets Manager secret for credentials
- IAM roles and policies
- Encryption at rest and in transit

## Configuration Details

### RabbitMQ Configuration
The stack applies these RabbitMQ settings:
- Memory high watermark: 60%
- Disk free limit: 5GB
- Max message size: 128MB
- Heartbeat: 60 seconds
- Consumer timeout: 30 minutes (for ML tasks)

### Queue Configuration
Queues must be declared by clients with these settings:
```javascript
{
  'x-queue-type': 'quorum',
  'x-delivery-limit': 5,
  durable: true
}
```

## Connecting to RabbitMQ

### Management Console
1. Get the console URL from stack outputs
2. Login with:
   - Username: `ml`
   - Password: (from Secrets Manager)

### Application Connection
```javascript
// Node.js example
const amqp = require('amqplib');
const connection = await amqp.connect('amqps://ml:password@broker-endpoint:5671/', {
  // TLS is handled automatically by Amazon MQ
});
```

```python
# Python example
import pika
parameters = pika.URLParameters('amqps://ml:password@broker-endpoint:5671/')
connection = pika.BlockingConnection(parameters)
```

## Monitoring

### CloudWatch Metrics
Available metrics in the `AWS/AmazonMQ` namespace:
- BrokerCpuUtilization
- BrokerMemoryUtilization
- ConnectionCount
- QueueCount
- MessageCount
- PublishRate
- AckRate

### Logs
View logs in CloudWatch Logs:
`/aws/amazonmq/broker/bookmarkai-dev`

## Troubleshooting

### Cannot Connect
1. Check security group allows traffic from your subnet
2. Verify credentials are correct
3. Ensure using port 5671 (not 5672)
4. Check VPC routing and NAT gateway

### High CPU/Memory
1. Check message rates in CloudWatch
2. Review consumer performance
3. Consider scaling instance type
4. Check for poison messages

### Queue Issues
1. Verify queue durability settings
2. Check dead letter configuration
3. Review consumer acknowledgments
4. Monitor queue depth metrics

## Cost Optimization

### Development
- Use single instance deployment
- Consider smaller instance types
- Delete stack when not in use

### Production
- Right-size based on workload
- Use reserved instances for savings
- Monitor unused queues
- Set appropriate message TTLs

## Cleanup
To remove the stack and all resources:
```bash
cdk destroy BookmarkAI-RabbitMQ-Dev
```

Note: This will delete all queues and messages!