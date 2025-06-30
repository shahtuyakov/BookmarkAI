# .claude Directory

This directory contains Claude Code configuration and helper files for the BookmarkAI project.

## Structure

```
.claude/
├── config.json         # Project configuration and preferences
├── settings.local.json # Local Claude settings (permissions, MCP)
├── memory/            # Session memory (auto-managed by Claude)
├── cache/             # Analysis cache (auto-managed)
├── prompts/           # Reusable prompt templates
├── patterns/          # Code patterns and examples
└── templates/         # Code generation templates
```

## Usage Tips

### Config.json
- Defines project structure, preferences, and workflows
- Used by Claude to understand project conventions
- Update when adding new services or changing patterns

### Prompts Directory
- Contains reusable prompts for common tasks
- Reference with: "Use the debug-microservice prompt"
- Add new prompts for repetitive workflows

### Patterns Directory
- Shows Claude preferred code patterns
- Helps maintain consistency across codebase
- Update when establishing new patterns

### Cache & Memory
- Automatically managed by Claude
- Clear periodically if context gets stale
- Memory persists between sessions with --resume

## Best Practices

1. **Keep configs updated**: When project structure changes
2. **Use prompts**: For complex, repetitive tasks
3. **Document patterns**: When establishing new conventions
4. **Clear cache**: If Claude seems confused about recent changes
5. **Review memory**: Occasionally check what Claude remembers

## Advanced Features

- **MCP Tools**: Enabled via settings.local.json
- **Custom templates**: Add to templates/ for code generation
- **Workflow automation**: Define in config.json workflows
- **Search optimization**: Priority paths in config.json

Remember: This directory enhances Claude's understanding of your project and improves collaboration efficiency.