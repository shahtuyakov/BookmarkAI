// Set to true to use real server, false to use mock
export const USE_REAL_SERVER = true;

// Base URL configurations for different environments
export const API_URLS = {
  // For local development on iOS Simulator
  IOSSimulator: 'http://localhost:3001/api',
  
  // For local development on Android Emulator
  AndroidEmulator: 'http://10.0.2.2:3001/api',
  
  // For local development on physical devices (replace with your computer's actual IP)
  LocalNetworkDevice: 'http://192.168.1.X:3001/api',
  
  // For development server
  Development: 'https://bookmarkai-dev.ngrok.io/api',
  
  // For production server
  Production: 'https://api.bookmarkai.com',
};

// Select the appropriate URL based on environment
// export const API_BASE_URL = API_URLS.IOSSimulator;
export const API_BASE_URL = API_URLS.Development;


// The key for storing tokens in Keychain
export const KEYCHAIN_SERVICE = 'com.bookmarkai.auth';

// Debug logging
console.log('📡 API Configuration:');
console.log(`   Base URL: ${API_BASE_URL}`);
console.log(`   Use Real Server: ${USE_REAL_SERVER}`);