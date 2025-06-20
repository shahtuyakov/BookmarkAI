// debug-tokens.js - Run this from the api-gateway directory
// Usage: cd packages/api-gateway && node debug-tokens.js

const jwt = require('jsonwebtoken');

// Decode a JWT token without verification (for debugging)
function decodeToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { error: 'Invalid token format' };
    }
    
    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = payload.exp - now;
    const issuedAgo = now - payload.iat;
    
    return {
      header,
      payload,
      expiresIn: expiresIn > 0 ? `${expiresIn} seconds (${(expiresIn / 60).toFixed(1)} minutes)` : 'EXPIRED',
      issuedAgo: `${issuedAgo} seconds ago (${(issuedAgo / 60).toFixed(1)} minutes)`,
      expiryDate: new Date(payload.exp * 1000).toLocaleString(),
      isExpired: expiresIn <= 0
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Test token creation and expiry
async function testTokenExpiry() {
  console.log('=== Token Configuration Debug ===\n');
  
  // Check the current configuration in kms-jwt.service.ts
  const fs = require('fs');
  const path = require('path');
  
  try {
    const servicePath = path.join(__dirname, 'src/modules/auth/services/kms-jwt.service.ts');
    const content = fs.readFileSync(servicePath, 'utf8');
    
    // Find token expiry configuration
    const accessTokenMatch = content.match(/const accessTokenExpiry = iat \+ (\d+) \* (\d+);/);
    const expiresInMatch = content.match(/expiresIn: (\d+) \* (\d+),/);
    
    if (accessTokenMatch) {
      const minutes = parseInt(accessTokenMatch[1]);
      console.log(`📍 Current access token expiry in code: ${minutes} minutes`);
      
      if (minutes === 1) {
        console.log('⚠️  WARNING: Access token is set to expire after only 1 minute!');
        console.log('   This is likely causing your token refresh issues.');
        console.log('   Update kms-jwt.service.ts to use 15 minutes instead.\n');
      } else {
        console.log('✅ Access token expiry looks correct.\n');
      }
    }
    
    // If you have a sample token, decode it
    if (process.argv[2]) {
      console.log('=== Decoding provided token ===\n');
      const tokenInfo = decodeToken(process.argv[2]);
      console.log(JSON.stringify(tokenInfo, null, 2));
    } else {
      console.log('💡 TIP: Pass a JWT token as argument to decode it:');
      console.log('   node debug-tokens.js YOUR_JWT_TOKEN\n');
    }
    
  } catch (error) {
    console.error('Error reading service file:', error.message);
  }
}

// Run the debug script
testTokenExpiry();