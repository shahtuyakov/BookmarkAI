# Leveraging LLMs with Your BookmarkAI Task Map

## 1. Task Breakdown & Refinement

**Recommended Workflow:**
1. Paste a task (e.g., "3.10: Create prompt-versioning registry") into your prompt
2. Ask the LLM to: "Break this into sub-tasks with implementation details"

**Example Prompt:**
```
I'm implementing Task 3.10: "Create prompt-versioning registry" for BookmarkAI.
The description states: "Implement YAML-based prompt registry with unit tests"
Please break this down into detailed sub-tasks with specific implementation guidance.
Tech context: TypeScript backend, Python ML services, OpenAI GPT-4o-mini for summarization.
```

**Benefits:** Get architectural patterns, common pitfalls, and detailed implementation steps without starting from scratch.

## 2. Code Generation & Technical Specifications

**Recommended Workflow:**
1. Provide the task ID and its surrounding context
2. Ask for specific code implementations or technical specs

**Example Prompts:**
```
Generate a TypeScript interface for our prompt registry based on task 3.10. 
We need to version LLM prompts for our summarization service.
Include fields for prompt templates, version tracking, and parameter injection.
```

```
Write unit tests for our YAML-based prompt registry (Task 3.10) that verify:
1. Loading prompts from YAML files
2. Version comparison logic
3. Template variable interpolation
4. Error handling for malformed templates
```

**Benefits:** Get starting code that follows best practices for your specific technical requirements.

## 3. Cross-Task Dependency Analysis

**Recommended Workflow:**
1. Paste relevant sections of the task map
2. Ask the LLM to identify hidden dependencies or optimization opportunities

**Example Prompt:**
```
Here are the tasks for Phases 2 and 3 of our BookmarkAI project:
[paste relevant task map sections]

Please identify:
1. Any hidden dependencies I might have missed
2. Tasks that could be parallelized to optimize our timeline
3. Critical path tasks that should receive priority attention
```

**Benefits:** Uncover non-obvious dependencies and optimize project scheduling.

## 4. Role-Specific Guidance

**For Product Managers:**
```
I'm managing the BookmarkAI project and need stakeholder updates.
Based on our task map [paste relevant sections], 
help me create talking points highlighting:
1. Current progress (Tasks 0.1-2.4 completed)
2. Risks in upcoming phases
3. Key milestones for the next two weeks
```

**For Engineers:**
```
I'm implementing Task 2.11 (rate-limit/back-off logic).
How should I structure this shared utility for optimal reuse across
TikTok, Reddit, and X APIs? What edge cases should I handle?
```

**For QA:**
```
I'm creating test plans for Phase 3. Based on the task map,
what are the highest-risk areas requiring thorough test coverage?
What specific test scenarios should I prioritize?
```

## 5. Documentation Generation

**Recommended Workflow:**
1. Identify completed tasks
2. Ask the LLM to generate appropriate documentation

**Example Prompt:**
```
I've completed Task 1.14 (Add idempotency keys to /shares API).
Generate technical documentation for this feature covering:
1. Implementation approach
2. How duplicate shares are detected
3. Configuration options
4. Troubleshooting guidelines
```

**Benefits:** Maintain up-to-date documentation throughout development.

## 6. Advanced: LLM as Development Partner

**Create a Context-Rich "Development Partner" Prompt:**
```
You are my development partner for the BookmarkAI project.
I'm currently working on Phase [X], focused on [specific area].
Our tech stack is [relevant details].
The current task map section is:
[paste relevant section]

As we discuss implementation details, refer back to this context
and alert me if my approach might conflict with dependencies or
future tasks.
```

**Benefits:** Establish ongoing context for iterative development discussions without repetitive explanation.

## 7. Best Practices for LLM Integration

- **Always ground LLM interactions in your task map** for consistency
- **Include relevant dependencies** in your prompts to avoid isolated solutions
- **Validate LLM suggestions** against your architectural decisions
- **Keep a record of valuable LLM-generated insights** for team knowledge sharing
- **Use LLM for divergent thinking** (exploring options) before convergent thinking (making decisions)