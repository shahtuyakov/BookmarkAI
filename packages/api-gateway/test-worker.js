const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_URL = 'http://localhost:3001/api';
let token;
let shareId;

async function authenticate() {
  console.log('\n📝 Authenticating...');
  
  // Update with your credentials
  const email = 'seanT@example.com';
  const password = 'Test123!Abc'; // Contains uppercase, lowercase, number and special char
  
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email,
      password
    });
    
    if (response.data && response.data.data && response.data.data.accessToken) {
      token = response.data.data.accessToken;
      console.log('Login successful! ✓');
      return true;
    } else {
      console.log('Login response did not contain token');
      console.log(response.data);
      return false;
    }
  } catch (error) {
    console.log('Login failed:');
    console.error(error.response ? error.response.data : error.message);
    return false;
  }
}

async function createShare() {
  try {
    const idempotencyKey = uuidv4();
    const url = 'https://www.tiktok.com/@user/video/test-worker-1';
    
    console.log('\n🔗 Creating a new share...');
    console.log(`URL: ${url}`);
    console.log(`Idempotency Key: ${idempotencyKey}`);
    
    const response = await axios.post(
      `${API_URL}/v1/shares`, 
      { url },
      { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
          'Content-Type': 'application/json'
        } 
      }
    );
    
    if (response.data && response.data.success) {
      console.log('Share created successfully! ✓');
      console.log(JSON.stringify(response.data, null, 2));
      
      shareId = response.data.data.id;
      console.log(`\n🔍 Share ID: ${shareId}`);
      console.log('Initial status should be "pending"');
      return true;
    } else {
      console.log('Unexpected response format:');
      console.log(JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    console.log('Failed to create share:');
    console.error(error.response ? error.response.data : error.message);
    return false;
  }
}

async function checkShareStatus() {
  try {
    console.log('\n🔍 Checking share status...');
    
    const response = await axios.get(
      `${API_URL}/v1/shares/${shareId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    if (response.data && response.data.success) {
      console.log('Share details: ✓');
      console.log(JSON.stringify(response.data, null, 2));
      
      // Check if status has changed to "done"
      const status = response.data.data.status;
      console.log(`\nCurrent status: ${status}`);
      
      if (status === 'done') {
        console.log('✅ Worker successfully processed the share!');
      } else if (status === 'processing') {
        console.log('⏳ Share is still being processed...');
      } else if (status === 'error') {
        console.log('❌ Share processing failed!');
      } else {
        console.log('🤔 Unexpected status!');
      }
      
      return status;
    } else {
      console.log('Unexpected response format:');
      console.log(JSON.stringify(response.data, null, 2));
      return null;
    }
  } catch (error) {
    console.log('Failed to get share:');
    console.error(error.response ? error.response.data : error.message);
    return null;
  }
}

async function main() {
  console.log('🧪 Testing BookmarkAI Worker\n');
  
  // Authenticate
  const authenticated = await authenticate();
  if (!authenticated) {
    console.log('❌ Authentication failed. Cannot proceed with test.');
    return;
  }
  
  // Create a share
  const shareCreated = await createShare();
  if (!shareCreated) {
    console.log('❌ Failed to create share. Cannot proceed with test.');
    return;
  }
  
  // Check initial status
  console.log('\n⏱️ Waiting 2 seconds to let the worker pick up the job...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check status again
  let status = await checkShareStatus();
  
  // If not done yet, wait longer and check again
  if (status !== 'done') {
    console.log('\n⏱️ Waiting 5 more seconds for processing to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    await checkShareStatus();
  }
  
  console.log('\n🧪 Test completed!');
}

main().catch(console.error);