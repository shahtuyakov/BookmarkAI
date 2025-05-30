import AndroidTokenSyncService from '../services/android-token-sync';
import { getTokens } from '../services/api/client';
import { Platform } from 'react-native';

/**
 * Debug utilities for authentication token synchronization
 */
export class AuthDebugUtils {
  
  /**
   * Comprehensive authentication state check
   */
  static async checkAuthState(): Promise<void> {
    console.log('🔍 === Authentication State Debug ===');
    
    try {
      // Check React Native token storage
      const rnTokens = await getTokens();
      console.log('📱 React Native tokens:', rnTokens ? '✅ Present' : '❌ Missing');
      
      if (rnTokens) {
        console.log('  - Access token (first 20 chars):', rnTokens.accessToken.substring(0, 20) + '...');
        console.log('  - Refresh token (first 20 chars):', rnTokens.refreshToken.substring(0, 20) + '...');
      }
      
      // Check Android native token storage (Android only)
      if (Platform.OS === 'android') {
        const androidAuth = await AndroidTokenSyncService.isAuthenticated();
        console.log('🤖 Android native auth:', androidAuth ? '✅ Authenticated' : '❌ Not authenticated');
        
        // Analyze sync state
        if (rnTokens && androidAuth) {
          console.log('✅ Token sync is working correctly');
        } else if (rnTokens && !androidAuth) {
          console.log('⚠️ SYNC ISSUE: RN has tokens but Android native does not');
          console.log('💡 Suggestion: Call AndroidTokenSyncService.syncTokens()');
        } else if (!rnTokens && androidAuth) {
          console.log('⚠️ INCONSISTENT STATE: Android native has tokens but RN does not');
          console.log('💡 Suggestion: Clear Android tokens or re-login');
        } else {
          console.log('ℹ️ Both storages are empty (user not logged in)');
        }
      } else {
        console.log('🍎 iOS platform - Android token sync not applicable');
      }
      
    } catch (error) {
      console.error('❌ Error checking auth state:', error);
    }
    
    console.log('🔍 === End Authentication Debug ===');
  }
  
  /**
   * Force sync tokens from React Native to Android native storage
   */
  static async forceSyncTokens(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      console.log('🍎 iOS platform - token sync not needed');
      return true;
    }
    
    try {
      const tokens = await getTokens();
      if (!tokens) {
        console.log('❌ No tokens found in React Native storage to sync');
        return false;
      }
      
      console.log('🔄 Force syncing tokens to Android native storage...');
      const success = await AndroidTokenSyncService.syncTokens(
        tokens.accessToken, 
        tokens.refreshToken
      );
      
      if (success) {
        console.log('✅ Force sync completed successfully');
        // Verify the sync worked
        await this.checkAuthState();
      }
      
      return success;
    } catch (error) {
      console.error('❌ Force sync failed:', error);
      return false;
    }
  }
  
  /**
   * Clear all authentication tokens from both storages
   */
  static async clearAllTokens(): Promise<void> {
    console.log('🧹 Clearing all authentication tokens...');
    
    try {
      // Clear React Native tokens
      const { clearTokens } = require('../services/api/client');
      await clearTokens();
      console.log('✅ Cleared React Native tokens');
      
      // Clear Android native tokens
      await AndroidTokenSyncService.clearTokens();
      console.log('✅ Cleared Android native tokens');
      
      // Verify everything is cleared
      await this.checkAuthState();
      
    } catch (error) {
      console.error('❌ Error clearing tokens:', error);
    }
  }
  
  /**
   * Test the complete authentication flow
   */
  static async testAuthFlow(): Promise<void> {
    console.log('🧪 === Testing Authentication Flow ===');
    
    // Step 1: Check initial state
    console.log('Step 1: Initial state');
    await this.checkAuthState();
    
    // Step 2: Simulate login (you would call this after actual login)
    console.log('\nStep 2: After login (call this manually after login)');
    console.log('💡 To test: Login through the app, then call AuthDebugUtils.checkAuthState()');
    
    // Step 3: Test force sync
    console.log('\nStep 3: Testing force sync');
    await this.forceSyncTokens();
    
    console.log('🧪 === End Authentication Flow Test ===');
  }
}

// Export for easy console access during development
if (__DEV__) {
  // @ts-ignore - Adding to global for debugging
  global.AuthDebug = AuthDebugUtils;
  console.log('🔧 AuthDebugUtils available as global.AuthDebug in development');
}

export default AuthDebugUtils; 