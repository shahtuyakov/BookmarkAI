# ast-grep (sg) Reference for BookmarkAI

## Priority Rule
**ALWAYS use ast-grep FIRST for syntax-aware searches before falling back to grep/rg**

## BookmarkAI-Specific Patterns

### TypeScript/NestJS Patterns
```bash
# Find all NestJS controllers
sg --lang typescript '@Controller($_) class $NAME { $$$ }'

# Find all service classes
sg --lang typescript '@Injectable() class $NAME { $$$ }'

# Find all DTOs with validation
sg --lang typescript 'class $NAME { @Is$VALIDATOR() $$$ }'

# Find all repository methods
sg --lang typescript 'class $NAME extends Repository<$ENTITY> { $$$ }'

# Find all event listeners
sg --lang typescript '@OnEvent("$EVENT") $METHOD($_) { $$$ }'

# Find all queue processors
sg --lang typescript '@Process("$QUEUE") $METHOD($_) { $$$ }'
```

### React Native/Mobile Patterns
```bash
# Find all React components
sg --lang tsx 'const $COMP = ($_) => { $$$ }'

# Find all hooks usage
sg --lang typescript 'use$HOOK($_)'

# Find all navigation calls
sg --lang typescript 'navigation.$METHOD($_)'

# Find all async storage calls
sg --lang typescript 'AsyncStorage.$METHOD($_)'

# Find all API calls
sg --lang typescript 'api.$METHOD($_)'
```

### Python ML Service Patterns
```bash
# Find all Celery tasks
sg --lang python '@app.task def $TASK($_): $$$'

# Find all FastAPI endpoints
sg --lang python '@router.$METHOD("$PATH") def $FUNC($_): $$$'

# Find all ML model loading
sg --lang python 'load_model($_)'

# Find all Redis cache operations
sg --lang python 'redis.$METHOD($_)'

# Find all database queries
sg --lang python 'session.$METHOD($_)'
```

### Configuration & Infrastructure
```bash
# Find all environment variables
sg --lang typescript 'process.env.$VAR'

# Find all Docker configurations
sg --lang yaml 'services: $$$'

# Find all database migrations
sg --lang typescript 'export class $NAME implements MigrationInterface { $$$ }'
```

## Complex Search Examples

### Find All Error Handling Patterns
```bash
# TypeScript try-catch blocks
sg --lang typescript 'try { $$$ } catch ($ERR) { $$$ }'

# Python exception handling
sg --lang python 'try: $$$ except $EXC: $$$'
```

### Find All Async Patterns
```bash
# All async functions
sg --lang typescript 'async function $NAME($_) { $$$ }'

# All Promise usage
sg --lang typescript 'new Promise(($_) => { $$$ })'

# All await calls
sg --lang typescript 'await $CALL'
```

### Architecture Analysis
```bash
# Find all dependency injections
sg --lang typescript 'constructor($DEPS) { $$$ }'

# Find all decorators
sg --lang typescript '@$DECORATOR($_) $TARGET'

# Find all interface implementations
sg --lang typescript 'class $NAME implements $INTERFACE { $$$ }'
```

## Refactoring Patterns

### Rename Functions Across Codebase
```bash
# Find all calls to specific function
sg --lang typescript '$OBJ.oldMethodName($_)'

# Find all function definitions
sg --lang typescript 'function oldMethodName($_) { $$$ }'
```

### Update Import Statements
```bash
# Find specific imports
sg --lang typescript 'import { $ITEMS } from "@bookmarkai/$PACKAGE"'

# Find default imports
sg --lang typescript 'import $NAME from "$MODULE"'
```

## Performance Tips
1. **Use specific language**: Always specify `--lang` for better performance
2. **Combine with file patterns**: `sg --lang typescript 'pattern' --glob '**/*.service.ts'`
3. **Use multiline for complex patterns**: Store complex patterns in files

## Integration with Other Tools
```bash
# Combine with grep for post-filtering
sg --lang typescript 'function $NAME($_)' | grep -v test

# Count matches
sg --lang typescript 'class $NAME' | wc -l

# Output to file for analysis
sg --lang typescript '@Controller($_)' > controllers.txt
```

Remember: ast-grep understands code structure, not just text patterns!