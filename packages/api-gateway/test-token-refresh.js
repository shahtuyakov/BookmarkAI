// test-token-refresh.js - Test token refresh functionality
// Usage: cd packages/api-gateway && node test-token-refresh.js

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';
const TEST_EMAIL = 'seanT@example.com';
const TEST_PASSWORD = 'Test123!Abc';

// Helper to decode JWT
function decodeToken(token) {
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  return payload;
}

// Helper to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testTokenRefresh() {
  console.log('🧪 Testing Token Refresh Functionality\n');
  
  try {
    // 1. Login to get tokens
    console.log('1️⃣ Logging in...');
    const loginResponse = await axios.post(`${API_BASE_URL}/v1/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    
    const { accessToken, refreshToken, expiresIn } = loginResponse.data.data;
    console.log(`✅ Login successful`);
    console.log(`   Access token expires in: ${expiresIn} seconds (${(expiresIn/60).toFixed(1)} minutes)`);
    
    const accessPayload = decodeToken(accessToken);
    console.log(`   Token will expire at: ${new Date(accessPayload.exp * 1000).toLocaleString()}\n`);
    
    // 2. Make a successful API call
    console.log('2️⃣ Testing authenticated API call...');
    const profileResponse = await axios.get(`${API_BASE_URL}/v1/auth/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    console.log(`✅ API call successful - User: ${profileResponse.data.data.email}\n`);
    
    // 3. Test refresh token endpoint
    console.log('3️⃣ Testing token refresh...');
    const refreshResponse = await axios.post(`${API_BASE_URL}/v1/auth/refresh`, {
      refreshToken
    });
    
    const newTokens = refreshResponse.data.data;
    console.log(`✅ Token refresh successful`);
    console.log(`   New access token expires in: ${newTokens.expiresIn || 900} seconds\n`);
    
    // 4. Test with new token
    console.log('4️⃣ Testing API call with refreshed token...');
    const newProfileResponse = await axios.get(`${API_BASE_URL}/v1/auth/profile`, {
      headers: { Authorization: `Bearer ${newTokens.accessToken}` }
    });
    console.log(`✅ API call with new token successful\n`);
    
    // 5. Test expired token handling
    if (expiresIn <= 120) { // Only if token expires in 2 minutes or less
      console.log('5️⃣ Waiting for token to expire...');
      console.log(`   Waiting ${expiresIn + 5} seconds...`);
      await wait((expiresIn + 5) * 1000);
      
      console.log('   Testing with expired token...');
      try {
        await axios.get(`${API_BASE_URL}/v1/auth/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        console.log('❌ ERROR: Expired token was accepted!');
      } catch (error) {
        if (error.response?.status === 401) {
          console.log('✅ Expired token correctly rejected with 401\n');
        } else {
          console.log('❌ Unexpected error:', error.message);
        }
      }
    } else {
      console.log('⏭️  Skipping expiry test (token expires in more than 2 minutes)\n');
    }
    
    console.log('✨ Token refresh system appears to be working correctly!');
    
    // 6. Cleanup - logout
    await axios.post(`${API_BASE_URL}/v1/auth/logout`, {}, {
      headers: { Authorization: `Bearer ${newTokens.accessToken}` }
    });
    console.log('🧹 Logged out successfully');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n💡 If you\'re getting 401 errors, check:');
      console.log('   1. Is the API server running?');
      console.log('   2. Are the test credentials correct?');
      console.log('   3. Has the token expiry been fixed in kms-jwt.service.ts?');
    }
  }
}

// Create test user if needed
async function ensureTestUser() {
  try {
    console.log('📝 Ensuring test user exists...');
    await axios.post(`${API_BASE_URL}/v1/auth/register`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
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
async function main() {
  console.log(`🔗 API URL: ${API_BASE_URL}\n`);
  
  try {
    await ensureTestUser();
    await testTokenRefresh();
  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  }
}

main();