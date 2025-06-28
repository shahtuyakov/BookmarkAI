#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.API_URL || 'http://localhost:3001';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

async function testMLMetrics() {
  console.log('🧪 Testing ML Producer Prometheus Metrics\n');

  try {
    // 1. Test Prometheus metrics endpoint
    console.log('📊 Testing Prometheus metrics endpoint...');
    const promResponse = await axios.get(`${API_URL}/api/metrics/prometheus`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
    });

    console.log('Content-Type:', promResponse.headers['content-type']);
    console.log('\nMetrics preview (first 20 lines):');
    const lines = promResponse.data.split('\n');
    lines.slice(0, 20).forEach(line => console.log(line));
    console.log(`... (${lines.length} total lines)`);

    // 2. Test JSON metrics endpoint
    console.log('\n\n📈 Testing JSON metrics endpoint...');
    const jsonResponse = await axios.get(`${API_URL}/api/metrics/ml-producer`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
    });

    console.log(JSON.stringify(jsonResponse.data, null, 2));

    // 3. Test health endpoint to trigger gauge updates
    console.log('\n\n🏥 Testing health endpoint...');
    const healthResponse = await axios.get(`${API_URL}/api/ml/analytics/health`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
    });

    console.log(JSON.stringify(healthResponse.data, null, 2));

    // 4. Create a test share to generate metrics
    console.log('\n\n📝 Creating test share to generate ML task metrics...');
    const shareResponse = await axios.post(
      `${API_URL}/api/shares`,
      {
        url: 'https://example.com/test-article',
        note: 'Test article for ML metrics validation',
      },
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Share created:', shareResponse.data.data.id);

    // 5. Wait a bit and check metrics again
    console.log('\n⏱️  Waiting 3 seconds for metrics to update...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n📊 Checking updated Prometheus metrics...');
    const updatedPromResponse = await axios.get(`${API_URL}/api/metrics/prometheus`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
    });

    // Look for ML metrics
    const mlMetrics = updatedPromResponse.data
      .split('\n')
      .filter(line => line.includes('ml_producer_') && !line.startsWith('#'));

    console.log('\nML Producer metrics found:');
    mlMetrics.forEach(metric => console.log(metric));

    console.log('\n✅ ML metrics test completed successfully!');

  } catch (error) {
    console.error('\n❌ Error testing metrics:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testMLMetrics();