import { StorageAdapter } from '../types';

interface KeychainModule {
  setInternetCredentials(
    server: string,
    username: string,
    password: string
  ): Promise<boolean>;
  
  getInternetCredentials(
    server: string
  ): Promise<{ username: string; password: string } | false>;
  
  resetInternetCredentials(server: string): Promise<boolean>;
  
  // Add generic password methods for share extension compatibility
  setGenericPassword(
    username: string,
    password: string,
    options?: any
  ): Promise<boolean>;
  
  getGenericPassword(
    options?: any
  ): Promise<{ username: string; password: string } | false>;
  
  resetGenericPassword(
    options?: any
  ): Promise<boolean>;
}

interface MMKVModule {
  set(key: string, value: string): void;
  getString(key: string): string | undefined;
  delete(key: string): void;
  clearAll(): void;
}

/**
 * React Native storage adapter using react-native-keychain for secure storage
 * and MMKV for general storage
 */
export class ReactNativeStorageAdapter implements StorageAdapter {
  private keychain?: KeychainModule;
  private mmkv?: MMKVModule;
  private server = 'com.bookmarkai.app';
  private keychainWriteQueue: Promise<void> = Promise.resolve();
  
  // Keys that should be stored securely
  private secureKeys = new Set([
    'bookmarkai_access_token',
    'bookmarkai_refresh_token',
  ]);
  
  // Share extension compatibility - stores tokens in format expected by iOS share extension
  private async syncTokensForShareExtension(accessToken?: string, refreshToken?: string): Promise<void> {
    if (!this.keychain || !accessToken || !refreshToken) {
      return;
    }
    
    try {
      // Format compatible with iOS share extension (direct API format)
      const shareExtensionTokens = {
        accessToken,
        refreshToken,
        expiresAt: Date.now() + (15 * 60 * 1000) // 15 minutes default
      };
      
      const options = {
        service: 'com.bookmarkai.auth'
      };
      
      console.log('🔄 [RN Storage] Syncing tokens for share extension compatibility');
      
      // Store in format expected by iOS share extension
      await this.keychain.setGenericPassword(
        'auth_tokens',
        JSON.stringify(shareExtensionTokens),
        options
      );
      
      console.log('✅ [RN Storage] Share extension tokens synced');
    } catch (error) {
      console.error('❌ [RN Storage] Failed to sync tokens for share extension:', error);
    }
  }

  constructor(options: {
    keychain?: KeychainModule;
    mmkv?: MMKVModule;
  } = {}) {
    this.keychain = options.keychain;
    this.mmkv = options.mmkv;
  }

  async getItem(key: string): Promise<string | null> {
    console.log(`📖 [RN Storage] Getting item: ${key}, isSecure: ${this.secureKeys.has(key)}`);
    if (this.secureKeys.has(key) && this.keychain) {
      try {
        const credentials = await this.keychain.getInternetCredentials(this.server);
        if (credentials && credentials.password) {
          // Parse the stored JSON to get the specific key
          const data = JSON.parse(credentials.password);
          console.log(`🔐 [RN Storage] Keychain data keys:`, Object.keys(data));
          const value = data[key] || null;
          console.log(`✅ [RN Storage] Retrieved ${key} from keychain:`, value ? 'exists' : 'not found');
          return value;
        }
        console.log(`❌ [RN Storage] No credentials found in keychain for ${key}`);
      } catch (error) {
        console.error(`❌ [RN Storage] Error getting ${key} from keychain:`, error);
      }
      return null;
    }

    // Use MMKV for non-secure storage
    if (this.mmkv) {
      const value = this.mmkv.getString(key) || null;
      console.log(`✅ [RN Storage] Retrieved ${key} from MMKV:`, value ? 'exists' : 'not found');
      return value;
    }

    console.warn(`⚠️ [RN Storage] No storage available for ${key}`);
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    console.log(`💾 [RN Storage] Setting item: ${key}, isSecure: ${this.secureKeys.has(key)}`);
    if (this.secureKeys.has(key) && this.keychain) {
      // Queue keychain writes to prevent race conditions
      this.keychainWriteQueue = this.keychainWriteQueue.then(async () => {
        try {
          // Get existing secure data
          const credentials = await this.keychain!.getInternetCredentials(this.server);
          let data: Record<string, string> = {};
          
          if (credentials && credentials.password) {
            try {
              data = JSON.parse(credentials.password);
            } catch {
              // Ignore parse errors, start fresh
            }
          }

          // Update the specific key
          data[key] = value;
          console.log(`🔐 [RN Storage] Keychain data before save:`, Object.keys(data));

          // Store back to keychain
          await this.keychain!.setInternetCredentials(
            this.server,
            'bookmarkai_user',
            JSON.stringify(data)
          );
          console.log(`✅ [RN Storage] Stored ${key} in keychain, total keys:`, Object.keys(data));
          
          // Check if we now have both tokens and sync for share extension
          if (data['bookmarkai_access_token'] && data['bookmarkai_refresh_token']) {
            await this.syncTokensForShareExtension(
              data['bookmarkai_access_token'],
              data['bookmarkai_refresh_token']
            );
          }
        } catch (error) {
          console.error(`❌ [RN Storage] Failed to store ${key} in keychain:`, error);
          throw new Error('Failed to save secure data');
        }
      });
      
      return this.keychainWriteQueue;
    }

    // Use MMKV for non-secure storage
    if (this.mmkv) {
      this.mmkv.set(key, value);
      console.log(`✅ [RN Storage] Stored ${key} in MMKV`);
      return;
    }

    console.warn(`⚠️ [RN Storage] No storage available for ${key}`);
  }

  async removeItem(key: string): Promise<void> {
    if (this.secureKeys.has(key) && this.keychain) {
      try {
        // Get existing secure data
        const credentials = await this.keychain.getInternetCredentials(this.server);
        if (credentials && credentials.password) {
          const data = JSON.parse(credentials.password);
          delete data[key];
          
          // If no more secure data, reset credentials
          if (Object.keys(data).length === 0) {
            await this.keychain.resetInternetCredentials(this.server);
          } else {
            // Store back without the removed key
            await this.keychain.setInternetCredentials(
              this.server,
              'bookmarkai_user',
              JSON.stringify(data)
            );
          }
        }
      } catch (error) {
        // Silently handle errors
      }
      return;
    }

    // Use MMKV for non-secure storage
    if (this.mmkv) {
      this.mmkv.delete(key);
      return;
    }
  }

  async clear(): Promise<void> {
    // Clear secure storage
    if (this.keychain) {
      try {
        await this.keychain.resetInternetCredentials(this.server);
      } catch (error) {
        // Silently handle errors
      }
    }

    // Clear MMKV storage
    if (this.mmkv) {
      this.mmkv.clearAll();
    }
  }
}