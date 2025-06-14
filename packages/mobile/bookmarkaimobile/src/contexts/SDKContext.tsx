import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { BookmarkAIClient, ReactNativeStorageAdapter } from '@bookmarkai/sdk';
import { MMKV } from 'react-native-mmkv';
import { SyncService } from '../services/SyncService';
import { PlatformNetworkAdapter } from '../adapters';
import { keychainWrapper } from '../utils/keychain-wrapper';
import { enhancedTokenSync } from '../services/enhanced-token-sync';

interface SDKContextValue {
  client: BookmarkAIClient | null;
  syncService: SyncService | null;
  isInitialized: boolean;
  error: Error | null;
  syncAuthTokens: (accessToken: string, refreshToken?: string) => Promise<void>;
}

const SDKContext = createContext<SDKContextValue>({
  client: null,
  syncService: null,
  isInitialized: false,
  error: null,
  syncAuthTokens: async () => {},
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

  // Create storage adapter that will be shared between initialization and token sync
  const [storageAdapter] = useState(() => new ReactNativeStorageAdapter({
    keychain: keychainWrapper,
    mmkv: mmkv,
  }));

  // Function to sync auth tokens from AuthContext to SDK
  const syncAuthTokens = async (accessToken: string, refreshToken?: string) => {
    try {
      if (!client) {
        return;
      }


      // Store tokens using the SDK's expected key format
      const expiresIn = 15 * 60; // 15 minutes in seconds
      const accessTokenExpiry = Date.now() + (expiresIn * 1000);
      const refreshTokenExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days


      // Store tokens sequentially to avoid race conditions in ReactNativeStorageAdapter
      await storageAdapter.setItem('bookmarkai_access_token', accessToken);
      await storageAdapter.setItem('bookmarkai_refresh_token', refreshToken || '');
      await storageAdapter.setItem('bookmarkai_token_expiry', JSON.stringify({
        accessTokenExpiry,
        refreshTokenExpiry,
      }));

      // Verify SDK is now authenticated
      await client.isAuthenticated();

    } catch (syncError) {
      // Silent error handling
    }
  };

  useEffect(() => {
    async function initializeSDK() {
      try {
        // Use the shared storage adapter

        // Create platform-specific network adapter
        // This will use URLSession on iOS and fetch on Android
        const networkAdapter = new PlatformNetworkAdapter();

        // Determine API URL based on environment
        // SDK needs the full API base URL since it only adds endpoint paths like /shares
        const apiUrl = __DEV__
          ? 'https://bookmarkai-dev.ngrok.io/api/v1'
          : 'https://api.bookmarkai.com/v1';

        // Initialize the client
        const bookmarkClient = new BookmarkAIClient({
          baseUrl: apiUrl,
          adapter: {
            network: networkAdapter,
            storage: storageAdapter,
            crypto: {
              // Basic crypto adapter - in production, use a proper crypto library
              encrypt: async (data: string) => {
                // Convert string to base64 in React Native compatible way
                const bytes = new TextEncoder().encode(data);
                const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
                return btoa(binaryString);
              },
              decrypt: async (data: string) => {
                // Convert base64 to string in React Native compatible way
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
          },
        });

        // Enable dev mode with ngrok polling in development
        if (__DEV__) {
          bookmarkClient.enableDevMode({
            configUrl: '/.well-known/dev-config.json',
            pollInterval: 5000, // Check every 5 seconds
          });

          // Add error interceptor for debugging
          bookmarkClient.addResponseInterceptor({
            onResponse: (response: any) => {
              return response;
            },
            onResponseError: (err: any) => {
              throw err;
            },
          });
        }

        // Check SDK authentication status and manually sync tokens if needed
        try {
          let isAuthenticated = false;
          try {
            isAuthenticated = await bookmarkClient.isAuthenticated();
          } catch (authCheckError) {
            isAuthenticated = false;
          }

          if (!isAuthenticated) {
            // Try to get tokens from AuthContext keychain and sync them to SDK
            try {
              const authCredentials = await keychainWrapper.getInternetCredentials('com.bookmarkai.app');
              if (authCredentials) {
                const tokenData = JSON.parse(authCredentials.password);

                // Manually store tokens in SDK format
                const expiresIn = 15 * 60; // 15 minutes in seconds
                const accessTokenExpiry = Date.now() + (expiresIn * 1000);
                const refreshTokenExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

                // Store tokens sequentially to avoid race conditions
                await storageAdapter.setItem('bookmarkai_access_token', tokenData.accessToken);
                await storageAdapter.setItem('bookmarkai_refresh_token', tokenData.refreshToken || '');
                await storageAdapter.setItem('bookmarkai_token_expiry', JSON.stringify({
                  accessTokenExpiry,
                  refreshTokenExpiry,
                }));
                // Check authentication again
                try {
                  await bookmarkClient.isAuthenticated();
                } catch (reAuthError) {
                  // Ignore reauth errors
                }
              }
            } catch (syncError) {
              // Silent error handling
            }
          }
        } catch (authError) {
          // Ignore auth check errors
        }

        // Initialize sync service
        const sync = SyncService.getInstance(bookmarkClient);

        // Health monitoring is automatically started by the SDK

        setClient(bookmarkClient);
        setSyncService(sync);

        // Start enhanced token synchronization
        if (enhancedTokenSync.isAvailable()) {
          enhancedTokenSync.startAutomaticSync();
        }

        setIsInitialized(true);
      } catch (err) {
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
      // Stop enhanced token sync
      enhancedTokenSync.stopAutomaticSync();
    };
  }, [client, storageAdapter, syncService]);

  return (
    <SDKContext.Provider value={{ client, syncService, isInitialized, error, syncAuthTokens }}>
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
