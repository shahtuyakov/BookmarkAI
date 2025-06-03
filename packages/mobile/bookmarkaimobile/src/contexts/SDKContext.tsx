import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { BookmarkAIClient, ReactNativeStorageAdapter } from '@bookmarkai/sdk';
import { MMKV } from 'react-native-mmkv';
import { SyncService } from '../services/SyncService';
import Config from 'react-native-config';
import { PlatformNetworkAdapter } from '../adapters';
import { keychainWrapper } from '../utils/keychain-wrapper';

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
        console.log('⚠️ SDK client not ready, cannot sync tokens');
        return;
      }

      console.log('🔄 Syncing auth tokens to SDK...');
      
      // Store tokens using the SDK's storage adapter format
      const tokenData = {
        accessToken,
        refreshToken: refreshToken || '',
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours from now
      };
      
      console.log('📝 Storing tokens with key "tokens":', {
        hasAccessToken: !!tokenData.accessToken,
        accessTokenLength: tokenData.accessToken.length
      });
      
      await storageAdapter.setItem('tokens', JSON.stringify(tokenData));

      console.log('✅ Auth tokens synced to SDK storage');
      
      // Verify SDK is now authenticated
      const isAuthenticated = await client.isAuthenticated();
      console.log(`🔐 SDK authentication status after sync: ${isAuthenticated}`);
      
    } catch (syncError) {
      console.error('❌ Failed to sync auth tokens to SDK:', syncError);
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
            onRequest: (config: any) => {
              console.log(`[SDK Request] ${config.method} ${config.url}`);
              console.log(`[SDK Request Headers]`, config.headers);
              return config;
            },
          });

          bookmarkClient.addResponseInterceptor({
            onResponse: (response: any) => {
              console.log(`[SDK Response] ${response.status} ${response.statusText}`);
              return response;
            },
            onResponseError: (error: any) => {
              console.error('[SDK Error]', error);
              throw error;
            },
          });
        }

        // Check SDK authentication status and manually sync tokens if needed
        try {
          console.log('🔐 Checking SDK authentication status...');
          const isAuthenticated = await bookmarkClient.isAuthenticated();
          console.log(`🔐 SDK authentication status: ${isAuthenticated}`);
          
          if (!isAuthenticated) {
            console.log('⚠️ SDK not authenticated - attempting manual token sync...');
            
            // Try to get tokens from AuthContext keychain and sync them to SDK
            try {
              const authCredentials = await keychainWrapper.getInternetCredentials('com.bookmarkai.app');
              if (authCredentials) {
                console.log('🔄 Found AuthContext tokens, syncing to SDK...');
                const tokenData = JSON.parse(authCredentials.password);
                
                // Manually store tokens in SDK storage
                const sdkTokenData = {
                  accessToken: tokenData.accessToken,
                  refreshToken: tokenData.refreshToken || '',
                  expiresAt: Date.now() + (24 * 60 * 60 * 1000)
                };
                
                await storageAdapter.setItem('tokens', JSON.stringify(sdkTokenData));
                console.log('✅ Manually synced tokens to SDK storage');
                
                // Check authentication again
                const newAuthStatus = await bookmarkClient.isAuthenticated();
                console.log(`🔐 SDK authentication after manual sync: ${newAuthStatus}`);
                
                // Verify what's actually stored
                const storedTokens = await storageAdapter.getItem('tokens');
                console.log(`🔍 Verified SDK storage:`, {
                  hasTokens: !!storedTokens,
                  tokenLength: storedTokens?.length || 0
                });
              } else {
                console.log('⚠️ No AuthContext tokens found to sync');
              }
            } catch (syncError) {
              console.error('❌ Manual token sync failed:', syncError);
            }
          }
        } catch (authError) {
          console.log('ℹ️ Could not check SDK auth status:', authError);
        }

        // Initialize sync service
        const sync = SyncService.getInstance(bookmarkClient);

        // Health monitoring is automatically started by the SDK

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