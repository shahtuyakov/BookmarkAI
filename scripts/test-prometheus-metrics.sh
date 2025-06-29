#!/bin/bash
# Test script to verify Prometheus metrics are being exposed

echo "Testing Prometheus metrics endpoints..."
echo

# Test LLM worker metrics
echo "=== LLM Worker Metrics (port 9091) ==="
curl -s http://localhost:9091/metrics | grep -E "^(ml_|worker_)" | head -20
echo

# Test Whisper worker metrics  
echo "=== Whisper Worker Metrics (port 9092) ==="
curl -s http://localhost:9092/metrics | grep -E "^(ml_|worker_)" | head -20
echo

# Check specific metrics
echo "=== Checking for key metrics ==="
echo -n "LLM Worker - ml_tasks_total: "
curl -s http://localhost:9091/metrics | grep -c "^ml_tasks_total"

echo -n "LLM Worker - ml_cost_dollars_total: "
curl -s http://localhost:9091/metrics | grep -c "^ml_cost_dollars_total"

echo -n "Whisper Worker - ml_audio_duration_seconds_total: "
curl -s http://localhost:9092/metrics | grep -c "^ml_audio_duration_seconds_total"

echo -n "Whisper Worker - ml_task_duration_seconds: "
curl -s http://localhost:9092/metrics | grep -c "^ml_task_duration_seconds"

echo
echo "If you see 0s above, the workers may need to process some tasks first to generate metrics."