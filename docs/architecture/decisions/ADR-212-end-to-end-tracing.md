# ADR-212: End-to-End Distributed Tracing Architecture

## Status
Proposed

## Date
2025-01-08

## Context

BookmarkAI is a distributed system with multiple services communicating through REST APIs and message queues (RabbitMQ). The current system has partial tracing implementation:

- API Gateway (NestJS) has OpenTelemetry configured with auto-instrumentation
- Python ML services (LLM, Whisper, Vector) have basic OpenTelemetry setup
- Infrastructure includes both Jaeger and Tempo for trace collection
- Traces are collected but lack proper correlation across service boundaries

### Current Challenges

1. **Trace Continuity**: Traces break when crossing service boundaries, especially through RabbitMQ
2. **Context Propagation**: Trace context is not properly propagated through message queues
3. **Visibility**: No unified view of request flow from mobile app through all backend services
4. **Performance Monitoring**: Cannot identify bottlenecks in cross-service operations
5. **Error Attribution**: Difficult to trace errors back to their root cause across services

### Requirements

1. Complete request tracing from mobile app to final response
2. Trace continuity through both synchronous (HTTP) and asynchronous (RabbitMQ) communication
3. Minimal performance overhead (<1% latency increase)
4. Integration with existing monitoring stack (Grafana)
5. Support for sampling to control data volume
6. Backward compatibility with existing logging and metrics

## Decision

Implement comprehensive end-to-end distributed tracing using OpenTelemetry with the following architecture:

### 1. Trace Collection Architecture

```
Mobile App → API Gateway → RabbitMQ → Python Services
     ↓            ↓           ↓            ↓
     └──────── OpenTelemetry SDK ──────────┘
                      ↓
                Tempo (Storage)
                      ↓
            Grafana (Visualization)
```

### 2. Technology Stack

- **Instrumentation**: OpenTelemetry (already in use)
- **Trace Storage**: Tempo (already deployed, better for long-term storage)
- **Trace Analysis**: Jaeger UI (already deployed, better for debugging)
- **Visualization**: Grafana with Tempo data source
- **Propagation Format**: W3C Trace Context (industry standard)

### 3. Implementation Components

#### A. Mobile Application Tracing
```typescript
// React Native OpenTelemetry setup
import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const tracer = trace.getTracer('bookmarkai-mobile', '1.0.0');

// Instrument API calls
export const tracedFetch = (url: string, options: RequestInit) => {
  const span = tracer.startSpan('http.request', {
    attributes: {
      'http.method': options.method || 'GET',
      'http.url': url,
      'http.target': new URL(url).pathname,
    },
  });
  
  // Inject trace context into headers
  const headers = {
    ...options.headers,
    traceparent: span.spanContext().traceId,
  };
  
  return fetch(url, { ...options, headers })
    .finally(() => span.end());
};
```

#### B. API Gateway Enhanced Tracing
```typescript
// Enhanced NestJS tracing configuration
export async function initializeTracing() {
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'api-gateway',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
    }),
  });

  // Add RabbitMQ propagation
  provider.addSpanProcessor(new RabbitMQPropagator());
  
  // Configure sampling
  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(
      process.env.OTEL_SAMPLING_RATIO || 0.1
    ),
  });
}
```

#### C. Message Queue Context Propagation
```typescript
// RabbitMQ trace propagation
export class RabbitMQPropagator {
  inject(context: Context, carrier: amqp.Options.Publish) {
    const span = trace.getActiveSpan();
    if (span) {
      carrier.headers = {
        ...carrier.headers,
        traceparent: `00-${span.spanContext().traceId}-${span.spanContext().spanId}-01`,
        tracestate: span.spanContext().traceState?.serialize(),
      };
    }
  }

  extract(headers: any): Context {
    const traceparent = headers?.traceparent;
    if (traceparent) {
      return trace.setSpanContext(
        context.active(),
        this.parseTraceparent(traceparent)
      );
    }
    return context.active();
  }
}
```

#### D. Python Service Trace Continuation
```python
# Enhanced Python tracing with context extraction
from opentelemetry import trace, propagate
from opentelemetry.propagators.textmap import CarrierT
from typing import Dict, Any

class RabbitMQTraceContextExtractor:
    def extract_context(self, headers: Dict[str, Any]) -> None:
        """Extract trace context from RabbitMQ headers"""
        if headers and 'traceparent' in headers:
            carrier = {'traceparent': headers['traceparent']}
            ctx = propagate.extract(carrier=carrier)
            trace.set_current_span(ctx)
    
    def inject_context(self, headers: Dict[str, Any]) -> Dict[str, Any]:
        """Inject trace context into outgoing messages"""
        carrier = {}
        propagate.inject(carrier=carrier)
        return {**headers, **carrier}

# Celery task decorator with tracing
@app.task(bind=True)
@tracer.start_as_current_span("celery.task")
def process_content(self, content_id: str, headers: Dict = None):
    # Extract trace context from headers
    if headers:
        extractor = RabbitMQTraceContextExtractor()
        extractor.extract_context(headers)
    
    span = trace.get_current_span()
    span.set_attribute("content.id", content_id)
    span.set_attribute("task.name", self.name)
    
    # Process content...
```

### 4. Monitoring Integration

#### A. Grafana Dashboards
```json
{
  "dashboard": {
    "title": "BookmarkAI End-to-End Traces",
    "panels": [
      {
        "title": "Request Flow",
        "type": "tempo-trace-view",
        "targets": [{
          "query": "{ service.name=~\"bookmarkai-.*\" }"
        }]
      },
      {
        "title": "Service Latency Distribution",
        "type": "histogram",
        "targets": [{
          "query": "histogram_quantile(0.95, traces_spanmetrics_latency)"
        }]
      },
      {
        "title": "Error Rate by Service",
        "type": "graph",
        "targets": [{
          "query": "sum(rate(traces_spanmetrics_calls_total{status_code=\"ERROR\"}[5m])) by (service_name)"
        }]
      }
    ]
  }
}
```

#### B. Trace-based Alerts
```yaml
# Prometheus alerting rules
groups:
  - name: tracing_alerts
    rules:
      - alert: HighTraceErrorRate
        expr: |
          sum(rate(traces_spanmetrics_calls_total{status_code="ERROR"}[5m])) by (service_name)
          / sum(rate(traces_spanmetrics_calls_total[5m])) by (service_name) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate in {{ $labels.service_name }}"
          
      - alert: SlowTraceP95
        expr: |
          histogram_quantile(0.95, traces_spanmetrics_latency_bucket) > 5000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency exceeds 5s for {{ $labels.service_name }}"
```

### 5. Sampling Strategy

```yaml
# Dynamic sampling configuration
sampling:
  default_rate: 0.1  # 10% baseline
  rules:
    - service: "api-gateway"
      endpoint: "/api/v1/shares"
      rate: 1.0  # 100% for critical endpoints
    - service: "llm-service"
      operation: "generate_summary"
      rate: 0.5  # 50% for expensive operations
    - error: true
      rate: 1.0  # 100% for all errors
    - latency_ms: 5000
      rate: 1.0  # 100% for slow requests
```

## Consequences

### Positive

1. **Complete Visibility**: Full request flow visibility from mobile to ML services
2. **Root Cause Analysis**: Quickly identify performance bottlenecks and error sources
3. **Performance Optimization**: Data-driven optimization based on actual trace data
4. **Improved Debugging**: Developers can trace specific requests through all services
5. **SLA Monitoring**: Track end-to-end latency against SLAs
6. **Cost Attribution**: Understand resource usage per request type

### Negative

1. **Performance Overhead**: ~0.5-1% latency increase from instrumentation
2. **Storage Costs**: Tempo storage will grow with trace volume
3. **Complexity**: Developers need to understand distributed tracing concepts
4. **Network Overhead**: Additional trace data in message headers
5. **Sampling Trade-offs**: Not all requests traced (sampling required for scale)

### Implementation Plan

1. **Phase 1**: Mobile SDK Integration (1 day)
   - Add OpenTelemetry to React Native
   - Implement trace injection in API calls
   - Test trace propagation to API Gateway

2. **Phase 2**: Message Queue Propagation (1 day)
   - Implement RabbitMQ trace propagator
   - Update Python services to extract trace context
   - Test end-to-end trace continuity

3. **Phase 3**: Monitoring Setup (1 day)
   - Configure Tempo data source in Grafana
   - Create end-to-end trace dashboards
   - Set up trace-based alerts
   - Document troubleshooting procedures

### Testing Strategy

1. **Unit Tests**: Trace propagation logic
2. **Integration Tests**: Cross-service trace continuity
3. **Load Tests**: Performance impact measurement
4. **Chaos Testing**: Trace behavior during failures

## Alternatives Considered

1. **Jaeger Only**: Rejected due to limited long-term storage capabilities
2. **Custom Tracing**: Rejected due to maintenance overhead and lack of standards
3. **APM Solutions** (DataDog, New Relic): Rejected due to cost and vendor lock-in
4. **Logs Correlation**: Rejected as insufficient for complex distributed flows

## References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [Tempo Documentation](https://grafana.com/docs/tempo/latest/)
- [Distributed Tracing Best Practices](https://www.cncf.io/blog/2022/05/18/distributed-tracing-best-practices/)