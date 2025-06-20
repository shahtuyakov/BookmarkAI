/**
 * Auth Provider Switcher
 * 
 * This file allows switching between direct API and SDK implementations
 * without changing imports throughout the app.
 * 
 * To switch implementations:
 * 1. Change USE_SDK_AUTH to true
 * 2. Test thoroughly
 * 3. Remove old implementation once validated
 */

import React from 'react';
import { AuthProvider as DirectAuthProvider, useAuth as useDirectAuth } from './AuthContext';
import { SDKAuthProvider, useAuth as useSDKAuth } from './SDKAuthContext';
import { BookmarkAIClient } from '@bookmarkai/sdk';
import { PlatformNetworkAdapter } from '../adapters';
import { ReactNativeStorageAdapter } from '@bookmarkai/sdk';
import { keychainWrapper } from '../utils/keychain-wrapper';
import { MMKV } from 'react-native-mmkv';

// Feature flag to control which implementation to use
// Set to true to test SDK implementation
const USE_SDK_AUTH = true;

// Create SDK client instance for SDK auth provider
const createSDKClient = () => {
  const mmkv = new MMKV({ id: 'bookmarkai-storage' });
  
  const storageAdapter = new ReactNativeStorageAdapter({
    keychain: keychainWrapper,
    mmkv: mmkv,
  });
  
  const networkAdapter = new PlatformNetworkAdapter();
  
  const apiUrl = __DEV__ 
    ? 'https://bookmarkai-dev.ngrok.io/api'
    : 'https://api.bookmarkai.com/api';
  
  const client = new BookmarkAIClient({
    baseUrl: apiUrl,
    adapter: {
      network: networkAdapter,
      storage: storageAdapter,
      crypto: {
        encrypt: async (data: string) => {
          const bytes = new TextEncoder().encode(data);
          const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
          return btoa(binaryString);
        },
        decrypt: async (data: string) => {
          const binaryString = atob(data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return new TextDecoder().decode(bytes);
        },
        generateKey: async () => Math.random().toString(36).substring(2),
      },
    },
    environment: __DEV__ ? 'development' : 'production',
    onTokenRefresh: (_tokens) => {
      console.log('SDK token refresh callback triggered');
    },
  });
  
  return client;
};

// Export the appropriate provider based on feature flag
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (USE_SDK_AUTH) {
    console.log('🚀 Using SDK-based AuthProvider');
    const client = React.useMemo(() => createSDKClient(), []);
    return <SDKAuthProvider client={client}>{children}</SDKAuthProvider>;
  } else {
    console.log('📡 Using Direct API AuthProvider');
    return <DirectAuthProvider>{children}</DirectAuthProvider>;
  }
};

// Export the appropriate hook based on feature flag
export const useAuth = () => {
  if (USE_SDK_AUTH) {
    return useSDKAuth();
  } else {
    return useDirectAuth();
  }
};

// Export a helper to check which implementation is active
export const isUsingSDKAuth = () => USE_SDK_AUTH;