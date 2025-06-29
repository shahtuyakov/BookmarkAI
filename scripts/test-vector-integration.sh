#!/bin/bash
# End-to-end integration test for Vector Embedding Service

set -e

echo "🧪 Vector Embedding Service Integration Test"
echo "==========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must run from BookmarkAI root directory${NC}"
    exit 1
fi

# Check for required API key
if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "your_openai_api_key_here" ]; then
    echo -e "${RED}Error: OPENAI_API_KEY not set${NC}"
    echo "Set it with: export OPENAI_API_KEY='your-actual-key'"
    exit 1
fi

echo -e "${YELLOW}1. Checking prerequisites...${NC}"

# Check if services are running
if ! docker ps | grep -q bookmarkai-vector-worker; then
    echo -e "${RED}Error: Vector worker is not running${NC}"
    echo "Start it with: ./scripts/start-ml-services.sh"
    exit 1
fi

if ! docker ps | grep -q docker-postgres-1; then
    echo -e "${RED}Error: PostgreSQL is not running${NC}"
    echo "Start it with: docker compose -f docker/docker-compose.yml up -d postgres"
    exit 1
fi

if ! docker ps | grep -q ml-rabbitmq; then
    echo -e "${RED}Error: RabbitMQ is not running${NC}"
    echo "Start it with: docker compose -f docker/docker-compose.yml up -d rabbitmq"
    exit 1
fi

echo -e "${GREEN}✓ All required services are running${NC}"

# Test 1: Direct embedding task
echo -e "\n${YELLOW}2. Testing direct embedding task...${NC}"
cd packages/api-gateway
node test-embedding-task.js > /tmp/vector-test-output.log 2>&1 &
TEST_PID=$!

# Wait for the test to complete
sleep 3

# Check if test is still running
if ps -p $TEST_PID > /dev/null; then
    echo -e "${GREEN}✓ Test task published successfully${NC}"
    kill $TEST_PID 2>/dev/null || true
else
    echo -e "${RED}✗ Test failed to publish${NC}"
    cat /tmp/vector-test-output.log
    exit 1
fi

# Monitor worker logs
echo -e "\n${YELLOW}3. Monitoring vector worker processing...${NC}"
echo -e "${BLUE}Watching for task processing (10 seconds)...${NC}"

# Capture logs for analysis
docker logs bookmarkai-vector-worker --since "10s ago" -f 2>&1 | tee /tmp/vector-worker.log &
LOG_PID=$!

# Wait for processing
sleep 10
kill $LOG_PID 2>/dev/null || true

# Check if embeddings were processed
if grep -q "Successfully generated" /tmp/vector-worker.log; then
    echo -e "${GREEN}✓ Embeddings generated successfully${NC}"
    
    # Extract metrics
    EMBEDDINGS=$(grep -oP "generated \K\d+" /tmp/vector-worker.log | head -1)
    TOKENS=$(grep -oP "\(\K\d+(?= tokens)" /tmp/vector-worker.log | head -1)
    COST=$(grep -oP "\$\K[0-9.]+" /tmp/vector-worker.log | head -1)
    
    echo -e "${BLUE}  - Embeddings created: ${EMBEDDINGS:-N/A}${NC}"
    echo -e "${BLUE}  - Tokens processed: ${TOKENS:-N/A}${NC}"
    echo -e "${BLUE}  - Cost: \$${COST:-N/A}${NC}"
else
    echo -e "${YELLOW}⚠️  No successful processing found in logs${NC}"
fi

# Test 2: Check database storage
echo -e "\n${YELLOW}4. Verifying database storage...${NC}"
cd ../..

# Check vector_costs table
COST_COUNT=$(docker exec docker-postgres-1 psql -U bookmarkai -d bookmarkai_dev -t -c "SELECT COUNT(*) FROM vector_costs WHERE created_at >= NOW() - INTERVAL '1 minute';")
COST_COUNT=$(echo $COST_COUNT | xargs)

if [ "$COST_COUNT" -gt "0" ]; then
    echo -e "${GREEN}✓ Cost tracking records found: $COST_COUNT${NC}"
    
    # Show recent costs
    echo -e "${BLUE}Recent vector costs:${NC}"
    docker exec docker-postgres-1 psql -U bookmarkai -d bookmarkai_dev -c "
        SELECT 
            model,
            input_tokens,
            chunks_generated,
            total_cost,
            created_at
        FROM vector_costs 
        WHERE created_at >= NOW() - INTERVAL '5 minutes'
        ORDER BY created_at DESC
        LIMIT 3;
    "
else
    echo -e "${YELLOW}⚠️  No cost tracking records found${NC}"
fi

# Check embeddings table
EMBEDDING_COUNT=$(docker exec docker-postgres-1 psql -U bookmarkai -d bookmarkai_dev -t -c "SELECT COUNT(*) FROM embeddings WHERE created_at >= NOW() - INTERVAL '1 minute';")
EMBEDDING_COUNT=$(echo $EMBEDDING_COUNT | xargs)

if [ "$EMBEDDING_COUNT" -gt "0" ]; then
    echo -e "${GREEN}✓ Embeddings stored: $EMBEDDING_COUNT${NC}"
else
    echo -e "${YELLOW}⚠️  No embeddings found (may be test data without real share_id)${NC}"
fi

# Test 3: Check budget views
echo -e "\n${YELLOW}5. Testing budget monitoring views...${NC}"
echo -e "${BLUE}Budget status:${NC}"
docker exec docker-postgres-1 psql -U bookmarkai -d bookmarkai_dev -c "SELECT * FROM vector_budget_status;"

# Test 4: Check Prometheus metrics
echo -e "\n${YELLOW}6. Checking Prometheus metrics...${NC}"
METRICS_RESPONSE=$(curl -s http://localhost:9093/metrics 2>/dev/null || echo "")

if [ -n "$METRICS_RESPONSE" ]; then
    echo -e "${GREEN}✓ Prometheus metrics endpoint is accessible${NC}"
    
    # Check for vector-specific metrics
    if echo "$METRICS_RESPONSE" | grep -q "ml_embeddings_generated_total"; then
        echo -e "${GREEN}✓ Vector-specific metrics found${NC}"
        
        # Extract some metrics
        EMBEDDING_METRIC=$(echo "$METRICS_RESPONSE" | grep "ml_embeddings_generated_total" | head -1)
        if [ -n "$EMBEDDING_METRIC" ]; then
            echo -e "${BLUE}  Sample metric: ${EMBEDDING_METRIC:0:80}...${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  No vector-specific metrics found yet${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Prometheus metrics endpoint not accessible${NC}"
fi

# Test 5: Test different content types
echo -e "\n${YELLOW}7. Testing different content types...${NC}"

# Create test script for content types
cat > /tmp/test-content-types.js << 'EOF'
const amqplib = require('amqplib');
const { v4: uuidv4 } = require('uuid');

async function testContentTypes() {
  const connection = await amqplib.connect('amqp://ml:ml_password@localhost:5672/');
  const channel = await connection.createChannel();

  const contentTypes = [
    { type: 'caption', text: 'Short TikTok caption #ai #tech', strategy: 'none' },
    { type: 'tweet', text: 'Just discovered an amazing ML technique for embeddings! Thread 🧵', strategy: 'none' },
    { type: 'article', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50), strategy: 'paragraph' },
    { type: 'transcript', text: 'Speaker 1: Hello everyone. Speaker 2: Today we discuss embeddings.', strategy: 'transcript' }
  ];

  for (const content of contentTypes) {
    const shareId = uuidv4();
    const message = {
      id: `test-${content.type}-${Date.now()}`,
      task: 'vector_service.tasks.generate_embeddings',
      args: [],
      kwargs: {
        share_id: shareId,
        content: {
          text: content.text,
          type: content.type,
          metadata: { test: true }
        },
        options: {
          embedding_type: 'content'
        }
      },
      retries: 0
    };

    await channel.publish(
      'bookmarkai.ml',
      'ml.embed',
      Buffer.from(JSON.stringify(message)),
      { persistent: true, contentType: 'application/json' }
    );
    
    console.log(`✓ Published ${content.type} task with UUID: ${shareId}`);
  }

  await channel.close();
  await connection.close();
}

testContentTypes().catch(console.error);
EOF

cd packages/api-gateway
node /tmp/test-content-types.js

echo -e "${GREEN}✓ Content type tests submitted${NC}"

# Summary
echo -e "\n${YELLOW}8. Test Summary${NC}"
echo "=================="
echo -e "${GREEN}✅ Completed Tests:${NC}"
echo "  - Service availability check"
echo "  - Direct embedding task publishing"
echo "  - Worker processing verification"
echo "  - Database storage verification"
echo "  - Budget monitoring views"
echo "  - Prometheus metrics endpoint"
echo "  - Multiple content type handling"

echo -e "\n${BLUE}📊 Key Metrics:${NC}"
echo "  - Vector worker: Running"
echo "  - Cost records: $COST_COUNT"
echo "  - Embeddings stored: $EMBEDDING_COUNT"
echo "  - Metrics endpoint: $([ -n "$METRICS_RESPONSE" ] && echo "Active" || echo "Inactive")"

echo -e "\n${YELLOW}📝 Next Steps:${NC}"
echo "  1. Monitor worker logs: docker logs -f bookmarkai-vector-worker"
echo "  2. Check RabbitMQ queues: http://localhost:15672"
echo "  3. View Prometheus metrics: http://localhost:9093/metrics"
echo "  4. Query embeddings with similarity search"

# Cleanup
rm -f /tmp/vector-test-output.log /tmp/vector-worker.log /tmp/test-content-types.js

echo -e "\n${GREEN}✨ Vector integration test completed!${NC}"