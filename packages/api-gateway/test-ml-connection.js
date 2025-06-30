#!/usr/bin/env node

/**
 * Test ML Producer connection and basic functionality
 */

const API_BASE_URL = 'http://localhost:3001';

async function createTestShare() {
  const shareData = {
    url: 'https://www.tiktok.com/@test/video/7384515836730174761',
    platform: 'tiktok',
    metadata: {
      test: true,
      timestamp: Date.now()
    }
  };

  try {
    const response = await fetch(`${API_BASE_URL}/v1/shares`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImlhdCI6MTcxNjY5MDAwMCwiZXhwIjoxOTMyNjkwMDAwfQ.kqVbiJYIN1xX2v8TZLLHBEcQp6ihMpkBIxWtczbDaio', // Admin token
        'Idempotency-Key': `test-${Date.now()}`
      },
      body: JSON.stringify(shareData)
    });

    const result = await response.json();
    return { status: response.status, data: result };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

async function checkConnectionMetrics() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ml/metrics/prometheus`);
    const text = await response.text();
    
    // Extract connection state
    const stateMatch = text.match(/ml_producer_connection_state{state="([^"]+)"} (\d)/g);
    const states = {};
    
    if (stateMatch) {
      stateMatch.forEach(line => {
        const match = line.match(/state="([^"]+)"} (\d)/);
        if (match) {
          states[match[1]] = parseInt(match[2]);
        }
      });
    }
    
    // Find which state is active (value = 1)
    const activeState = Object.entries(states).find(([state, value]) => value === 1);
    
    return {
      connectionState: activeState ? activeState[0] : 'UNKNOWN',
      allStates: states
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function main() {
  console.log('🧪 Testing ML Producer Enhanced Service\n');
  
  // 1. Check initial connection state
  console.log('1. Checking connection state...');
  const initialMetrics = await checkConnectionMetrics();
  console.log('   Connection State:', initialMetrics.connectionState);
  console.log('   All States:', initialMetrics.allStates);
  
  // 2. Create a test share to trigger ML tasks
  console.log('\n2. Creating test share to trigger ML tasks...');
  const shareResult = await createTestShare();
  console.log('   Status:', shareResult.status);
  if (shareResult.data) {
    console.log('   Share ID:', shareResult.data.data?.id || 'N/A');
    console.log('   Success:', shareResult.data.success);
  }
  
  // 3. Wait a bit for processing
  console.log('\n3. Waiting for processing...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 4. Check connection state again
  console.log('\n4. Checking connection state after activity...');
  const finalMetrics = await checkConnectionMetrics();
  console.log('   Connection State:', finalMetrics.connectionState);
  
  // 5. Check for any errors in metrics
  console.log('\n5. Checking for connection errors...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/ml/metrics/json`);
    const jsonMetrics = await response.json();
    
    if (jsonMetrics.data && jsonMetrics.data.connection) {
      console.log('   Connection Errors:', jsonMetrics.data.connection.errors || 'None');
    }
  } catch (error) {
    console.log('   Error checking metrics:', error.message);
  }
  
  console.log('\n✅ Test completed!');
}

main().catch(console.error);