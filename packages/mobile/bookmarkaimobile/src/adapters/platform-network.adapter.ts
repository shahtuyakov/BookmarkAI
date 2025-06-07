import { Platform } from 'react-native';
import { NetworkAdapter, ReactNativeNetworkAdapter } from '@bookmarkai/sdk';
import { IOSURLSessionAdapter } from './ios-urlsession.adapter';

/**
 * Platform-specific network adapter that automatically selects
 * the best implementation based on the current platform
 */
export class PlatformNetworkAdapter implements NetworkAdapter {
  private adapter: NetworkAdapter;

  constructor() {
    if (Platform.OS === 'ios') {
      try {
        const urlSessionAdapter = new IOSURLSessionAdapter();
        this.adapter = urlSessionAdapter;
      } catch (error) {
        console.warn('iOS URLSession adapter initialization failed, falling back to React Native fetch adapter:', error);
        this.adapter = new ReactNativeNetworkAdapter();
      }
    } else {
      this.adapter = new ReactNativeNetworkAdapter();
    }
  }

  async request<T = any>(config: any): Promise<any> {
    return this.adapter.request<T>(config);
  }

  /**
   * Get the current adapter being used
   */
  getAdapterType(): string {
    if (this.adapter instanceof ReactNativeNetworkAdapter) {
      return 'react-native-fetch';
    } else if (this.adapter instanceof IOSURLSessionAdapter) {
      return 'ios-urlsession';
    }
    return 'unknown';
  }

  /**
   * Test the adapter with a simple request
   */
  async testAdapter(): Promise<{ type: string; success: boolean; error?: string }> {
    try {
      const testUrl = 'https://httpbin.org/get';
      
      await this.adapter.request({
        url: testUrl,
        method: 'GET',
        timeout: 10000,
      });
      
      return {
        type: this.getAdapterType(),
        success: true,
      };
    } catch (error: any) {
      return {
        type: this.getAdapterType(),
        success: false,
        error: error.message,
      };
    }
  }
}