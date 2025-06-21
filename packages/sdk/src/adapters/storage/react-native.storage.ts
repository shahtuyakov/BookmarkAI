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
  
  // Keys that should be stored securely
  private secureKeys = new Set([
    'bookmarkai_access_token',
    'bookmarkai_refresh_token',
  ]);

  constructor(options: {
    keychain?: KeychainModule;
    mmkv?: MMKVModule;
  } = {}) {
    this.keychain = options.keychain;
    this.mmkv = options.mmkv;
  }

  async getItem(key: string): Promise<string | null> {
    if (this.secureKeys.has(key) && this.keychain) {
      try {
        const credentials = await this.keychain.getInternetCredentials(this.server);
        if (credentials && credentials.password) {
          // Parse the stored JSON to get the specific key
          const data = JSON.parse(credentials.password);
          return data[key] || null;
        }
      } catch (error) {
        // Silently handle errors
      }
      return null;
    }

    // Use MMKV for non-secure storage
    if (this.mmkv) {
      return this.mmkv.getString(key) || null;
    }

    // Fallback: no storage available
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.secureKeys.has(key) && this.keychain) {
      try {
        // Get existing secure data
        const credentials = await this.keychain.getInternetCredentials(this.server);
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

        // Store back to keychain
        await this.keychain.setInternetCredentials(
          this.server,
          'bookmarkai_user',
          JSON.stringify(data)
        );
        return;
      } catch (error) {
        throw new Error('Failed to save secure data');
      }
    }

    // Use MMKV for non-secure storage
    if (this.mmkv) {
      this.mmkv.set(key, value);
      return;
    }

    // Fallback: no storage available
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