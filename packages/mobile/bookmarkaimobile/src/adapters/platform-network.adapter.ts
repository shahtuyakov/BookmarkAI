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
    // Temporarily use React Native adapter for all platforms
    // until we resolve the iOS URLSession adapter issues
    console.log(`🌐 Using React Native network adapter for ${Platform.OS}`);
    this.adapter = new ReactNativeNetworkAdapter();
    
    // TODO: Re-enable iOS URLSession adapter once issues are resolved
    // if (Platform.OS === 'ios') {
    //   try {
    //     const urlSessionAdapter = new IOSURLSessionAdapter();
    //     this.adapter = urlSessionAdapter;
    //   } catch (error) {
    //     console.log('❌ iOS URLSession adapter failed, falling back to React Native adapter:', error);
    //     this.adapter = new ReactNativeNetworkAdapter();
    //   }
    // } else {
    //   this.adapter = new ReactNativeNetworkAdapter();
    // }
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
}