# ML Producer Connection Reliability Documentation

## Overview

The ML Producer service has been enhanced with robust connection reliability features to ensure stable communication with RabbitMQ in production environments. This document describes the improvements and how to monitor them.

## Key Features

### 1. Connection State Management

The service now tracks connection state through a finite state machine:
- `DISCONNECTED`: No active connection
- `CONNECTING`: Attempting to establish connection
- `CONNECTED`: Active and healthy connection
- `CLOSING`: Gracefully shutting down
- `CLOSED`: Connection terminated

### 2. Automatic Reconnection with Exponential Backoff

- **Initial delay**: 1 second
- **Maximum delay**: 60 seconds
- **Maximum attempts**: 10
- **Backoff formula**: `min(initialDelay * 2^attemptNumber, maxDelay)`

Example reconnection sequence:
- Attempt 1: 1s delay
- Attempt 2: 2s delay
- Attempt 3: 4s delay
- Attempt 4: 8s delay
- Attempt 5: 16s delay
- Attempt 6: 32s delay
- Attempt 7-10: 60s delay

### 3. Circuit Breaker Pattern

Protects against cascading failures:
- **Threshold**: 5 consecutive failures
- **Cooldown**: 30 seconds
- **Behavior**: Fails fast when open, preventing system overload

### 4. Publisher Confirms

All messages are published with publisher confirms enabled:
- Ensures message delivery to RabbitMQ
- Throws error if confirmation fails
- Integrates with circuit breaker for failure tracking

### 5. Enhanced Error Handling

- Connection errors trigger automatic reconnection
- Channel errors are properly handled
- Message returns are logged for debugging
- Graceful shutdown prevents message loss

## Configuration

### Environment Variables

```bash
# RabbitMQ connection URL
RABBITMQ_URL=amqp://ml:ml_password@localhost:5672/

# Backend preferences (optional)
PREFERRED_LLM_BACKEND=api      # or 'local'
PREFERRED_STT=api              # or 'local'
PREFERRED_EMBEDDING_BACKEND=api # or 'local'
```

### Connection Options

The service uses these connection parameters:
- **Heartbeat**: 60 seconds
- **Connection timeout**: 10 seconds
- **Channel prefetch**: 100 messages

## Monitoring

### Health Check Endpoint

```bash
GET /v1/ml/analytics/health
```

Response:
```json
{
  "healthy": true,
  "rabbitmq": {
    "connectionState": "CONNECTED",
    "reconnectAttempts": 0,
    "consecutiveFailures": 0,
    "circuitBreakerOpen": false
  }
}
```

### Testing Connection Reliability

1. **Test script**: Use `test-ml-connection.js` to verify functionality
2. **Manual testing**:
   ```bash
   # Stop RabbitMQ
   docker-compose stop rabbitmq
   
   # Watch API Gateway logs
   docker logs -f bookmarkai-api-gateway
   
   # Monitor health endpoint
   curl http://localhost:3001/v1/ml/analytics/health
   
   # Start RabbitMQ
   docker-compose start rabbitmq
   
   # Verify automatic reconnection
   curl http://localhost:3001/v1/ml/analytics/health
   ```

## Error Scenarios

### 1. RabbitMQ Unavailable at Startup
- Service attempts connection with exponential backoff
- Health check returns `healthy: false`
- Service continues attempting reconnection

### 2. RabbitMQ Connection Lost
- Automatic reconnection initiated
- In-flight messages may fail (handled by caller)
- Circuit breaker prevents overload

### 3. Circuit Breaker Open
- Fast failure for 30 seconds
- Clear error message returned
- Automatic recovery after cooldown

### 4. Maximum Reconnection Attempts Reached
- Manual intervention required
- Service restart recommended
- Check RabbitMQ availability

## Best Practices

1. **Monitor health endpoint** regularly in production
2. **Set up alerts** for unhealthy states
3. **Log aggregation** to track reconnection patterns
4. **Graceful deployments** to prevent connection storms
5. **Test failover scenarios** in staging environment

## Metrics to Track

1. **Connection state changes**
2. **Reconnection attempt frequency**
3. **Circuit breaker activations**
4. **Message publish failures**
5. **Average reconnection time**

## Future Improvements

1. **Prometheus metrics** for connection state
2. **Connection pooling** for high throughput
3. **Alternative broker failover**
4. **Message persistence** during outages
5. **Configurable retry policies**