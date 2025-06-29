#!/bin/bash

# Script to test Grafana dashboards setup

echo "Testing Grafana ML Monitoring Dashboards..."

# Check if Grafana is running
echo "1. Checking Grafana status..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health | grep -q "200"; then
    echo "   ✓ Grafana is running"
else
    echo "   ✗ Grafana is not accessible. Starting services..."
    docker-compose -f docker/docker-compose.yml up -d grafana prometheus
    echo "   Waiting for Grafana to start..."
    sleep 10
fi

# Check if Prometheus is running
echo "2. Checking Prometheus status..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:9090/-/ready | grep -q "200"; then
    echo "   ✓ Prometheus is running"
else
    echo "   ✗ Prometheus is not accessible"
fi

# Check ML metrics endpoint
echo "3. Checking ML metrics endpoint..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/ml/metrics/prometheus | grep -q "200"; then
    echo "   ✓ ML metrics endpoint is accessible"
else
    echo "   ✗ ML metrics endpoint is not accessible (API Gateway may not be running)"
fi

# List provisioned dashboards
echo "4. Checking provisioned dashboards..."
DASHBOARDS=$(curl -s -u admin:admin http://localhost:3000/api/search?type=dash-db | jq -r '.[] | select(.folderTitle=="ML Services") | .title' 2>/dev/null)
if [ -n "$DASHBOARDS" ]; then
    echo "   ✓ Found ML dashboards:"
    echo "$DASHBOARDS" | sed 's/^/     - /'
else
    echo "   ✗ No ML dashboards found. Checking provisioning..."
    ls -la docker/grafana/provisioning/dashboards/
fi

echo ""
echo "Dashboard URLs:"
echo "  - Grafana: http://localhost:3000 (admin/admin)"
echo "  - Prometheus: http://localhost:9090"
echo ""
echo "ML Dashboards (after login):"
echo "  - ML Producer: http://localhost:3000/d/ml-producer-monitoring"
echo "  - ML Analytics: http://localhost:3000/d/ml-analytics-monitoring"
echo "  - Python Services: http://localhost:3000/d/python-ml-services"