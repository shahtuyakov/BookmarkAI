import { Platform, NativeModules } from 'react-native';

/**
 * Service to handle authentication token synchronization with Android native storage.
 * This ensures the ShareUploadWorker can access tokens for background uploads.
 */
export class AndroidTokenSyncService {

  /**
   * Sync authentication tokens with Android native storage
   */
  static async syncTokens(accessToken: string, refreshToken: string, expiresIn = 3600): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true; // No-op on iOS
    }

    if (!NativeModules.ShareHandler?.syncAuthTokens) {
      console.warn('⚠️ ShareHandler module not available for token sync');
      return false;
    }

    try {
      console.log('🔄 Syncing tokens with Android native storage...');
      await NativeModules.ShareHandler.syncAuthTokens(accessToken, refreshToken, expiresIn);
      console.log('✅ Successfully synced tokens with Android native storage');
      return true;
    } catch (error) {
      console.error('❌ Failed to sync tokens with Android native storage:', error);
      return false;
    }
  }

  /**
   * Clear authentication tokens from Android native storage
   */
  static async clearTokens(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true; // No-op on iOS
    }

    if (!NativeModules.ShareHandler?.clearAuthTokens) {
      console.warn('⚠️ ShareHandler module not available for token clearing');
      return false;
    }

    try {
      console.log('🧹 Clearing tokens from Android native storage...');
      await NativeModules.ShareHandler.clearAuthTokens();
      console.log('✅ Successfully cleared tokens from Android native storage');
      return true;
    } catch (error) {
      console.error('❌ Failed to clear tokens from Android native storage:', error);
      return false;
    }
  }

  /**
   * Check if user is authenticated in Android native storage
   */
  static async isAuthenticated(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false; // N/A on iOS
    }

    if (!NativeModules.ShareHandler?.isAuthenticated) {
      console.warn('⚠️ ShareHandler module not available for auth check');
      return false;
    }

    try {
      const isAuth = await NativeModules.ShareHandler.isAuthenticated();
      console.log('🔐 Android native authentication status:', isAuth);
      return isAuth;
    } catch (error) {
      console.error('❌ Failed to check Android native auth status:', error);
      return false;
    }
  }

  /**
   * Debug helper to log the current authentication state across both storages
   */
  static async debugAuthState(): Promise<void> {
    if (Platform.OS !== 'android') {
      console.log('🍎 iOS platform - Android token sync not applicable');
      return;
    }

    try {
      // Check React Native token storage
      const { getTokens } = require('./api/client');
      const rnTokens = await getTokens();

      // Check Android native token storage
      const androidAuth = await this.isAuthenticated();

      console.log('🔍 Authentication State Debug:');
      console.log('  React Native tokens:', rnTokens ? '✅ Present' : '❌ Missing');
      console.log('  Android native auth:', androidAuth ? '✅ Authenticated' : '❌ Not authenticated');

      if (rnTokens && !androidAuth) {
        console.log('⚠️ Token sync issue detected! RN has tokens but Android native does not');
      } else if (!rnTokens && androidAuth) {
        console.log('⚠️ Inconsistent state! Android native has tokens but RN does not');
      } else if (rnTokens && androidAuth) {
        console.log('✅ Token sync is working correctly');
      }
    } catch (error) {
      console.error('❌ Failed to debug auth state:', error);
    }
  }
}

export default AndroidTokenSyncService;
