# Code Quality Tools

This project uses several tools to ensure code quality and consistency:

## ESLint

ESLint is used for linting JavaScript and TypeScript code:

```bash
# Run ESLint
pnpm lint

# Fix automatically fixable issues
pnpm lint:fix
```

## Prettier

Prettier is used for code formatting:

```bash
# Format all files
pnpm format

# Check if files are properly formatted
pnpm format:check
```

## Dead Code Detection

### TypeScript

We use ts-prune to detect unused exports in TypeScript files:

```bash
# Check for unused exports
pnpm ts-prune
```

### Python

We use Pyright for type checking and detecting unused code in Python files:

```bash
# Install pyright globally
pip install pyright

# Run pyright manually
pyright
```

## Git Hooks

We use Husky and lint-staged to run checks before commits:

- Pre-commit: Runs ESLint, Prettier, ts-prune, and pyright on staged files

This helps prevent style churn and ensures consistent code quality across the project.

## Setting Up

The tools are automatically installed when you run `pnpm install` due to the husky prepare script.

If you need to set up the git hooks manually:

```bash
pnpm prepare
```
