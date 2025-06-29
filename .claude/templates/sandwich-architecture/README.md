# 🥪 Sandwich Architecture Pattern

## Layers (Top to Bottom):

### 🍞 Presentation Layer (Top Bun)
- Controllers
- Views
- API Endpoints

### 🥬 Application Layer (Lettuce)
- Use Cases
- Application Services
- DTOs

### 🧀 Domain Layer (Cheese - The Good Stuff)
- Entities
- Value Objects
- Domain Services
- Repository Interfaces

### 🥩 Infrastructure Layer (Meat)
- Repository Implementations
- External Service Adapters
- Database Configurations

### 🍞 Database Layer (Bottom Bun)
- Migrations
- Seeds
- Raw SQL

## The Secret Sauce 🥫
Dependencies flow downward only! Upper layers can depend on lower layers, but never the reverse.

## Usage:
```bash
cp -r .claude/templates/sandwich-architecture/* ./src/
```

Enjoy your perfectly layered code sandwich! 🥪
