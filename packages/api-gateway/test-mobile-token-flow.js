// test-mobile-token-flow.js
// This script tests the mobile client's token handling
// Run from packages/api-gateway directory

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001/api';

// Helper to decode JWT
function decodeToken(token) {
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  return payload;
}

// Helper to format timestamps
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString();
}

async function testMobileTokenFlow() {
  console.log('🧪 Testing Mobile Token Flow\n');
  
  try {
    // Ensure test user exists
    await ensureTestUser();
    // 1. Login
    console.log('1️⃣ Testing login response...');
    const loginResponse = await axios.post(`${API_BASE_URL}/v1/auth/login`, {
      email: 'seanT@example.com',
      password: 'Test123!Abc'
    });
    
    const loginData = loginResponse.data.data;
    console.log('✅ Login response structure:');
    console.log(`   - accessToken: ${loginData.accessToken ? '✓' : '✗'}`);
    console.log(`   - refreshToken: ${loginData.refreshToken ? '✓' : '✗'}`);
    console.log(`   - expiresIn: ${loginData.expiresIn || 'MISSING'} seconds`);
    
    const payload = decodeToken(loginData.accessToken);
    const issuedAt = payload.iat * 1000; // Convert to milliseconds
    const expiresAt = payload.exp * 1000; // Convert to milliseconds
    
    console.log('\n📊 Token Timeline:');
    console.log(`   - Issued: ${formatTime(issuedAt)}`);
    console.log(`   - Expires: ${formatTime(expiresAt)}`);
    console.log(`   - Duration: ${(expiresAt - issuedAt) / 1000} seconds`);
    
    // Simulate mobile client storage
    const storedExpiresAt = Date.now() + (loginData.expiresIn * 1000);
    console.log('\n💾 Mobile Client Storage:');
    console.log(`   - Would store expiresAt as: ${formatTime(storedExpiresAt)}`);
    console.log(`   - Difference from actual: ${Math.abs(storedExpiresAt - expiresAt) / 1000} seconds`);
    
    // 2. Test refresh endpoint
    console.log('\n2️⃣ Testing refresh endpoint...');
    const refreshResponse = await axios.post(`${API_BASE_URL}/v1/auth/refresh`, {
      refreshToken: loginData.refreshToken
    });
    
    const refreshData = refreshResponse.data.data;
    console.log('✅ Refresh response structure:');
    console.log(`   - accessToken: ${refreshData.accessToken ? '✓' : '✗'}`);
    console.log(`   - refreshToken: ${refreshData.refreshToken ? '✓' : '✗'}`);
    console.log(`   - expiresIn: ${refreshData.expiresIn || 'MISSING'} seconds`);
    
    if (!refreshData.expiresIn) {
      console.log('\n⚠️  WARNING: Refresh endpoint is not returning expiresIn!');
      console.log('   This will cause issues with token expiry tracking.');
    }
    
    // 3. Compare tokens
    console.log('\n3️⃣ Comparing tokens...');
    const oldPayload = decodeToken(loginData.accessToken);
    const newPayload = decodeToken(refreshData.accessToken);
    
    console.log('   Old token:');
    console.log(`     - jti: ${oldPayload.jti}`);
    console.log(`     - exp: ${formatTime(oldPayload.exp * 1000)}`);
    console.log('   New token:');
    console.log(`     - jti: ${newPayload.jti}`);
    console.log(`     - exp: ${formatTime(newPayload.exp * 1000)}`);
    
    if (oldPayload.jti === newPayload.jti) {
      console.log('\n⚠️  WARNING: JTI should be different for new tokens!');
    }
    
    console.log('\n✨ Token flow test complete!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
  }
}

// Create test user if needed
async function ensureTestUser() {
  try {
    console.log('📝 Ensuring test user exists...');
    await axios.post(`${API_BASE_URL}/v1/auth/register`, {
      email: 'test@example.com',
      password: 'testpassword123',
      name: 'Test User'
    });
    console.log('✅ Test user created\n');
  } catch (error) {
    if (error.response?.data?.error?.code === 'CONFLICT_DUPLICATE_EMAIL') {
      console.log('✅ Test user already exists\n');
    } else {
      throw error;
    }
  }
}

// Run the test
testMobileTokenFlow();