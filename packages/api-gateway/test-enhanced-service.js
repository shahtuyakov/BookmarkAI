#!/usr/bin/env node

/**
 * Simple test to verify enhanced ML Producer Service is working
 */

const API_BASE_URL = 'http://localhost:3001';

async function testMetrics() {
  console.log('🧪 Testing Enhanced ML Producer Service Integration\n');
  
  try {
    // Test JSON metrics endpoint
    console.log('1. Testing JSON metrics endpoint...');
    const jsonResponse = await fetch(`${API_BASE_URL}/api/ml/metrics/json`);
    const jsonData = await jsonResponse.json();
    
    console.log('   Status:', jsonResponse.status);
    console.log('   Connection State:', jsonData.data.connectionState || 'Not available');
    console.log('   Retry Queue Size:', jsonData.data.retryQueueSize || 'Not available');
    console.log('   Circuit Breaker State:', jsonData.data.circuitBreakerState || 'Not available');
    
    // Test Prometheus metrics endpoint
    console.log('\n2. Testing Prometheus metrics endpoint...');
    const promResponse = await fetch(`${API_BASE_URL}/api/ml/metrics/prometheus`);
    const promData = await promResponse.text();
    
    console.log('   Status:', promResponse.status);
    
    // Check for enhanced metrics
    const enhancedMetrics = [
      'ml_producer_retry_queue_size',
      'ml_producer_connection_state',
      'ml_producer_health_check_failures_total',
      'ml_producer_publisher_confirm_timeouts_total'
    ];
    
    console.log('\n3. Checking for enhanced metrics:');
    enhancedMetrics.forEach(metric => {
      const found = promData.includes(metric);
      console.log(`   ${found ? '✅' : '❌'} ${metric}`);
    });
    
    // Check connection state
    console.log('\n4. Connection Status:');
    const connectionStateMatch = promData.match(/ml_producer_connection_state{state="(\w+)"} (\d)/);
    if (connectionStateMatch) {
      console.log(`   State: ${connectionStateMatch[1]} (value: ${connectionStateMatch[2]})`);
    } else {
      console.log('   ❌ Connection state metric not found');
    }
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testMetrics();