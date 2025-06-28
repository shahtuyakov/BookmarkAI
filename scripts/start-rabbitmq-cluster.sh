#!/bin/bash
set -e

echo "Starting RabbitMQ cluster for BookmarkAI..."

# Check if certificates exist
if [ ! -f "docker/rabbitmq-cluster/certificates/ca_certificate.pem" ]; then
    echo "Certificates not found. Generating self-signed certificates..."
    cd docker/rabbitmq-cluster && ./generate-certificates.sh && cd ../..
fi

# Start the cluster
echo "Starting RabbitMQ cluster nodes..."
docker compose -f docker/docker-compose.rabbitmq-cluster.yml up -d

# Wait for services to be healthy
echo "Waiting for RabbitMQ nodes to be ready..."
for i in {1..30}; do
    if docker compose -f docker/docker-compose.rabbitmq-cluster.yml ps | grep -q "healthy"; then
        echo "RabbitMQ nodes are healthy!"
        break
    fi
    echo -n "."
    sleep 2
done
echo ""

# Show status
docker compose -f docker/docker-compose.rabbitmq-cluster.yml ps

echo ""
echo "RabbitMQ cluster is starting up!"
echo ""
echo "Connection options:"
echo "1. Non-TLS (AMQP):"
echo "   - Load balanced: amqp://ml:ml_password@localhost:5680/"
echo "   - Direct to node 1: amqp://ml:ml_password@localhost:5681/"
echo ""
echo "2. TLS (AMQPS):"
echo "   - Load balanced: amqps://ml:ml_password@localhost:5690/"
echo "   - Direct to node 1: amqps://ml:ml_password@localhost:5691/"
echo ""
echo "3. Management UI:"
echo "   - Load balanced: http://localhost:15680"
echo "   - Node 1: http://localhost:15681"
echo "   - Username: ml, Password: ml_password"
echo ""
echo "4. HAProxy stats: http://localhost:8404/stats (admin/admin)"
echo ""
echo "NOTE: Your existing RabbitMQ on port 5672 is not affected."
echo ""
echo "Note: The cluster setup will run automatically after all nodes are healthy."