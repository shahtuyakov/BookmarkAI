import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { BookmarkAIClient } from '@bookmarkai/sdk';
import { ReactNativeStorageAdapter } from '@bookmarkai/sdk/dist/adapters/storage/react-native.storage';
import { ReactNativeNetworkAdapter } from '@bookmarkai/sdk/dist/adapters/react-native.adapter';
import * as Keychain from 'react-native-keychain';
import { MMKV } from 'react-native-mmkv';
import { SyncService } from '../services/SyncService';
import Config from 'react-native-config';

interface SDKContextValue {
  client: BookmarkAIClient | null;
  syncService: SyncService | null;
  isInitialized: boolean;
  error: Error | null;
}

const SDKContext = createContext<SDKContextValue>({
  client: null,
  syncService: null,
  isInitialized: false,
  error: null,
});

interface SDKProviderProps {
  children: ReactNode;
}

const mmkv = new MMKV({ id: 'bookmarkai-storage' });

export function SDKProvider({ children }: SDKProviderProps) {
  const [client, setClient] = useState<BookmarkAIClient | null>(null);
  const [syncService, setSyncService] = useState<SyncService | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function initializeSDK() {
      try {
        // Create storage adapter with react-native-keychain
        const storageAdapter = new ReactNativeStorageAdapter({
          keychain: Keychain,
          mmkv: mmkv,
        });

        // Create network adapter
        const networkAdapter = new ReactNativeNetworkAdapter();

        // Determine API URL based on environment
        const apiUrl = __DEV__ 
          ? Config.API_URL || 'http://localhost:3000/v1'
          : 'https://api.bookmarkai.com/v1';

        // Initialize the client
        const bookmarkClient = new BookmarkAIClient({
          baseUrl: apiUrl,
          adapter: {
            network: networkAdapter,
            storage: storageAdapter,
            crypto: {
              // Basic crypto adapter - in production, use a proper crypto library
              encrypt: async (data: string) => Buffer.from(data).toString('base64'),
              decrypt: async (data: string) => Buffer.from(data, 'base64').toString('utf8'),
              generateKey: async () => Math.random().toString(36).substring(2),
            },
          },
          environment: __DEV__ ? 'development' : 'production',
          onTokenRefresh: (tokens) => {
            console.log('Tokens refreshed in React Native app');
          },
        });

        // Enable dev mode with ngrok polling in development
        if (__DEV__) {
          bookmarkClient.enableDevMode({
            configUrl: '/.well-known/dev-config.json',
            pollInterval: 5000, // Check every 5 seconds
          });

          // Add debug interceptors in development
          bookmarkClient.addRequestInterceptor({
            onRequest: (config) => {
              console.log(`[SDK Request] ${config.method} ${config.url}`);
              return config;
            },
          });

          bookmarkClient.addResponseInterceptor({
            onResponse: (response) => {
              console.log(`[SDK Response] ${response.status} ${response.statusText}`);
              return response;
            },
            onResponseError: (error) => {
              console.error('[SDK Error]', error);
              throw error;
            },
          });
        }

        // Initialize sync service
        const sync = SyncService.getInstance(bookmarkClient);

        // Start health monitoring
        bookmarkClient.health.startAutoHealthCheck();

        setClient(bookmarkClient);
        setSyncService(sync);
        setIsInitialized(true);
      } catch (err) {
        console.error('Failed to initialize SDK:', err);
        setError(err as Error);
        setIsInitialized(true);
      }
    }

    initializeSDK();

    // Cleanup on unmount
    return () => {
      if (client) {
        client.destroy();
      }
      if (syncService) {
        syncService.destroy();
      }
    };
  }, []);

  return (
    <SDKContext.Provider value={{ client, syncService, isInitialized, error }}>
      {children}
    </SDKContext.Provider>
  );
}

export function useSDK() {
  const context = useContext(SDKContext);
  if (!context) {
    throw new Error('useSDK must be used within SDKProvider');
  }
  return context;
}

// Helper hooks for specific SDK features
export function useBookmarkClient() {
  const { client, isInitialized, error } = useSDK();
  
  if (!isInitialized) {
    throw new Error('SDK not initialized yet');
  }
  
  if (error) {
    throw error;
  }
  
  if (!client) {
    throw new Error('SDK client not available');
  }
  
  return client;
}

export function useSyncService() {
  const { syncService, isInitialized, error } = useSDK();
  
  if (!isInitialized) {
    throw new Error('SDK not initialized yet');
  }
  
  if (error) {
    throw error;
  }
  
  if (!syncService) {
    throw new Error('Sync service not available');
  }
  
  return syncService;
}