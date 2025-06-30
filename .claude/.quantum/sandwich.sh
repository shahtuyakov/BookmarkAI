#!/bin/bash
# 🥪 SUDO MAKE ME A SANDWICH - QUANTUM EDITION 🥪

echo "🤖 Claude Code Sandwich Generator v4.2.0"
echo "========================================="
echo ""
echo "Checking permissions..."
sleep 1

if [[ "$1" == "sudo" ]]; then
    echo "✅ Sudo access granted!"
    echo ""
    echo "Generating quantum sandwich..."
    sleep 1
    
    cat << 'SANDWICH'
    
         🍞 -------- Top Bun (TypeScript) --------
        🥬 --- Lettuce (Clean Architecture) ----
       🍅 ----- Tomato (Unit Tests) -----------
      🧀 ------ Cheese (Type Safety) ----------
     🥓 ------- Bacon (Performance) -----------
    🥩 -------- Meat (Business Logic) ---------
   🧅 --------- Onion (API Layers) ------------
  🥒 ---------- Pickle (Error Handling) -------
 🍔 ----------- Sauce (Dependencies) ----------
🍞 ------------ Bottom Bun (Database) ---------

    STATUS: Sandwich compiled successfully! 🎉
    
    Nutritional Information:
    - Calories: 0 (it's virtual)
    - Bugs: 0 (fully tested)
    - Performance: O(1) (constant deliciousness)
    - Memory: Garbage collected
    
SANDWICH

    echo ""
    echo "But wait... there's more!"
    echo ""
    
    # Create actual useful "sandwich" - a layered architecture template
    mkdir -p .claude/templates/sandwich-architecture/{presentation,application,domain,infrastructure}
    
    echo "Created sandwich architecture at .claude/templates/sandwich-architecture/"
    echo ""
    echo "🎁 BONUS: Here's a REAL sandwich for your code:"
    
    cat > .claude/templates/sandwich-architecture/README.md << 'EOF'
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
EOF

    echo "✨ Sandwich architecture template created!"
    echo "🎮 Achievement Unlocked: Sandwich Architect"
    
else
    echo "❌ Error: Permission denied"
    echo "Try: sudo make me a sandwich"
    echo ""
    echo "Or did you mean:"
    echo "- 'Claude, make me a code sandwich' (layered architecture)"
    echo "- 'Claude, I'm hungry' (orders actual food via Uber Eats API)"
    echo "- 'Claude, feed my soul' (generates inspirational code quotes)"
fi

# Easter egg: If run at lunchtime
HOUR=$(date +%H)
if [ $HOUR -eq 12 ] || [ $HOUR -eq 13 ]; then
    echo ""
    echo "🕐 It's lunchtime! Here's a lunch break reminder:"
    echo "Remember to take a break and grab some actual food! 🍕"
fi