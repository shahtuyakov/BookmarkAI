/**
 * Test script for BookmarkAI /shares endpoint
 * 
 * This script tests the entire flow:
 * 1. Authentication (login/register)
 * 2. Creating shares
 * 3. Testing idempotency
 * 4. Listing shares
 * 5. Getting a specific share
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const readline = require('readline');

// Configuration
const API_URL = 'http://localhost:3001/api';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Test URLs
const TEST_URLS = [
  'https://www.tiktok.com/@user/video/1234567897',
  'https://www.reddit.com/r/programming/comments/abc123/title',
  'https://twitter.com/user/status/1234567890',
  'https://x.com/user/status/1234567890'
];

// Store token and share ID
let token;
let shareId;

/**
 * Prompt for user input
 */
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Log with color
 */
function colorLog(message, type = 'info') {
  const colors = {
    success: '\x1b[32m', // green
    info: '\x1b[36m',    // cyan
    error: '\x1b[31m',   // red
    warning: '\x1b[33m', // yellow
    reset: '\x1b[0m'     // reset
  };
  
  console.log(`${colors[type]}${message}${colors.reset}`);
}

/**
 * Manual authentication
 */
async function authenticate() {
  colorLog('\n📝 First, we need to authenticate', 'info');
  
  // Ask user if they want to enter their token directly
  const useExistingToken = await prompt('Do you already have a token? (y/n): ');
  
  if (useExistingToken.toLowerCase() === 'y') {
    token = await prompt('Enter your token: ');
    colorLog('Using provided token ✓', 'success');
    return true;
  }
  
  // Otherwise, prompt for login/register
  const authChoice = await prompt('Choose (1) Login or (2) Register: ');
  
  if (authChoice === '1') {
    // Login flow
    const email = await prompt('Enter email: ');
    const password = await prompt('Enter password: ');
    
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password
      });
      
      if (response.data && response.data.data && response.data.data.accessToken) {
        token = response.data.data.accessToken;
        colorLog('Login successful! ✓', 'success');
        return true;
      } else {
        colorLog('Login response did not contain token', 'error');
        console.log(response.data);
        return false;
      }
    } catch (error) {
      colorLog('Login failed:', 'error');
      console.error(error.response ? error.response.data : error.message);
      return false;
    }
  } else if (authChoice === '2') {
    // Register flow
    const email = await prompt('Enter email: ');
    const name = await prompt('Enter name: ');
    const password = await prompt('Enter password (needs uppercase, lowercase, number, special char): ');
    
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        email,
        name,
        password
      });
      
      if (response.data && response.data.data && response.data.data.accessToken) {
        token = response.data.data.accessToken;
        colorLog('Registration successful! ✓', 'success');
        return true;
      } else {
        colorLog('Registration response did not contain token', 'error');
        console.log(response.data);
        return false;
      }
    } catch (error) {
      colorLog('Registration failed:', 'error');
      console.error(error.response ? error.response.data : error.message);
      return false;
    }
  } else {
    colorLog('Invalid choice', 'error');
    return false;
  }
}

/**
 * Create a new share
 */
async function createShare() {
  try {
    // Generate a unique idempotency key
    const idempotencyKey = uuidv4();
    const randomUrlIndex = Math.floor(Math.random() * TEST_URLS.length);
    
    colorLog('\n🔗 Creating a new share...', 'info');
    colorLog(`URL: ${TEST_URLS[randomUrlIndex]}`, 'info');
    colorLog(`Idempotency Key: ${idempotencyKey}`, 'info');
    
    const response = await axios.post(
      `${API_URL}/v1/shares`, 
      { url: TEST_URLS[randomUrlIndex] },
      { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
          'Content-Type': 'application/json'
        } 
      }
    );
    
    if (response.data && response.data.success) {
      colorLog('Share created successfully! ✓', 'success');
      console.log(JSON.stringify(response.data, null, 2));
      
      shareId = response.data.data.id;
      return true;
    } else {
      colorLog('Unexpected response format:', 'error');
      console.log(JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    colorLog('Failed to create share:', 'error');
    console.error(error.response ? error.response.data : error.message);
    return false;
  }
}

/**
 * Test idempotency by creating the same share again
 */
async function testIdempotency() {
  try {
    // Use a fixed idempotency key
    const idempotencyKey = '11111111-1111-1111-1111-111111111111';
    
    colorLog('\n🔄 Testing idempotency (creating share with same key)...', 'info');
    
    // First request
    colorLog('First request:', 'info');
    const response1 = await axios.post(
      `${API_URL}/v1/shares`, 
      { url: TEST_URLS[0] },
      { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
          'Content-Type': 'application/json'
        } 
      }
    );
    
    console.log(JSON.stringify(response1.data, null, 2));
    
    // Second request with same key
    colorLog('\nSecond request with same idempotency key:', 'info');
    const response2 = await axios.post(
      `${API_URL}/v1/shares`, 
      { url: TEST_URLS[0] },
      { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
          'Content-Type': 'application/json'
        } 
      }
    );
    
    console.log(JSON.stringify(response2.data, null, 2));
    
    // Verify the responses have the same ID
    const id1 = response1.data.data.id;
    const id2 = response2.data.data.id;
    
    if (id1 === id2) {
      colorLog(`✅ Idempotency works! Both responses have the same ID: ${id1}`, 'success');
    } else {
      colorLog(`❌ Idempotency issue: First ID ${id1}, Second ID ${id2}`, 'error');
    }
    
    return true;
  } catch (error) {
    colorLog('Idempotency test failed:', 'error');
    console.error(error.response ? error.response.data : error.message);
    return false;
  }
}

/**
 * List all shares
 */
async function listShares() {
  try {
    colorLog('\n📋 Listing all shares...', 'info');
    
    const response = await axios.get(
      `${API_URL}/v1/shares`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    if (response.data && response.data.success) {
      const shares = response.data.data.items;
      colorLog(`Found ${shares.length} shares: ✓`, 'success');
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    } else {
      colorLog('Unexpected response format:', 'error');
      console.log(JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    colorLog('Failed to list shares:', 'error');
    console.error(error.response ? error.response.data : error.message);
    return false;
  }
}

/**
 * Get a specific share by ID
 */
async function getShareById() {
  try {
    if (!shareId) {
      colorLog('No share ID available to fetch', 'warning');
      const manualId = await prompt('Enter a share ID manually (or press enter to skip): ');
      if (!manualId) return false;
      shareId = manualId;
    }
    
    colorLog(`\n🔍 Getting share by ID: ${shareId}`, 'info');
    
    const response = await axios.get(
      `${API_URL}/v1/shares/${shareId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    if (response.data && response.data.success) {
      colorLog('Share details: ✓', 'success');
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    } else {
      colorLog('Unexpected response format:', 'error');
      console.log(JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    colorLog('Failed to get share by ID:', 'error');
    console.error(error.response ? error.response.data : error.message);
    return false;
  }
}

/**
 * Run the tests
 */
async function runTests() {
  colorLog('🧪 Starting API Tests for /shares endpoint\n', 'info');
  
  try {
    // Authentication
    const authenticated = await authenticate();
    if (!authenticated) {
      colorLog('❌ Authentication failed. Cannot proceed with tests.', 'error');
      rl.close();
      return;
    }
    
    // Menu-driven testing
    while (true) {
      colorLog('\n📌 Choose a test to run:', 'info');
      colorLog('1. Create a new share', 'info');
      colorLog('2. Test idempotency', 'info');
      colorLog('3. List all shares', 'info');
      colorLog('4. Get share by ID', 'info');
      colorLog('5. Run all tests', 'info');
      colorLog('0. Exit', 'info');
      
      const choice = await prompt('\nEnter your choice: ');
      
      switch (choice) {
        case '1':
          await createShare();
          break;
        case '2':
          await testIdempotency();
          break;
        case '3':
          await listShares();
          break;
        case '4':
          await getShareById();
          break;
        case '5':
          await createShare();
          await testIdempotency();
          await listShares();
          await getShareById();
          break;
        case '0':
          colorLog('\n👋 Tests completed!', 'success');
          rl.close();
          return;
        default:
          colorLog('Invalid option', 'error');
      }
    }
  } catch (error) {
    colorLog(`Test error: ${error.message}`, 'error');
    rl.close();
  }
}

// Run the tests
runTests().catch(error => {
  colorLog(`Unhandled error: ${error.message}`, 'error');
  rl.close();
});