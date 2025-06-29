#!/bin/bash
# Ghost Debug Command Wrapper
# Usage: ./ghost-debug.sh <service-name> <symptom>

SERVICE_NAME=$1
SYMPTOM=$2

if [ -z "$SERVICE_NAME" ] || [ -z "$SYMPTOM" ]; then
    echo "Usage: ./ghost-debug.sh <service-name> <symptom>"
    echo "Example: ./ghost-debug.sh vector-service 'slow embeddings'"
    exit 1
fi

echo "🧠 Initiating Ghost Debug Session..."
echo "Service: $SERVICE_NAME"
echo "Symptom: $SYMPTOM"
echo ""

# Generate ghost debug prompt
cat << EOF > /tmp/ghost-debug-session.md
# Ghost Debug Session: $SERVICE_NAME

**Symptom**: $SYMPTOM
**Timestamp**: $(date)

Please perform a ghost debug of the $SERVICE_NAME with the following symptom: "$SYMPTOM"

Trace the execution flow mentally and identify:
1. All possible code paths that could cause this symptom
2. Variable state changes through the execution
3. Potential race conditions or timing issues
4. Error handling gaps
5. Resource management problems

Focus on the BookmarkAI architecture patterns and service interactions.
EOF

echo "📋 Ghost debug prompt generated: /tmp/ghost-debug-session.md"
echo "💡 Next: Copy this to Claude and ask for ghost debug analysis"
echo ""
cat /tmp/ghost-debug-session.md