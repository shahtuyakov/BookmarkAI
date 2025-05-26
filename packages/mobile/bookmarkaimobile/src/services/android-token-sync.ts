import { NativeModules, Platform } from 'react-native';

const { ShareHandler } = NativeModules;

interface TokenSyncResult {
  success: boolean;
  message: string;
  isAuthenticated: boolean;
}

interface AuthStatus {
  isAuthenticated: boolean;
  hasValidAccessToken: boolean;
  hasRefreshToken: boolean;
}

interface TokenDebugInfo {
  hasTokens: boolean;
  isAuthenticated: boolean;
  hasValidAccessToken: boolean;
  hasRefreshToken: boolean;
  accessTokenPreview: string;
  refreshTokenPreview: string;
  expiresAt: number;
  currentTime: number;
  isExpired: boolean;
  timeUntilExpiry: number;
}

/**
 * Service for synchronizing authentication tokens between React Native and Android native storage.
 * All methods are Android-only and will safely no-op on iOS.
 */
class AndroidTokenSyncService {
  
  /**
   * Check if token sync is available on this platform
   */
  isAvailable(): boolean {
    return Platform.OS === 'android' && !!ShareHandler?.syncAuthTokens;
  }

  /**
   * Sync authentication tokens from React Native to Android native storage
   */
  async syncTokens(
    accessToken: string, 
    refreshToken: string, 
    expiresIn: number
  ): Promise<TokenSyncResult> {
    console.log('🔄 AndroidTokenSync: Starting token sync...');
    
    if (!this.isAvailable()) {
      console.log('ℹ️ AndroidTokenSync: Not available on this platform, skipping');
      return {
        success: true,
        message: 'Token sync not available on this platform',
        isAuthenticated: false
      };
    }

    try {
      console.log('📱 AndroidTokenSync: Syncing tokens to Android native storage');
      console.log(`   Access token length: ${accessToken.length}`);
      console.log(`   Refresh token length: ${refreshToken.length}`);
      console.log(`   Expires in: ${expiresIn} seconds`);

      const result = await ShareHandler.syncAuthTokens(
        accessToken,
        refreshToken,
        expiresIn
      );

      console.log('✅ AndroidTokenSync: Sync completed successfully');
      console.log('   Result:', result);

      return result;
    } catch (error) {
      console.error('❌ AndroidTokenSync: Failed to sync tokens', error);
      
      return {
        success: false,
        message: `Token sync failed: ${error.message || 'Unknown error'}`,
        isAuthenticated: false
      };
    }
  }

  /**
   * Clear authentication tokens from Android native storage
   */
  async clearTokens(): Promise<TokenSyncResult> {
    console.log('🧹 AndroidTokenSync: Clearing tokens...');
    
    if (!this.isAvailable()) {
      console.log('ℹ️ AndroidTokenSync: Not available on this platform, skipping');
      return {
        success: true,
        message: 'Token clear not available on this platform',
        isAuthenticated: false
      };
    }

    try {
      console.log('📱 AndroidTokenSync: Clearing tokens from Android native storage');

      const result = await ShareHandler.clearAuthTokens();

      console.log('✅ AndroidTokenSync: Clear completed successfully');
      console.log('   Result:', result);

      return result;
    } catch (error) {
      console.error('❌ AndroidTokenSync: Failed to clear tokens', error);
      
      return {
        success: false,
        message: `Token clear failed: ${error.message || 'Unknown error'}`,
        isAuthenticated: true // Assume still authenticated on error
      };
    }
  }

  /**
   * Check authentication status in Android native storage
   */
  async checkAuthStatus(): Promise<AuthStatus> {
    console.log('🔍 AndroidTokenSync: Checking auth status...');
    
    if (!this.isAvailable()) {
      console.log('ℹ️ AndroidTokenSync: Not available on this platform');
      return {
        isAuthenticated: false,
        hasValidAccessToken: false,
        hasRefreshToken: false
      };
    }

    try {
      const status = await ShareHandler.isAuthenticated();
      
      console.log('✅ AndroidTokenSync: Auth status check completed');
      console.log('   Status:', status);

      return status;
    } catch (error) {
      console.error('❌ AndroidTokenSync: Failed to check auth status', error);
      
      return {
        isAuthenticated: false,
        hasValidAccessToken: false,
        hasRefreshToken: false
      };
    }
  }

  /**
   * Get detailed token debug information (development only)
   */
  async getDebugInfo(): Promise<TokenDebugInfo | null> {
    if (!__DEV__) {
      console.log('ℹ️ AndroidTokenSync: Debug info only available in development');
      return null;
    }
    
    console.log('🔧 AndroidTokenSync: Getting debug info...');
    
    if (!this.isAvailable()) {
      console.log('ℹ️ AndroidTokenSync: Not available on this platform');
      return null;
    }

    try {
      const debugInfo = await ShareHandler.getTokenDebugInfo();
      
      console.log('✅ AndroidTokenSync: Debug info retrieved');
      console.log('   Debug info:', debugInfo);

      return debugInfo;
    } catch (error) {
      console.error('❌ AndroidTokenSync: Failed to get debug info', error);
      return null;
    }
  }

  /**
   * Verify token synchronization by comparing expected vs actual state
   */
  async verifySync(expectedAccessToken?: string): Promise<boolean> {
    console.log('🔬 AndroidTokenSync: Verifying token sync...');
    
    if (!this.isAvailable()) {
      console.log('ℹ️ AndroidTokenSync: Platform not supported, assuming sync is correct');
      return true;
    }

    try {
      const authStatus = await this.checkAuthStatus();
      
      if (!expectedAccessToken) {
        // Just check if we're authenticated
        const isValid = authStatus.isAuthenticated && authStatus.hasValidAccessToken;
        console.log(`🔬 AndroidTokenSync: Basic verification - Authenticated: ${isValid}`);
        return isValid;
      }

      // In development, we can check token details
      if (__DEV__) {
        const debugInfo = await this.getDebugInfo();
        if (!debugInfo) return false;

        const tokenMatches = debugInfo.accessTokenPreview.startsWith(expectedAccessToken.substring(0, 20));
        const isAuthenticated = debugInfo.isAuthenticated && !debugInfo.isExpired;
        
        const isValid = tokenMatches && isAuthenticated;
        console.log(`🔬 AndroidTokenSync: Detailed verification - Token matches: ${tokenMatches}, Authenticated: ${isAuthenticated}, Valid: ${isValid}`);
        return isValid;
      }

      // Production fallback
      return authStatus.isAuthenticated && authStatus.hasValidAccessToken;
      
    } catch (error) {
      console.error('❌ AndroidTokenSync: Verification failed', error);
      return false;
    }
  }

  /**
   * Force synchronization with current React Native tokens
   * This is a helper method that extracts tokens from React Native storage
   */
  async forceSyncWithCurrentTokens(): Promise<TokenSyncResult> {
    console.log('🔄 AndroidTokenSync: Force syncing with current RN tokens...');
    
    if (!this.isAvailable()) {
      return {
        success: true,
        message: 'Force sync not available on this platform',
        isAuthenticated: false
      };
    }

    try {
      // Import React Native token utilities
      const { getTokens } = await import('./api/client');
      
      const tokens = await getTokens();
      if (!tokens) {
        console.log('❌ AndroidTokenSync: No tokens found in React Native storage');
        return {
          success: false,
          message: 'No tokens found in React Native storage',
          isAuthenticated: false
        };
      }

      // Calculate expires in from current time
      const currentTime = Math.floor(Date.now() / 1000);
      const expiresIn = Math.max(0, tokens.expiresAt - currentTime);

      console.log(`🔄 AndroidTokenSync: Found RN tokens, expires in ${expiresIn} seconds`);

      return await this.syncTokens(tokens.accessToken, tokens.refreshToken, expiresIn);
      
    } catch (error) {
      console.error('❌ AndroidTokenSync: Force sync failed', error);
      return {
        success: false,
        message: `Force sync failed: ${error.message}`,
        isAuthenticated: false
      };
    }
  }

  /**
   * Compare React Native and Android native token states (development only)
   */
  async compareTokenStates(): Promise<void> {
    if (!__DEV__) return;
    
    console.log('🔍 AndroidTokenSync: Comparing token states between RN and Android...');
    
    try {
      // Get React Native tokens
      const { getTokens } = await import('./api/client');
      const rnTokens = await getTokens();
      
      // Get Android native token status
      const androidStatus = await this.checkAuthStatus();
      const androidDebug = await this.getDebugInfo();
      
      console.log('📊 AndroidTokenSync: Token State Comparison');
      console.log('   React Native:');
      console.log(`     Has tokens: ${!!rnTokens}`);
      console.log(`     Access token: ${rnTokens?.accessToken.substring(0, 20) || 'none'}...`);
      console.log(`     Refresh token: ${rnTokens?.refreshToken.substring(0, 20) || 'none'}...`);
      console.log(`     Expires at: ${rnTokens?.expiresAt || 'none'}`);
      
      console.log('   Android Native:');
      console.log(`     Is authenticated: ${androidStatus.isAuthenticated}`);
      console.log(`     Has valid access token: ${androidStatus.hasValidAccessToken}`);
      console.log(`     Has refresh token: ${androidStatus.hasRefreshToken}`);
      
      if (androidDebug) {
        console.log(`     Access token: ${androidDebug.accessTokenPreview}`);
        console.log(`     Refresh token: ${androidDebug.refreshTokenPreview}`);
        console.log(`     Expires at: ${androidDebug.expiresAt}`);
        console.log(`     Is expired: ${androidDebug.isExpired}`);
      }
      
      // Determine sync status
      const rnHasTokens = !!rnTokens;
      const androidHasTokens = androidStatus.isAuthenticated;
      
      if (rnHasTokens && androidHasTokens) {
        console.log('✅ AndroidTokenSync: Both storages have tokens');
      } else if (rnHasTokens && !androidHasTokens) {
        console.log('⚠️ AndroidTokenSync: RN has tokens but Android does not - SYNC NEEDED');
      } else if (!rnHasTokens && androidHasTokens) {
        console.log('⚠️ AndroidTokenSync: Android has tokens but RN does not - INCONSISTENT STATE');
      } else {
        console.log('ℹ️ AndroidTokenSync: Neither storage has tokens - OK');
      }
      
    } catch (error) {
      console.error('❌ AndroidTokenSync: Failed to compare token states', error);
    }
  }
}

// Export singleton instance
export const androidTokenSync = new AndroidTokenSyncService();

// Export types for use elsewhere
export type { TokenSyncResult, AuthStatus, TokenDebugInfo };

// Development utility exports
export const AndroidTokenSyncDebug = __DEV__ ? {
  compareStates: () => androidTokenSync.compareTokenStates(),
  getDebugInfo: () => androidTokenSync.getDebugInfo(),
  forceSync: () => androidTokenSync.forceSyncWithCurrentTokens(),
  clearTokens: () => androidTokenSync.clearTokens(),
  checkStatus: () => androidTokenSync.checkAuthStatus(),
} : null;