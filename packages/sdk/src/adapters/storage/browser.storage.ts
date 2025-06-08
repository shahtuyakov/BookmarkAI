import { StorageAdapter } from '../types';

/**
 * Browser storage adapter using localStorage or sessionStorage
 */
export class BrowserStorageAdapter implements StorageAdapter {
  constructor(
    private storage: Storage = typeof window !== 'undefined' 
      ? window.localStorage 
      : ({} as Storage)
  ) {}

  async getItem(key: string): Promise<string | null> {
    try {
      return this.storage.getItem(key);
    } catch (error) {
      // Handle storage quota exceeded or security errors
      console.error('Storage getItem error:', error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      this.storage.setItem(key, value);
    } catch (error) {
      // Handle storage quota exceeded
      console.error('Storage setItem error:', error);
      throw new Error('Failed to save to storage');
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      this.storage.removeItem(key);
    } catch (error) {
      console.error('Storage removeItem error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      this.storage.clear();
    } catch (error) {
      console.error('Storage clear error:', error);
    }
  }
}