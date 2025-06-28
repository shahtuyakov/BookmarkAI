#!/bin/sh
set -e

echo "Setting up RabbitMQ cluster..."

# Wait for all nodes to be ready
sleep 10

# Join rabbitmq2 to rabbitmq1
echo "Joining rabbitmq2 to cluster..."
docker exec rabbitmq-node2 rabbitmqctl stop_app
docker exec rabbitmq-node2 rabbitmqctl reset
docker exec rabbitmq-node2 rabbitmqctl join_cluster rabbit@rabbitmq1
docker exec rabbitmq-node2 rabbitmqctl start_app

# Join rabbitmq3 to rabbitmq1
echo "Joining rabbitmq3 to cluster..."
docker exec rabbitmq-node3 rabbitmqctl stop_app
docker exec rabbitmq-node3 rabbitmqctl reset
docker exec rabbitmq-node3 rabbitmqctl join_cluster rabbit@rabbitmq1
docker exec rabbitmq-node3 rabbitmqctl start_app

# Set cluster name
echo "Setting cluster name..."
docker exec rabbitmq-node1 rabbitmqctl set_cluster_name bookmarkai-ml-cluster

# Create HA policies for quorum queues
echo "Creating HA policies..."
docker exec rabbitmq-node1 rabbitmqctl set_policy ha-all "^ml\." '{"queue-type":"quorum","replication-factor":3}' --priority 1 --apply-to queues

# Set up permissions for ml user
echo "Setting up user permissions..."
docker exec rabbitmq-node1 rabbitmqctl set_permissions -p / ml ".*" ".*" ".*"

# Enable additional monitoring
echo "Enabling monitoring..."
docker exec rabbitmq-node1 rabbitmqctl set_user_tags ml administrator monitoring

# Show cluster status
echo "Cluster status:"
docker exec rabbitmq-node1 rabbitmqctl cluster_status

echo "RabbitMQ cluster setup complete!"
echo ""
echo "Access points:"
echo "- AMQP (load balanced): localhost:5680"
echo "- AMQPS (load balanced): localhost:5690"
echo "- Management UI: http://localhost:15680 (load balanced)"
echo "- Individual nodes:"
echo "  - Node 1: localhost:5681 (AMQP), localhost:15681 (Management)"
echo "  - Node 2: localhost:5682 (AMQP), localhost:15682 (Management)"
echo "  - Node 3: localhost:5683 (AMQP), localhost:15683 (Management)"
echo "- HAProxy stats: http://localhost:8404/stats (admin/admin)"