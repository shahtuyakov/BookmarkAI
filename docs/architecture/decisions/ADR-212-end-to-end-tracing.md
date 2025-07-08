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

## Detailed Implementation Plan

### Overview

This plan implements comprehensive distributed tracing across BookmarkAI's entire stack, from mobile app through API Gateway, message queues, to ML services, with full observability via Grafana/Tempo.

### Implementation Timeline

```
Phase 1: Foundation (Message Queue)     [Critical Path]
   |
   v
Phase 2: Python Services Integration    [Depends on Phase 1]
   |
   +-----> Phase 3: Mobile Integration  [Can start after Phase 1]
   |
   +-----> Phase 4: Monitoring Setup    [Can start in parallel]
   |
   v
Phase 5: Testing & Validation          [Requires all previous]
   |
   v
Phase 6: Rollout Strategy              [After validation]
   |
   v
Phase 7: Documentation                 [Throughout + Final]
```

---

### PHASE 1: Message Queue Propagation Foundation ✅

**Objective**: Implement trace context propagation through RabbitMQ to maintain trace continuity between services.

**Status**: COMPLETED (2025-01-08)

#### Tasks

- [x] **1.1 Create TypeScript Trace Propagator**
  ```typescript
  // packages/api-gateway/src/tracing/rabbitmq-propagator.ts
  - ✅ Implement W3C Trace Context injection into AMQP headers
  - ✅ Extract trace context from incoming messages  
  - ✅ Handle backward compatibility for existing messages
  - ✅ Add compression for large trace states
  ```

- [x] **1.2 Update Shared Python Library**
  ```python
  # python/shared/src/bookmarkai_shared/tracing/propagator.py
  # python/shared/src/bookmarkai_shared/tracing/__init__.py
  - ✅ Create RabbitMQTraceContextExtractor class
  - ✅ Implement extract_context() and inject_context() methods
  - ✅ Add decorator for automatic trace extraction in Celery tasks
  - ✅ Ensure compatibility with existing tracing setup
  ```

- [x] **1.3 Feature Flag Implementation**
  ```yaml
  # All services configuration
  ENABLE_TRACE_PROPAGATION: false  # Start disabled
  TRACE_SAMPLING_RATE: 0.1        # 10% default
  
  # Files updated:
  - env/base.env
  - env/base.env.example
  - env/development/shared.env (enabled for dev testing)
  ```

- [ ] **1.4 Unit Tests** (Deferred)
  - Test trace header parsing/formatting
  - Verify backward compatibility
  - Test compression/decompression
  - Validate W3C compliance

---

### PHASE 2: Python Service Integration ✅

**Objective**: Update all Python ML services to extract and continue traces from RabbitMQ messages.

**Status**: COMPLETED (2025-01-08)

#### Tasks

- [x] **2.1 Update Celery Task Decorators**
  ```python
  # Each Python service: llm-service, whisper-service, vector-service
  - ✅ Modify @app.task decorators to extract trace context
  - ✅ Add service-specific attributes (model version, token count)
  - ✅ Implement span creation for each processing step
  - ✅ Add error handling with trace context
  ```

- [x] **2.2 Service-Specific Instrumentation**

  - [x] **LLM Service**:
    - ✅ Trace each LLM API call
    - ✅ Add attributes: model, prompt_tokens, completion_tokens, cost
    - ✅ Track retry attempts and backoff

  - [x] **Whisper Service**:
    - ✅ Trace audio processing stages
    - ✅ Add attributes: audio_duration, model_size, language
    - ✅ Track chunking operations

  - [x] **Vector Service**:
    - ✅ Trace embedding generation
    - ✅ Add attributes: text_length, embedding_dimensions
    - ✅ Track batch processing

- [ ] **2.3 Integration Tests** (Deferred)
  - Verify trace continuity API Gateway -> Python service
  - Test error propagation with trace context
  - Validate attribute collection

---

### PHASE 3: Mobile Application Integration

**Objective**: Add OpenTelemetry to React Native app for end-to-end visibility from user interaction.

#### Tasks

- [ ] **3.1 SDK Setup**
  ```javascript
  // packages/mobile/bookmarkaimobile/src/tracing/setup.ts
  - Install @opentelemetry/react-native
  - Configure OTLP HTTP exporter
  - Set up resource attributes (app version, platform)
  - Implement batching for background export
  ```

- [ ] **3.2 API Client Instrumentation**
  ```typescript
  // packages/mobile/bookmarkaimobile/src/api/client.ts
  - Create tracedFetch wrapper
  - Inject trace headers into all API calls
  - Add request/response attributes
  - Handle network errors with trace context
  ```

- [ ] **3.3 User Session Correlation**
  - Link traces to user sessions
  - Add device attributes (model, OS version)
  - Track app lifecycle events
  - Monitor performance metrics

- [ ] **3.4 Platform-Specific Configuration**
  - iOS: Handle background trace export
  - Android: Configure ProGuard rules
  - Both: Manage battery optimization

---

### PHASE 4: Monitoring Infrastructure

**Objective**: Create comprehensive observability dashboards and alerts using Tempo/Grafana.

#### Tasks

- [ ] **4.1 Tempo Configuration**
  ```yaml
  # docker/monitoring/tempo.yml
  - Configure ingestion rate limits
  - Set retention policies (7 days for MVP)
  - Enable trace metrics generation
  - Configure S3 backend for production
  ```

- [ ] **4.2 Grafana Dashboards**

  - [ ] **Service Overview Dashboard**:
    ```
    +------------------+------------------+------------------+
    | Request Rate     | Error Rate       | P95 Latency      |
    | by Service       | by Service       | by Service       |
    +------------------+------------------+------------------+
    | Service Map      | Trace Timeline   | Top Errors       |
    | (Interactive)    | (Gantt Chart)    | (Table)          |
    +------------------+------------------+------------------+
    ```

  - [ ] **User Journey Dashboard**:
    - Trace search by user ID
    - Operation breakdown
    - Platform comparison
    - Error analysis

- [ ] **4.3 Alerting Rules**
  ```yaml
  # Prometheus alerts
  - P95 latency > 5s for any service
  - Error rate > 5% for 5 minutes
  - Trace breaks detected
  - Sampling rate auto-adjustment
  ```

---

### PHASE 5: Testing & Validation

**Objective**: Ensure tracing works correctly with minimal performance impact.

#### Tasks

- [ ] **5.1 Unit Test Suite**
  - Propagator logic tests
  - Trace context validation
  - Attribute verification
  - Error scenarios

- [ ] **5.2 Integration Tests**
  ```bash
  # End-to-end trace validation
  - Mobile -> API Gateway -> RabbitMQ -> Python -> Response
  - Verify trace ID consistency
  - Check span relationships
  - Validate timing accuracy
  ```

- [ ] **5.3 Load Testing**
  ```yaml
  # Performance validation
  - Baseline: Latency without tracing
  - With tracing: Must be < 1% overhead
  - Memory usage comparison
  - Network bandwidth impact
  ```

- [ ] **5.4 Chaos Testing**
  - Service failures with trace continuity
  - Network partitions
  - Queue overload scenarios
  - Collector unavailability

---

### PHASE 6: Rollout Strategy

**Objective**: Safely deploy tracing to production with gradual rollout.

#### Tasks

- [ ] **6.1 Feature Flag Configuration**
  ```javascript
  // Progressive rollout
  Week 1: 1% of requests (validation)
  Week 1: 10% of requests (if stable)
  Week 2: 50% of requests
  Week 2: 100% of requests
  ```

- [ ] **6.2 Monitoring During Rollout**
  - Real-time latency monitoring
  - Error rate tracking
  - Trace continuity validation
  - Resource usage alerts

- [ ] **6.3 Rollback Plan**
  - Kill switch in each service
  - Automatic rollback on regression
  - Incident response runbook
  - Communication plan

---

### PHASE 7: Documentation & Training

**Objective**: Enable team to use and maintain the tracing system effectively.

#### Deliverables

- [ ] **7.1 Developer Guide**
  - How to add tracing to new services
  - Best practices for attributes
  - Performance considerations
  - Troubleshooting guide

- [ ] **7.2 Operations Runbook**
  - Common issues and solutions
  - Dashboard navigation
  - Alert response procedures
  - Capacity planning

- [ ] **7.3 Architecture Documentation**
  - Trace flow diagrams
  - Configuration reference
  - Integration patterns
  - Security considerations

---

### Success Criteria

1. **Trace Continuity**: 100% of sampled requests have complete traces
2. **Performance**: < 1% latency increase across all services
3. **Visibility**: Full request flow visible in Grafana
4. **Reliability**: No service disruptions during rollout
5. **Adoption**: All developers can debug using traces

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Performance degradation | Feature flags, gradual rollout, kill switch |
| Storage explosion | Sampling rules, retention policies |
| Integration complexity | Phased approach, extensive testing |
| Team adoption | Training, documentation, support |

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

## Implementation Notes

### Phase 1 Implementation (2025-01-08)

#### Key Design Decisions

1. **Backward Compatibility**: The implementation maintains full backward compatibility by:
   - Feature flag control (`ENABLE_TRACE_PROPAGATION`)
   - Fallback to existing trace injection in message metadata
   - Graceful handling of missing headers

2. **Architecture Choices**:
   - **TypeScript**: Created a reusable `RabbitMQPropagator` class following OpenTelemetry patterns
   - **Python**: Extended existing tracing module with new `RabbitMQTraceContextExtractor`
   - Both implementations follow W3C Trace Context specification

3. **Integration Points**:
   - **API Gateway**: Modified `ml-producer-enhanced.service.ts` to use propagator
   - **Python Services**: Enhanced `trace_celery_task` decorator with feature flag support
   - No changes required to individual service implementations

4. **Configuration Strategy**:
   - Environment variables in base configuration files
   - Development environment enabled by default for testing
   - Production starts disabled until validation complete

#### Implementation Details

1. **TypeScript Propagator** (`packages/api-gateway/src/tracing/rabbitmq-propagator.ts`):
   - Implements W3C traceparent format validation
   - Provides inject/extract methods for AMQP headers
   - Includes helper methods for common use cases

2. **Python Propagator** (`python/shared/src/bookmarkai_shared/tracing/propagator.py`):
   - Handles both string and bytes header formats
   - Integrates with existing Celery instrumentation
   - Provides enhanced decorator for automatic propagation

3. **Feature Flag Integration**:
   - Both TypeScript and Python check `ENABLE_TRACE_PROPAGATION`
   - Seamless fallback to existing behavior when disabled
   - No code changes needed in individual services

#### Testing Recommendations

1. **Local Testing**:
   ```bash
   # Enable tracing in development
   export ENABLE_TRACE_PROPAGATION=true
   export TRACE_SAMPLING_RATE=1.0
   
   # Monitor traces in Jaeger UI
   open http://localhost:16686
   ```

2. **Validation Steps**:
   - Publish a message from API Gateway
   - Verify trace appears in Python service spans
   - Check parent-child relationships are preserved
   - Confirm no performance degradation

3. **Rollback Plan**:
   - Set `ENABLE_TRACE_PROPAGATION=false` to disable
   - No code changes or deployments required

#### Next Steps

1. ~~Complete Phase 2: Python Service Integration~~ ✅
2. Add comprehensive unit tests
3. Perform load testing with tracing enabled
4. Create Grafana dashboards for trace visualization
5. Document troubleshooting procedures

### Phase 2 Implementation (2025-01-08)

#### Implementation Summary

Phase 2 successfully added comprehensive instrumentation to all Python ML services:

1. **Trace Context Propagation**:
   - All services now use the enhanced `trace_celery_task` decorator
   - Automatic trace context extraction from RabbitMQ message headers
   - Maintains trace continuity across service boundaries

2. **Service-Specific Instrumentation Added**:

   **LLM Service** (`llm_client.py`):
   - OpenAI API calls traced with `llm.openai.generate_summary` span
   - Anthropic API calls traced with `llm.anthropic.generate_summary` span
   - Attributes: model, tokens (prompt/completion/total), cost, temperature
   - Exception handling with trace context preservation

   **Whisper Service** (`transcription.py`, `tasks.py`):
   - API calls traced with `whisper.transcribe_api` span
   - Processing phases traced: download, extract_audio, validate, chunking
   - Attributes: audio_duration, format, language, cost, transcript_length
   - Chunking operations tracked with chunk count

   **Vector Service** (`embedding_service.py`, `tasks.py`):
   - Single embeddings traced with `embeddings.generate_single` span
   - Batch embeddings traced with `embeddings.generate_batch` span
   - Attributes: model, token_count, dimensions, cost, batch_size
   - Model selection logic preserved

3. **Cost Tracking Integration**:
   - All services add cost attributes to spans
   - Cost calculation remains unchanged
   - Budget tracking integrated with tracing

4. **Error Handling**:
   - Exceptions recorded in spans with full context
   - Error status propagated through trace
   - Retry logic preserved with trace continuity

#### Testing Approach

To validate the implementation:

```bash
# Enable tracing in development
export ENABLE_TRACE_PROPAGATION=true

# Trigger a content processing flow
# Monitor in Jaeger UI at http://localhost:16686

# Expected trace structure:
API Gateway (share creation)
  └─> RabbitMQ publish
      └─> LLM Service (summarization)
          └─> OpenAI API call
      └─> Whisper Service (transcription)
          └─> Phase 1: Download
          └─> Phase 2: Extract Audio
          └─> Phase 3: Validate
          └─> Phase 4: Process (chunk if needed)
          └─> Whisper API call(s)
      └─> Vector Service (embeddings)
          └─> Embedding generation
          └─> OpenAI embeddings API
```

#### Next Phase

Phase 3 (Mobile Application Integration) will add tracing from the React Native app to complete the end-to-end visibility from user interaction through all backend services.