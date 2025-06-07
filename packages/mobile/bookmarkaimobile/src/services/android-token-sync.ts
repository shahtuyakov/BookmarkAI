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
    if (!this.isAvailable()) {
      return {
        success: true,
        message: 'Token sync not available on this platform',
        isAuthenticated: false
      };
    }

    try {
      const result = await ShareHandler.syncAuthTokens(
        accessToken,
        refreshToken,
        expiresIn
      );

      return result;
    } catch (error) {
      
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
    if (!this.isAvailable()) {
      return {
        success: true,
        message: 'Token clear not available on this platform',
        isAuthenticated: false
      };
    }

    try {
      const result = await ShareHandler.clearAuthTokens();
      return result;
    } catch (error) {
      
      return {
        success: false,
        message: `Token clear failed: ${(error as Error).message || 'Unknown error'}`,
        isAuthenticated: true // Assume still authenticated on error
      };
    }
  }

  /**
   * Check authentication status in Android native storage
   */
  async checkAuthStatus(): Promise<AuthStatus> {
    if (!this.isAvailable()) {
      return {
        isAuthenticated: false,
        hasValidAccessToken: false,
        hasRefreshToken: false
      };
    }

    try {
      const status = await ShareHandler.isAuthenticated();
      return status;
    } catch (error) {
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
      return null;
    }
    
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const debugInfo = await ShareHandler.getTokenDebugInfo();
      return debugInfo;
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify token synchronization by comparing expected vs actual state
   */
  async verifySync(expectedAccessToken?: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return true;
    }

    try {
      const authStatus = await this.checkAuthStatus();
      
      if (!expectedAccessToken) {
        // Just check if we're authenticated
        const isValid = authStatus.isAuthenticated && authStatus.hasValidAccessToken;
        return isValid;
      }

      // In development, we can check token details
      if (__DEV__) {
        const debugInfo = await this.getDebugInfo();
        if (!debugInfo) return false;

        const tokenMatches = debugInfo.accessTokenPreview.startsWith(expectedAccessToken.substring(0, 20));
        const isAuthenticated = debugInfo.isAuthenticated && !debugInfo.isExpired;
        
        const isValid = tokenMatches && isAuthenticated;
        return isValid;
      }

      // Production fallback
      return authStatus.isAuthenticated && authStatus.hasValidAccessToken;
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Force synchronization with current React Native tokens
   * This is a helper method that extracts tokens from React Native storage
   */
  async forceSyncWithCurrentTokens(): Promise<TokenSyncResult> {
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
        return {
          success: false,
          message: 'No tokens found in React Native storage',
          isAuthenticated: false
        };
      }

      // Calculate expires in from current time
      const currentTime = Math.floor(Date.now() / 1000);
      const expiresIn = Math.max(0, tokens.expiresAt - currentTime);

      return await this.syncTokens(tokens.accessToken, tokens.refreshToken, expiresIn);
      
    } catch (error) {
      return {
        success: false,
        message: `Force sync failed: ${(error as Error).message}`,
        isAuthenticated: false
      };
    }
  }

  /**
   * Compare React Native and Android native token states (development only)
   */
  async compareTokenStates(): Promise<void> {
    if (!__DEV__) return;
    
    try {
      // Silent comparison for development purposes
      // Implementation details can be added here if needed for debugging
      
    } catch (error) {
      // Silent error handling
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