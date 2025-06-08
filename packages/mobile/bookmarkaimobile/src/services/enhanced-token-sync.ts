import { NativeModules, Platform, DeviceEventEmitter } from 'react-native';
import { androidTokenSync, TokenSyncResult } from './android-token-sync';

const { ShareHandler } = NativeModules;

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
}

/**
 * Enhanced automatic token synchronization service
 * Keeps React Native and Android native tokens perfectly synchronized
 */
class EnhancedTokenSyncService {
  private isMonitoring = false;
  private syncInterval?: NodeJS.Timeout;
  private lastSyncTime = 0;
  private retryCount = 0;
  private maxRetries = 3;

  /**
   * Start automatic token synchronization monitoring
   */
  startAutomaticSync(): void {
    if (!this.isAvailable() || this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;

    // Listen for token changes from the SDK/AuthContext
    this.setupTokenChangeListeners();

    // Periodic sync check (every 30 seconds)
    this.syncInterval = setInterval(() => {
      this.performPeriodicSync();
    }, 30000);

    // Initial sync
    this.performInitialSync();
  }

  /**
   * Stop automatic token synchronization
   */
  stopAutomaticSync(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }

    // Remove listeners
    DeviceEventEmitter.removeAllListeners('auth-tokens-updated');
    DeviceEventEmitter.removeAllListeners('auth-token-refresh');
  }

  /**
   * Check if enhanced sync is available
   */
  isAvailable(): boolean {
    return Platform.OS === 'android' && !!ShareHandler?.syncAuthTokens;
  }

  /**
   * Force immediate synchronization
   */
  async forceSyncNow(): Promise<TokenSyncResult> {

    if (!this.isAvailable()) {
      return {
        success: true,
        message: 'Enhanced sync not available on this platform',
        isAuthenticated: false
      };
    }

    try {
      // Get current React Native tokens
      const rnTokens = await this.getReactNativeTokens();
      
      if (!rnTokens) {
        return await androidTokenSync.clearTokens();
      }

      // Check if Android tokens are already in sync
      const needsSync = await this.checkIfSyncNeeded(rnTokens);
      
      if (!needsSync) {
        return {
          success: true,
          message: 'Tokens already synchronized',
          isAuthenticated: true
        };
      }

      // Perform the sync
      const result = await this.syncToAndroid(rnTokens);
      
      if (result.success) {
        this.lastSyncTime = Date.now();
        this.retryCount = 0;
      } else {
        this.retryCount++;
      }

      return result;

    } catch (error: any) {
      return {
        success: false,
        message: `Force sync failed: ${error.message}`,
        isAuthenticated: false
      };
    }
  }

  /**
   * Get comprehensive sync status
   */
  async getSyncStatus(): Promise<{
    isInSync: boolean;
    rnHasTokens: boolean;
    androidHasTokens: boolean;
    lastSyncTime: number;
    retryCount: number;
    recommendation: string;
  }> {
    try {
      const rnTokens = await this.getReactNativeTokens();
      const androidStatus = await androidTokenSync.checkAuthStatus();
      
      const rnHasTokens = !!rnTokens;
      const androidHasTokens = androidStatus.isAuthenticated;
      
      let isInSync = false;
      let recommendation = '';

      if (!rnHasTokens && !androidHasTokens) {
        isInSync = true;
        recommendation = 'Both storages are empty - sync not needed';
      } else if (rnHasTokens && androidHasTokens) {
        // Check if tokens match
        if (__DEV__) {
          const androidDebug = await androidTokenSync.getDebugInfo();
          if (androidDebug && rnTokens) {
            const accessMatch = androidDebug.accessTokenPreview.startsWith(rnTokens.accessToken.substring(0, 20));
            isInSync = accessMatch && !androidDebug.isExpired;
            recommendation = isInSync ? 'Tokens are synchronized' : 'Tokens exist but do not match - sync needed';
          } else {
            isInSync = true; // Assume sync if we can't verify
            recommendation = 'Both have tokens - assuming synchronized';
          }
        } else {
          isInSync = true; // Assume sync in production if both have tokens
          recommendation = 'Both have tokens - sync status unknown in production';
        }
      } else if (rnHasTokens && !androidHasTokens) {
        isInSync = false;
        recommendation = 'React Native has tokens but Android does not - sync needed';
      } else {
        isInSync = false;
        recommendation = 'Android has tokens but React Native does not - inconsistent state';
      }

      return {
        isInSync,
        rnHasTokens,
        androidHasTokens,
        lastSyncTime: this.lastSyncTime,
        retryCount: this.retryCount,
        recommendation
      };

    } catch (error) {
      return {
        isInSync: false,
        rnHasTokens: false,
        androidHasTokens: false,
        lastSyncTime: this.lastSyncTime,
        retryCount: this.retryCount,
        recommendation: 'Error checking sync status'
      };
    }
  }

  // Private methods

  private async getReactNativeTokens(): Promise<TokenData | null> {
    try {
      const { getTokens } = await import('./api/client');
      return await getTokens();
    } catch (error) {
      return null;
    }
  }

  private async checkIfSyncNeeded(rnTokens: TokenData): Promise<boolean> {
    try {
      const androidStatus = await androidTokenSync.checkAuthStatus();
      
      if (!androidStatus.isAuthenticated) {
        return true; // Android has no tokens, sync needed
      }

      // In development, we can do detailed comparison
      if (__DEV__) {
        const androidDebug = await androidTokenSync.getDebugInfo();
        if (androidDebug) {
          const accessMatch = androidDebug.accessTokenPreview.startsWith(rnTokens.accessToken.substring(0, 20));
          const notExpired = !androidDebug.isExpired;
          return !accessMatch || !notExpired;
        }
      }

      // In production, assume sync is needed if last sync was more than 5 minutes ago
      const timeSinceLastSync = Date.now() - this.lastSyncTime;
      return timeSinceLastSync > 5 * 60 * 1000; // 5 minutes

    } catch (error) {
      return true; // Assume sync needed on error
    }
  }

  private async syncToAndroid(rnTokens: TokenData): Promise<TokenSyncResult> {
    try {
      // Calculate expiresIn from expiresAt
      const currentTime = Math.floor(Date.now() / 1000);
      const expiresIn = Math.max(0, rnTokens.expiresAt - currentTime);


      return await androidTokenSync.syncTokens(
        rnTokens.accessToken,
        rnTokens.refreshToken,
        expiresIn
      );

    } catch (error: any) {
      return {
        success: false,
        message: `Sync to Android failed: ${error.message}`,
        isAuthenticated: false
      };
    }
  }

  private setupTokenChangeListeners(): void {
    // Listen for token updates from AuthContext or SDK
    DeviceEventEmitter.addListener('auth-tokens-updated', async (tokens) => {
      await this.handleTokenChange(tokens);
    });

    // Listen for token refresh events
    DeviceEventEmitter.addListener('auth-token-refresh', async (tokens) => {
      await this.handleTokenChange(tokens);
    });
  }

  private async handleTokenChange(tokens?: any): Promise<void> {
    try {
      
      // Wait a bit to ensure tokens are saved to RN storage
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Force sync with new tokens
      await this.forceSyncNow();
      
    } catch (error) {
    }
  }

  private async performInitialSync(): Promise<void> {
    try {
      await this.forceSyncNow();
    } catch (error) {
    }
  }

  private async performPeriodicSync(): Promise<void> {
    try {
      // Only perform periodic sync if we haven't synced recently
      const timeSinceLastSync = Date.now() - this.lastSyncTime;
      if (timeSinceLastSync < 60000) { // Less than 1 minute
        return;
      }

      
      const rnTokens = await this.getReactNativeTokens();
      if (!rnTokens) {
        return; // No tokens to sync
      }

      const needsSync = await this.checkIfSyncNeeded(rnTokens);
      if (needsSync) {
        await this.syncToAndroid(rnTokens);
      }

    } catch (error) {
    }
  }
}

// Export singleton instance
export const enhancedTokenSync = new EnhancedTokenSyncService();

// Export types
export type { TokenData };

// Development utilities
export const EnhancedTokenSyncDebug = __DEV__ ? {
  getSyncStatus: () => enhancedTokenSync.getSyncStatus(),
  forceSyncNow: () => enhancedTokenSync.forceSyncNow(),
  startAutoSync: () => enhancedTokenSync.startAutomaticSync(),
  stopAutoSync: () => enhancedTokenSync.stopAutomaticSync(),
} : null;