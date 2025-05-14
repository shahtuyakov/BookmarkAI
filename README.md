## Developer Context System

This project uses a structured context tracking system:

- `PROJECT_CONTEXT.md` - Current project status
- `docs/context/daily/` - Daily developer journals
- `docs/context/tasks/` - Task-specific documentation

New developers should review these documents to understand the project status.

Daily workflow:
1. Run `./scripts/gen-daily-journal.sh` to create today's journal
2. Update your journal throughout the day
3. Reference task IDs in commits with `[type](task-id): message`