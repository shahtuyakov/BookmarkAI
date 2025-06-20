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
  Production: 'https://api.bookmarkai.com/api',
};

// Select the appropriate URL based on environment
// For React Native, we can use __DEV__ to determine debug vs release
export const API_BASE_URL = __DEV__ 
  ? API_URLS.Development 
  : API_URLS.Production;


// The key for storing tokens in Keychain
export const KEYCHAIN_SERVICE = 'com.bookmarkai.auth';

