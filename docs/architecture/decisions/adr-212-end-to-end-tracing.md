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

### MVP Scope

For the MVP, we will focus on establishing trace continuity for the most critical user journey:
**Share Content → API Gateway → RabbitMQ → LLM Service → Response**

This represents ~60% of our traffic and will prove the tracing architecture works before expanding.

### Requirements

**MVP Requirements (Week 1-3)**:

1. Trace continuity for one critical path (Share → LLM)
2. Basic context propagation through RabbitMQ
3. Visibility in existing Jaeger UI
4. Simple 10% sampling rate
5. < 5 minute rollback capability

**Future Requirements (Post-MVP)**:

1. Complete request tracing from mobile app to final response
2. Full trace continuity through all services
3. Advanced sampling strategies
4. Custom Grafana dashboards
5. Comprehensive alerting

## Decision

Implement distributed tracing in phases, starting with MVP critical path and expanding post-launch.

### MVP Implementation (Weeks 1-3)

Focus on one critical path with minimal changes:

```
API Gateway → RabbitMQ → LLM Service
     ↓           ↓           ↓
     └─── OpenTelemetry SDK ─┘
                 ↓
            Jaeger UI
```

### 2. Technology Stack

- **Instrumentation**: OpenTelemetry (already in use)
- **Trace Storage**: Tempo (already deployed, better for long-term storage)
- **Trace Analysis**: Jaeger UI (already deployed, better for debugging)
- **Visualization**: Grafana with Tempo data source
- **Propagation Format**: W3C Trace Context (industry standard)

### MVP Components

#### A. RabbitMQ Context Propagation (Week 1 Focus)

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
      return trace.setSpanContext(context.active(), this.parseTraceparent(traceparent));
    }
    return context.active();
  }
}
```

#### B. Python Service Trace Continuation (Week 1-2)

```python
# Minimal Python tracing - start with LLM service only
from opentelemetry import trace, propagate

# In celery task
@app.task(bind=True)
def process_content(self, content_id: str, headers: Dict = None):
    # Extract trace context from RabbitMQ headers
    if headers and 'traceparent' in headers:
        ctx = propagate.extract(carrier={'traceparent': headers['traceparent']})
        token = trace.use_context(ctx)

    with tracer.start_as_current_span("llm.process") as span:
        span.set_attribute("content.id", content_id)
        # Existing processing logic...
```

#### C. MVP Monitoring (Week 3)

```yaml
# Single Grafana dashboard configuration
panels:
  - title: 'Service Latency (P50/P95)'
    query: 'histogram_quantile(0.95, traces_spanmetrics_latency)'
  - title: 'Error Rate'
    query: 'sum(rate(traces_spanmetrics_calls_total{status_code="ERROR"}[5m]))'
  - title: 'Service Map'
    type: 'service-graph'

# One critical alert
alert: SlowTraceP95
expr: histogram_quantile(0.95, traces_spanmetrics_latency_bucket) > 5000
for: 5m
annotations:
  summary: 'P95 latency exceeds 5s'
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

## MVP Implementation Plan (3 Weeks)

### Week 1: RabbitMQ Propagation

**Goal**: Establish trace continuity through message queue for critical path

#### Day 1-2: Quick Proof of Concept

- [ ] Manually test trace propagation with hardcoded trace IDs
- [ ] Verify Jaeger UI shows connected spans
- [ ] Document any blocking issues

#### Day 3-4: Implementation

- [ ] **API Gateway Changes**

  ```typescript
  // packages/api-gateway/src/tracing/rabbitmq-propagator.ts
  - Simple W3C Trace Context injection into AMQP headers
  - Use existing OpenTelemetry context
  ```

- [ ] **LLM Service Changes Only**
  ```python
  # python/llm-service/src/tasks.py
  - Extract trace context from message headers
  - Create child span for LLM processing
  - Test with one Celery task first
  ```

#### Day 5: Testing & Rollback Plan

- [ ] Feature flag: `ENABLE_TRACE_PROPAGATION=false`
- [ ] Test trace continuity with flag on/off
- [ ] Document 5-minute rollback procedure

### Week 2: Expand to Remaining Services

**Goal**: Add Whisper and Vector services to traced path

#### Day 1-2: Copy Pattern

- [ ] Apply same propagation pattern to Whisper service
- [ ] Apply same propagation pattern to Vector service
- [ ] Use shared Python code if pattern proves stable

#### Day 3-4: Basic Attributes

- [ ] Add minimal span attributes:
  - Service name and version
  - Operation type
  - Success/failure status
  - Basic timing

#### Day 5: Integration Testing

- [ ] Test full content processing flow
- [ ] Verify all services appear in Jaeger
- [ ] Check for any performance regression

### Week 3: Basic Monitoring & Documentation

**Goal**: Make traces useful for debugging

#### Day 1-2: Single Dashboard

- [ ] Create one Grafana dashboard:
  - Service latency (P50, P95)
  - Error rate by service
  - Simple service dependency graph

#### Day 3: One Alert

- [ ] Set up single critical alert:
  - P95 latency > 5 seconds
  - Send to Slack/PagerDuty

#### Day 4-5: Documentation & Handoff

- [ ] Write 1-page "How to Debug with Traces"
- [ ] Record 5-minute demo video
- [ ] Train team on Jaeger UI basics
- [ ] Document rollback procedure

## MVP Success Criteria

1. **Trace Continuity**: Can trace one complete request through Share → API Gateway → LLM Service
2. **Performance**: < 1% latency increase on traced requests
3. **Visibility**: Team can find and analyze traces in Jaeger UI
4. **Reliability**: Tracing can be disabled in < 5 minutes if issues arise
5. **Adoption**: 3+ developers successfully debug an issue using traces

## MVP Deliverables

1. Working trace propagation through RabbitMQ
2. Three Python services with basic tracing
3. One Grafana dashboard with key metrics
4. One critical alert configured
5. Basic documentation and team training

## Future Enhancements (Post-MVP)

After proving value with the MVP, we can expand to:

1. **Mobile Integration**: Add OpenTelemetry to React Native app
2. **Advanced Dashboards**: Custom Grafana dashboards with service maps
3. **Smart Sampling**: Dynamic sampling based on error rates and latency
4. **Full Coverage**: Remaining services (Caption, Orchestrator)
5. **Tempo Migration**: Move from Jaeger UI to Tempo for long-term storage
6. **Performance Profiling**: Add CPU/memory profiling to traces
7. **Business Metrics**: Correlate traces with business KPIs

## Risks and Mitigations

| Risk                              | Impact | Mitigation                                      |
| --------------------------------- | ------ | ----------------------------------------------- |
| RabbitMQ header propagation fails | High   | Test with hardcoded traces first, have fallback |
| Performance regression            | Medium | Feature flag, monitor closely, 5-min rollback   |
| Team doesn't adopt                | Medium | Start with power users, show immediate value    |
| Jaeger storage fills up           | Low    | Set retention to 7 days, monitor disk usage     |

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

## Implementation Status (Updated: 2025-01-13)

### What Was Implemented

1. **OpenTelemetry Setup**: ✅ All services (API Gateway, LLM, Whisper, Vector) have OpenTelemetry configured and report traces to Jaeger

2. **Trace Context Propagation**: ⚠️ Partially implemented

   - API Gateway correctly injects W3C Trace Context headers into Celery messages
   - Python services have trace extraction logic using `current_task`
   - All Celery tasks decorated with `@trace_celery_task`

3. **Individual Service Tracing**: ✅ Each service creates its own traces successfully

### Known Issues

1. **Trace Context Not Propagating Through RabbitMQ/Celery**

   - Despite correct implementation, traces remain isolated per service
   - Root cause appears to be in Celery's message header handling
   - Each service creates new trace IDs instead of continuing parent traces

2. **Technical Findings**
   - Celery's `current_task.request.headers` returns minimal headers (`{'meth': None}`)
   - Trace context headers added to Celery message body are not accessible via standard Celery APIs
   - Potential conflict between OpenTelemetry's automatic Celery instrumentation and custom decorators

### Current State

- **Functional Impact**: None - system works perfectly
- **Observability**: Each service has independent traces visible in Jaeger
- **Correlation**: Can use timestamps and correlation IDs to manually link requests

### Recommended Next Steps

1. **Option A: Accept Current State**

   - Document that traces are per-service
   - Use correlation IDs for request tracking
   - Revisit when Celery/OpenTelemetry integration improves

2. **Option B: Alternative Implementation**

   - Store trace context in Redis with correlation ID as key
   - Retrieve trace context at task start using correlation ID
   - More complex but guaranteed to work

3. **Option C: Deep Investigation**
   - Debug Celery's internal message handling
   - Consider custom Celery task base class
   - Potentially contribute fix upstream

### Decision

Proceeding with **Option A** for now. The current implementation provides:

- Full tracing within each service boundary
- Correlation IDs for manual request tracking
- No functional impact on the system

The effort to achieve full trace propagation through Celery is disproportionate to the benefit at this stage.
