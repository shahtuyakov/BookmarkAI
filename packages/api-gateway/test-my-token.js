// test-my-token.js
// Test token refresh with your own credentials
// Usage: cd packages/api-gateway && node test-my-token.js

const axios = require('axios');
const readline = require('readline');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

// Helper to decode JWT
function decodeToken(token) {
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  return payload;
}

// Helper to format time
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString();
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper to ask questions
function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function testTokenWithRealUser() {
  console.log('🧪 Token Test with Real User\n');
  
  try {
    // Get credentials from user
    const email = await question('Enter your email: ');
    const password = await question('Enter your password: ');
    
    console.log('\n1️⃣ Logging in...');
    const loginResponse = await axios.post(`${API_BASE_URL}/v1/auth/login`, {
      email,
      password
    });
    
    const loginData = loginResponse.data.data;
    console.log('✅ Login successful!');
    console.log(`   - Got access token: ${loginData.accessToken ? 'Yes' : 'No'}`);
    console.log(`   - Got refresh token: ${loginData.refreshToken ? 'Yes' : 'No'}`);
    console.log(`   - ExpiresIn: ${loginData.expiresIn} seconds (${(loginData.expiresIn/60).toFixed(1)} minutes)`);
    
    // Decode and display token info
    const payload = decodeToken(loginData.accessToken);
    console.log('\n📊 Token Details:');
    console.log(`   - User ID: ${payload.sub}`);
    console.log(`   - Email: ${payload.email}`);
    console.log(`   - Issued: ${formatTime(payload.iat * 1000)}`);
    console.log(`   - Expires: ${formatTime(payload.exp * 1000)}`);
    console.log(`   - Valid for: ${payload.exp - payload.iat} seconds\n`);
    
    // Test authenticated endpoint
    console.log('2️⃣ Testing authenticated API call...');
    const profileResponse = await axios.get(`${API_BASE_URL}/v1/auth/profile`, {
      headers: { Authorization: `Bearer ${loginData.accessToken}` }
    });
    console.log('✅ Profile fetch successful!');
    console.log(`   - Name: ${profileResponse.data.data.name}`);
    console.log(`   - Email verified: ${profileResponse.data.data.emailVerified}\n`);
    
    // Test refresh
    const shouldTestRefresh = await question('Test token refresh? (y/n): ');
    
    if (shouldTestRefresh.toLowerCase() === 'y') {
      console.log('\n3️⃣ Testing token refresh...');
      const refreshResponse = await axios.post(`${API_BASE_URL}/v1/auth/refresh`, {
        refreshToken: loginData.refreshToken
      });
      
      const refreshData = refreshResponse.data.data;
      console.log('✅ Token refresh successful!');
      console.log(`   - Got new access token: ${refreshData.accessToken ? 'Yes' : 'No'}`);
      console.log(`   - Got new refresh token: ${refreshData.refreshToken ? 'Yes' : 'No'}`);
      console.log(`   - ExpiresIn: ${refreshData.expiresIn || 'Not provided'}`);
      
      if (!refreshData.expiresIn) {
        console.log('\n⚠️  WARNING: The refresh endpoint is not returning expiresIn!');
        console.log('   This may cause issues with token expiry tracking in the mobile app.');
      }
    }
    
    console.log('\n✅ All tests passed! Your token system is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n💡 Check your credentials and try again.');
    }
  } finally {
    rl.close();
  }
}

// Run the test
testTokenWithRealUser();