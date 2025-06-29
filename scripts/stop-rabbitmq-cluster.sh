#!/bin/bash

echo "Stopping RabbitMQ cluster..."

# Stop the cluster
docker compose -f docker/docker-compose.rabbitmq-cluster.yml down

echo "RabbitMQ cluster stopped."

# Optional: remove volumes to clean up data
if [ "$1" = "--clean" ]; then
    echo "Cleaning up volumes..."
    docker compose -f docker/docker-compose.rabbitmq-cluster.yml down -v
    echo "Volumes removed."
fi