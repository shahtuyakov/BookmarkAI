/**
 * Test script for ML Analytics API endpoints
 * 
 * Usage: node test-ml-analytics.js
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3001';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-jwt-token-here';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function testAnalyticsEndpoints() {
  try {
    console.log('Testing ML Analytics API endpoints...\n');

    // Test 1: Get transcription cost summary
    console.log('1. Testing GET /ml/analytics/transcription/costs');
    try {
      const response = await api.get('/ml/analytics/transcription/costs?hours=24');
      console.log('✓ Cost summary:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('✗ Error:', error.response?.data || error.message);
    }

    console.log('\n---\n');

    // Test 2: Get detailed transcription costs
    console.log('2. Testing GET /ml/analytics/transcription/costs/detailed');
    try {
      const response = await api.get('/ml/analytics/transcription/costs/detailed?hours=24&limit=10');
      console.log('✓ Detailed costs:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('✗ Error:', error.response?.data || error.message);
    }

    console.log('\n---\n');

    // Test 3: Get ML task summary
    console.log('3. Testing GET /ml/analytics/tasks/summary');
    try {
      const response = await api.get('/ml/analytics/tasks/summary?hours=24');
      console.log('✓ Task summary:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('✗ Error:', error.response?.data || error.message);
    }

    console.log('\n---\n');

    // Test 4: Get budget status
    console.log('4. Testing GET /ml/analytics/budget/status');
    try {
      const response = await api.get('/ml/analytics/budget/status');
      console.log('✓ Budget status:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('✗ Error:', error.response?.data || error.message);
    }

    console.log('\n---\n');

    // Test 5: Get transcription result (will need a valid shareId)
    console.log('5. Testing GET /ml/analytics/transcription/result/:shareId');
    const testShareId = 'test-123'; // Replace with actual shareId
    try {
      const response = await api.get(`/ml/analytics/transcription/result/${testShareId}`);
      console.log('✓ Transcription result:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✓ Expected 404 for test share ID');
      } else {
        console.error('✗ Error:', error.response?.data || error.message);
      }
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Instructions
console.log('ML Analytics API Test Script');
console.log('============================\n');
console.log('Prerequisites:');
console.log('1. API Gateway should be running (npm run dev:api)');
console.log('2. You need a valid JWT token');
console.log('3. Set environment variables:');
console.log('   export API_URL=http://localhost:3001');
console.log('   export AUTH_TOKEN=your-jwt-token\n');
console.log('To get a JWT token, you can:');
console.log('1. Login via the API: POST /auth/login');
console.log('2. Or use an existing token from your browser session\n');

if (!AUTH_TOKEN || AUTH_TOKEN === 'your-jwt-token-here') {
  console.error('ERROR: Please set AUTH_TOKEN environment variable with a valid JWT token');
  process.exit(1);
}

console.log('Starting tests...\n');
testAnalyticsEndpoints();