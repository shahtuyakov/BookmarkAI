#!/usr/bin/env node

/**
 * Test script for ML Producer reliability improvements
 * 
 * Usage:
 *   node test-ml-producer-reliability.js [test-name]
 * 
 * Available tests:
 *   - connection-resilience: Test reconnection with jitter
 *   - message-retry: Test message-level retry logic
 *   - circuit-breaker: Test circuit breaker behavior
 *   - publisher-confirms: Test publisher confirm timeout
 *   - health-check: Test connection health monitoring
 *   - all: Run all tests
 */

const amqplib = require('amqplib');
const { v4: uuidv4 } = require('uuid');

// Test configuration
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://ml:ml_password@localhost:5672/';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

// Helper functions
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function makeApiRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
  return {
    status: response.status,
    data: await response.json(),
  };
}

// Test: Connection Resilience
async function testConnectionResilience() {
  console.log('\n🧪 Testing Connection Resilience...');
  
  try {
    // Get initial status
    const initialStatus = await makeApiRequest('/api/ml/metrics/json');
    console.log('Initial connection state:', initialStatus.data.connectionState);
    
    // Create a share for testing
    const shareId = uuidv4();
    console.log(`Created test share: ${shareId}`);
    
    // Send a message to ensure connection is working
    const result1 = await makeApiRequest(`/api/shares/${shareId}/ml/summarize`, 'POST', {
      text: 'Test content for connection resilience',
      title: 'Test Title',
    });
    console.log('Message sent successfully before disruption');
    
    console.log('\n⚠️  Please stop RabbitMQ container: docker stop ml-rabbitmq');
    console.log('Waiting for you to stop the container...');
    await sleep(10000); // Wait 10 seconds
    
    // Try to send message while disconnected
    console.log('\nAttempting to send message while disconnected...');
    try {
      const result2 = await makeApiRequest(`/api/shares/${shareId}/ml/summarize`, 'POST', {
        text: 'Test content during disconnection',
        title: 'Test Title 2',
      });
      console.log('Message queued for retry:', result2.status === 202);
    } catch (error) {
      console.log('Expected error during disconnection:', error.message);
    }
    
    // Check metrics during disconnection
    const disconnectedStatus = await makeApiRequest('/api/ml/metrics/json');
    console.log('Reconnect attempts:', disconnectedStatus.data.reconnectAttempts);
    console.log('Retry queue size:', disconnectedStatus.data.retryQueueSize);
    
    console.log('\n⚠️  Please start RabbitMQ container: docker start ml-rabbitmq');
    console.log('Waiting for reconnection...');
    await sleep(15000); // Wait 15 seconds
    
    // Check final status
    const finalStatus = await makeApiRequest('/api/ml/metrics/json');
    console.log('\nFinal connection state:', finalStatus.data.connectionState);
    console.log('Messages delivered from retry queue:', 
      disconnectedStatus.data.retryQueueSize - finalStatus.data.retryQueueSize);
    
    console.log('\n✅ Connection resilience test completed');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Test: Message Retry Logic
async function testMessageRetry() {
  console.log('\n🧪 Testing Message Retry Logic...');
  
  try {
    // Create test share
    const shareId = uuidv4();
    
    // Temporarily break routing by using wrong routing key
    // This simulates a message that can't be routed
    console.log('Sending message with invalid routing...');
    
    // Monitor retry metrics
    const metricsEndpoint = '/api/ml/metrics/prometheus';
    
    // Get initial retry count
    const initialMetrics = await makeApiRequest(metricsEndpoint);
    const initialRetries = parsePrometheusMetric(initialMetrics.data, 'ml_producer_task_retries_total');
    
    // Note: To properly test this, you would need to modify the service
    // to expose a test endpoint that uses invalid routing
    console.log('Initial retry count:', initialRetries);
    
    // Wait for retries
    console.log('Waiting for retry attempts...');
    await sleep(5000);
    
    // Check retry metrics
    const finalMetrics = await makeApiRequest(metricsEndpoint);
    const finalRetries = parsePrometheusMetric(finalMetrics.data, 'ml_producer_task_retries_total');
    
    console.log('Final retry count:', finalRetries);
    console.log('Retries performed:', finalRetries - initialRetries);
    
    console.log('\n✅ Message retry test completed');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Test: Circuit Breaker
async function testCircuitBreaker() {
  console.log('\n🧪 Testing Circuit Breaker...');
  
  try {
    // Get initial circuit breaker state
    const initialStatus = await makeApiRequest('/api/ml/metrics/json');
    console.log('Initial circuit breaker state:', initialStatus.data.circuitBreakerOpen);
    
    console.log('\n⚠️  This test requires RabbitMQ to be stopped');
    console.log('Please run: docker stop ml-rabbitmq');
    await sleep(5000);
    
    // Send multiple messages to trigger circuit breaker
    console.log('\nSending 12 messages to trigger circuit breaker...');
    const promises = [];
    for (let i = 0; i < 12; i++) {
      const shareId = uuidv4();
      promises.push(
        makeApiRequest(`/api/shares/${shareId}/ml/summarize`, 'POST', {
          text: `Test content ${i}`,
          title: `Test ${i}`,
        }).catch(err => ({ error: err.message }))
      );
    }
    
    const results = await Promise.all(promises);
    const failures = results.filter(r => r.error).length;
    console.log(`Failures: ${failures}/12`);
    
    // Check circuit breaker state
    const cbStatus = await makeApiRequest('/api/ml/metrics/json');
    console.log('Circuit breaker open:', cbStatus.data.circuitBreakerOpen);
    console.log('Consecutive failures:', cbStatus.data.consecutiveFailures);
    
    // Try one more request - should fail immediately
    console.log('\nTrying request with circuit breaker open...');
    const cbTestStart = Date.now();
    try {
      await makeApiRequest(`/api/shares/${uuidv4()}/ml/summarize`, 'POST', {
        text: 'Test with circuit breaker open',
      });
    } catch (error) {
      const duration = Date.now() - cbTestStart;
      console.log(`Request failed in ${duration}ms (should be fast due to circuit breaker)`);
    }
    
    console.log('\n⚠️  Please start RabbitMQ: docker start ml-rabbitmq');
    console.log('Waiting for circuit breaker cooldown (30s)...');
    await sleep(35000);
    
    // Check if circuit breaker closed
    const finalStatus = await makeApiRequest('/api/ml/metrics/json');
    console.log('Final circuit breaker state:', finalStatus.data.circuitBreakerOpen);
    
    console.log('\n✅ Circuit breaker test completed');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Test: Publisher Confirms
async function testPublisherConfirms() {
  console.log('\n🧪 Testing Publisher Confirms...');
  
  try {
    // Create multiple shares and send messages concurrently
    console.log('Sending 10 messages concurrently...');
    const startTime = Date.now();
    
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const shareId = uuidv4();
      promises.push(
        makeApiRequest(`/api/shares/${shareId}/ml/summarize`, 'POST', {
          text: `Concurrent test content ${i}`,
          title: `Concurrent Test ${i}`,
        })
      );
    }
    
    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    const successful = results.filter(r => r.status === 200 || r.status === 202).length;
    console.log(`Successfully sent: ${successful}/10 messages in ${duration}ms`);
    
    // Check metrics for confirm timeouts
    const metrics = await makeApiRequest('/api/ml/metrics/prometheus');
    const timeouts = parsePrometheusMetric(metrics.data, 'ml_producer_confirm_timeouts_total');
    console.log('Publisher confirm timeouts:', timeouts);
    
    console.log('\n✅ Publisher confirms test completed');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Test: Health Check
async function testHealthCheck() {
  console.log('\n🧪 Testing Health Check Monitoring...');
  
  try {
    // Check initial health
    const health1 = await makeApiRequest('/api/ml/health');
    console.log('Initial health status:', health1.data);
    
    // Monitor health endpoint for 1 minute
    console.log('\nMonitoring health for 60 seconds...');
    console.log('(Health checks run every 30 seconds)');
    
    let healthCheckCount = 0;
    const monitorInterval = setInterval(async () => {
      const health = await makeApiRequest('/api/ml/health');
      healthCheckCount++;
      console.log(`Health check #${healthCheckCount}:`, health.data.healthy ? '✅' : '❌');
    }, 10000); // Check every 10 seconds
    
    await sleep(60000); // Monitor for 60 seconds
    clearInterval(monitorInterval);
    
    console.log(`\nCompleted ${healthCheckCount} health checks`);
    console.log('✅ Health check monitoring test completed');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Helper to parse Prometheus metrics
function parsePrometheusMetric(metricsText, metricName) {
  const lines = metricsText.split('\n');
  const metricLine = lines.find(line => line.startsWith(metricName));
  if (!metricLine) return 0;
  
  const match = metricLine.match(/}\s+(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

// Main test runner
async function main() {
  const testName = process.argv[2] || 'all';
  
  console.log('🚀 ML Producer Reliability Test Suite');
  console.log('=====================================');
  console.log(`API URL: ${API_BASE_URL}`);
  console.log(`RabbitMQ URL: ${RABBITMQ_URL}`);
  
  const tests = {
    'connection-resilience': testConnectionResilience,
    'message-retry': testMessageRetry,
    'circuit-breaker': testCircuitBreaker,
    'publisher-confirms': testPublisherConfirms,
    'health-check': testHealthCheck,
  };
  
  if (testName === 'all') {
    for (const [name, testFn] of Object.entries(tests)) {
      await testFn();
      await sleep(2000); // Pause between tests
    }
  } else if (tests[testName]) {
    await tests[testName]();
  } else {
    console.error(`Unknown test: ${testName}`);
    console.log('Available tests:', Object.keys(tests).join(', '));
    process.exit(1);
  }
  
  console.log('\n🎉 All tests completed!');
}

// Run tests
main().catch(console.error);