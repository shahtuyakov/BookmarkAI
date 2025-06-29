#!/bin/bash

echo "Testing RabbitMQ TLS connections..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test function
test_connection() {
    local name=$1
    local url=$2
    
    echo -n "Testing $name... "
    
    # Use Python to test the connection
    python3 -c "
import pika
import sys
try:
    parameters = pika.URLParameters('$url')
    connection = pika.BlockingConnection(parameters)
    connection.close()
    print('${GREEN}✓ SUCCESS${NC}')
    sys.exit(0)
except Exception as e:
    print('${RED}✗ FAILED${NC}: ' + str(e))
    sys.exit(1)
" 2>/dev/null || echo -e "${RED}✗ FAILED${NC}: Python/pika not available or connection failed"
}

# Test Node.js connection
test_nodejs_connection() {
    local name=$1
    local url=$2
    
    echo -n "Testing $name (Node.js)... "
    
    # Create a temporary test file
    cat > /tmp/test-rabbitmq.js << EOF
const amqp = require('amqplib');

async function test() {
    try {
        const connection = await amqp.connect('$url', {
            // For self-signed certificates
            rejectUnauthorized: false
        });
        await connection.close();
        console.log('\x1b[32m✓ SUCCESS\x1b[0m');
        process.exit(0);
    } catch (error) {
        console.log('\x1b[31m✗ FAILED\x1b[0m:', error.message);
        process.exit(1);
    }
}

test();
EOF

    # Check if amqplib is available
    if command -v node >/dev/null 2>&1 && npm list amqplib >/dev/null 2>&1; then
        node /tmp/test-rabbitmq.js
    else
        echo -e "${RED}✗ FAILED${NC}: Node.js or amqplib not available"
    fi
    
    rm -f /tmp/test-rabbitmq.js
}

echo "=== AMQP (Non-TLS) Connections ==="
test_connection "Load Balancer (5680)" "amqp://ml:ml_password@localhost:5680/"
test_connection "Node 1 Direct (5681)" "amqp://ml:ml_password@localhost:5681/"
test_connection "Node 2 Direct (5682)" "amqp://ml:ml_password@localhost:5682/"
test_connection "Node 3 Direct (5683)" "amqp://ml:ml_password@localhost:5683/"

echo ""
echo "=== AMQPS (TLS) Connections ==="
echo "Note: TLS connections may fail if certificates are not trusted"
test_connection "Load Balancer (5690)" "amqps://ml:ml_password@localhost:5690/"
test_connection "Node 1 Direct (5691)" "amqps://ml:ml_password@localhost:5691/"

echo ""
echo "=== Node.js Connections ==="
test_nodejs_connection "AMQP Non-TLS" "amqp://ml:ml_password@localhost:5680/"
test_nodejs_connection "AMQPS TLS" "amqps://ml:ml_password@localhost:5690/"

echo ""
echo "=== Management UI ==="
echo "Testing Management UI availability..."
for port in 15680 15681 15682 15683; do
    echo -n "Port $port: "
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/ | grep -q "200\|301\|302"; then
        echo -e "${GREEN}✓ Available${NC}"
    else
        echo -e "${RED}✗ Not available${NC}"
    fi
done

echo ""
echo "=== Cluster Status ==="
docker exec rabbitmq-node1 rabbitmqctl cluster_status 2>/dev/null || echo "Could not get cluster status"