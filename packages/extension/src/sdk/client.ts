import { BookmarkAIClient } from '@bookmarkai/sdk';
import {
  BrowserExtensionStorageAdapter,
  BrowserExtensionNetworkAdapter,
  BrowserExtensionCryptoAdapter,
} from '../adapters';

/**
 * Create and configure the BookmarkAI SDK client for browser extension
 */
export function createExtensionClient(): BookmarkAIClient {
  // Get API base URL from environment or use default
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  const environment = import.meta.env.MODE as 'development' | 'staging' | 'production';

  // Create platform adapters
  const storageAdapter = new BrowserExtensionStorageAdapter('bookmarkai_');
  const networkAdapter = new BrowserExtensionNetworkAdapter(30000);
  const cryptoAdapter = new BrowserExtensionCryptoAdapter();

  // Create and configure the client
  const client = new BookmarkAIClient({
    baseUrl,
    environment,
    apiVersion: '1.0',
    adapter: {
      network: networkAdapter,
      storage: storageAdapter,
      crypto: cryptoAdapter,
    },
    // Enable development features in dev mode
    ...(environment === 'development' && {
      retry: {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
      },
    }),
  });

  // Add extension-specific logging in development
  if (environment === 'development') {
    console.log('[BookmarkAI Extension] SDK client initialized with:', {
      baseUrl,
      environment,
      apiVersion: '1.0',
    });
  }

  return client;
}

// Create singleton instance
let clientInstance: BookmarkAIClient | null = null;

/**
 * Get the singleton SDK client instance
 */
export function getSDKClient(): BookmarkAIClient {
  if (!clientInstance) {
    clientInstance = createExtensionClient();
  }
  return clientInstance;
}

// Export convenience methods
export const sdkClient = getSDKClient();