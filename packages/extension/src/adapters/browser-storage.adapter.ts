import { StorageAdapter } from '@bookmarkai/sdk';
import browser from 'webextension-polyfill';

/**
 * Browser extension storage adapter that implements the SDK StorageAdapter interface
 * Uses browser.storage.local for persistent storage across extension components
 */
export class BrowserExtensionStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(prefix: string = 'bookmarkai_') {
    this.prefix = prefix;
  }

  /**
   * Get item from browser storage
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const fullKey = this.prefix + key;
      const result = await browser.storage.local.get(fullKey);
      
      if (result[fullKey] === undefined) {
        return null;
      }

      // If the value is already a string, return it
      if (typeof result[fullKey] === 'string') {
        return result[fullKey];
      }

      // Otherwise, stringify it
      return JSON.stringify(result[fullKey]);
    } catch (error) {
      console.error('BrowserExtensionStorageAdapter: Error getting item', error);
      return null;
    }
  }

  /**
   * Set item in browser storage
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      
      // Try to parse the value to store it as structured data if possible
      let valueToStore: any = value;
      try {
        valueToStore = JSON.parse(value);
      } catch {
        // If parsing fails, store as string
        valueToStore = value;
      }

      await browser.storage.local.set({ [fullKey]: valueToStore });
    } catch (error) {
      console.error('BrowserExtensionStorageAdapter: Error setting item', error);
      throw error;
    }
  }

  /**
   * Remove item from browser storage
   */
  async removeItem(key: string): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      await browser.storage.local.remove(fullKey);
    } catch (error) {
      console.error('BrowserExtensionStorageAdapter: Error removing item', error);
      throw error;
    }
  }

  /**
   * Clear all items with the configured prefix
   */
  async clear(): Promise<void> {
    try {
      // Get all storage keys
      const allItems = await browser.storage.local.get();
      
      // Filter keys that start with our prefix
      const keysToRemove = Object.keys(allItems).filter(key => key.startsWith(this.prefix));
      
      // Remove all matching keys
      if (keysToRemove.length > 0) {
        await browser.storage.local.remove(keysToRemove);
      }
    } catch (error) {
      console.error('BrowserExtensionStorageAdapter: Error clearing storage', error);
      throw error;
    }
  }

  /**
   * Get all items with the configured prefix (utility method)
   */
  async getAllItems(): Promise<Record<string, any>> {
    try {
      const allItems = await browser.storage.local.get();
      const prefixedItems: Record<string, any> = {};
      
      // Filter and strip prefix from keys
      Object.entries(allItems).forEach(([key, value]) => {
        if (key.startsWith(this.prefix)) {
          const cleanKey = key.slice(this.prefix.length);
          prefixedItems[cleanKey] = value;
        }
      });
      
      return prefixedItems;
    } catch (error) {
      console.error('BrowserExtensionStorageAdapter: Error getting all items', error);
      return {};
    }
  }

  /**
   * Check if storage is available (utility method)
   */
  async isAvailable(): Promise<boolean> {
    try {
      await browser.storage.local.set({ '__test__': 'test' });
      await browser.storage.local.remove('__test__');
      return true;
    } catch {
      return false;
    }
  }
}