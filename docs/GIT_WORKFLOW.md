# BookmarkAI Git Workflow Guidelines

## Branch Naming Convention

Use the following format for branch names:
```
[type]/[task-id]-[short-description]
```

Where:
- `[type]` is one of:
  - `feature`: New functionality
  - `fix`: Bug fixes
  - `refactor`: Code restructuring without behavior change
  - `docs`: Documentation only changes
  - `test`: Adding or updating tests
  - `chore`: Maintenance tasks, dependencies, etc.
- `[task-id]` is the task ID from the task map (e.g., 2.11)
- `[short-description]` is a brief, hyphenated description

Examples:
- `feature/1.4-shares-endpoint`
- `fix/2.11-redis-connection-pool`
- `docs/0.8-eslint-config`

## Commit Messages

Structure commit messages as follows:
```
[type](task-id): concise description

Longer description with more context if needed.

Task: #[task-id]
```

Examples:
- `feat(2.11): implement rate limit backoff logic`
- `fix(1.4): resolve race condition in shares endpoint`
- `docs(0.9): add vault configuration guide`

## Pull Request Template

Every PR should include the following sections:

```markdown
## Task Reference
- Task: [Task ID] - [Task Name]
- Progress: [Status update - e.g., "Completes task" or "Partial implementation (70%)"]

## Changes
<!-- Brief description of the changes -->

## Testing
<!-- How these changes were tested -->

## Context
<!-- Any additional context or screenshots -->

## Checklist
- [ ] Code follows project style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Task context document updated
```

## Code Review Guidelines

1. Review the implementation against the task requirements
2. Verify that the code follows the project's architectural patterns
3. Check that appropriate tests have been added
4. Ensure documentation has been updated accordingly
5. Confirm task context document has been created or updated

## Working with Task Context

### When Starting a Task

1. Create a task context document in `docs/context/tasks/phase-X/task-X.X-name.md`
2. Update the PROJECT_CONTEXT.md to reflect the task is in progress
3. Create your branch following the naming convention

### During Implementation

1. Update your daily journal with progress
2. Make regular commits with appropriate messages
3. Update task context document with decisions and challenges

### When Completing a Task

1. Ensure tests and documentation are complete
2. Update the task context document with final implementation notes
3. Update PROJECT_CONTEXT.md to reflect completion
4. Create a PR with all relevant information

## Example Workflow

1. **Starting work on Task 2.11**:
   - Create `docs/context/tasks/phase-2/task-2.11-rate-limit-logic.md`
   - Update PROJECT_CONTEXT.md to show task 2.11 is in progress
   - Create branch `feature/2.11-rate-limit-logic`

2. **During implementation**:
   - Write daily journal entries tracking progress
   - Commit with messages like `feat(2.11): implement redis persistence`
   - Update task context with decisions like choice of backoff algorithm

3. **Completing the task**:
   - Run tests and update documentation
   - Finalize task context document with implementation details
   - Update PROJECT_CONTEXT.md to mark task as complete
   - Create PR with reference to Task 2.11