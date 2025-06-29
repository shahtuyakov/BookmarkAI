# Ghost Debug Session Prompt

I need to perform a ghost debug session on {COMPONENT/SERVICE/FUNCTION}. The reported symptoms are:

**Symptoms:**
- {SYMPTOM_1}
- {SYMPTOM_2}
- {SYMPTOM_3}

**Ghost Debug Request:**
Please trace the execution flow mentally without running any code. I want you to:

1. **Map the execution paths** - trace all possible routes through the code
2. **Track variable states** - mentally simulate data transformations
3. **Identify race conditions** - consider async/concurrent scenarios
4. **Spot edge cases** - look for untested branches and error paths
5. **Find silent failures** - catch errors that fail gracefully but incorrectly

**Focus Areas:**
- [ ] Authentication/authorization flows
- [ ] Database transaction boundaries
- [ ] Message queue processing
- [ ] Async operation timing
- [ ] Error handling cascades
- [ ] Cache invalidation logic
- [ ] Memory leak patterns
- [ ] Resource cleanup

**Expected Output:**
- Step-by-step mental execution trace
- Identified potential failure points
- Root cause hypothesis with confidence level
- Minimal reproduction scenario
- Suggested fix with impact analysis

**Context:**
- Environment: {development/staging/production}
- Load conditions: {high/normal/low}
- Recent changes: {describe any recent modifications}
- Frequency: {always/intermittent/rare}

Please perform the ghost debug and provide your mental simulation results.