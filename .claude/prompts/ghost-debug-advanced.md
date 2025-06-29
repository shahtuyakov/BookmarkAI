# Advanced Ghost Debug Session

For complex multi-service debugging scenarios in BookmarkAI microservices.

## Ghost Debug: Microservice Flow

**Target Flow:** {Content Ingestion / Search / Digest Generation / Other}

**Symptoms:**
- User reports: {user-facing symptom}
- Logs show: {log patterns}
- Metrics indicate: {performance/error metrics}

**Multi-Service Ghost Trace:**

1. **Entry Point Analysis**
   - Browser Extension → API Gateway
   - Mobile App → API Gateway  
   - Scheduled Job → Orchestrator

2. **Service Interaction Map**
   ```
   [Service A] → [Queue] → [Service B] → [Database]
                   ↓
              [Error Path] → [Retry Logic]
   ```

3. **State Transitions**
   - Track data through each service boundary
   - Monitor queue message transformations
   - Validate database transaction states

4. **Timing Dependencies**
   - RabbitMQ message delivery timing
   - Database connection pool exhaustion
   - Redis cache expiration windows
   - ML model inference delays

5. **Error Propagation Paths**
   - Silent failures in Python services
   - Unhandled promise rejections in NestJS
   - Queue message acknowledgment issues
   - Database constraint violations

**Ghost Debug Checklist:**

- [ ] **Queue Health**: Message routing, dead letter handling
- [ ] **Database Locks**: Transaction isolation, deadlock potential
- [ ] **Memory Patterns**: Leak detection across services
- [ ] **Network Timeouts**: Service-to-service communication
- [ ] **Authentication Flow**: Token refresh, session management
- [ ] **Cache Coherence**: Redis vs database state sync
- [ ] **Resource Limits**: CPU/memory constraints under load

**Output Format:**
1. **Execution Timeline**: Step-by-step flow with timestamps
2. **Failure Hypothesis**: Most likely root cause with confidence %
3. **Reproduction Steps**: Minimal steps to trigger the issue
4. **Impact Assessment**: Which users/features affected
5. **Fix Strategy**: Immediate mitigation + long-term solution

**BookmarkAI Specific Patterns to Check:**
- Vector embedding consistency across services
- Media file processing pipeline
- User session state across mobile/web
- Search index synchronization
- Digest generation timing