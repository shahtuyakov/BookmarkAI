import { NativeModules } from 'react-native';
import { getTokens } from '../services/api/client';
import { EnhancedTokenSyncDebug } from '../services/enhanced-token-sync';

/**
 * Test suite for verifying token synchronization between React Native and Android native storage
 */

interface ShareHandlerModule {
  syncAuthTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<any>;
  clearAuthTokens(): Promise<any>;
  isAuthenticated(): Promise<any>;
  getTokenDebugInfo(): Promise<any>;
}

interface HardwareSecurityModule {
  getHardwareSecurityInfo(): Promise<any>;
  testHardwareSecurity(): Promise<any>;
}

const ShareHandler = NativeModules.ShareHandler as ShareHandlerModule;
const HardwareSecurity = NativeModules.HardwareSecurityModule as HardwareSecurityModule;

export class TokenSyncTestSuite {

  /**
   * Test 1: Verify React Native tokens exist and are synced to Android
   */
  static async testTokenSyncFromReactNative(): Promise<void> {
    console.log('\n=== Token Sync Test Suite ===');

    try {
      // Step 1: Get tokens from React Native storage
      console.log('Step 1: Getting tokens from React Native storage...');
      const rnTokens = await getTokens();

      if (!rnTokens) {
        console.log('No tokens found in React Native storage - please login first');
        return;
      }

      console.log('React Native tokens found:');
      console.log(`   Access token length: ${rnTokens.accessToken.length}`);
      console.log(`   Refresh token length: ${rnTokens.refreshToken.length}`);
      console.log(`   Expires at: ${new Date(rnTokens.expiresAt * 1000).toISOString()}`);

      // Step 2: Check Android native authentication status
      console.log('\nStep 2: Checking Android native authentication status...');
      const androidAuthStatus = await ShareHandler.isAuthenticated();

      console.log('Android auth status:', androidAuthStatus);

      // Step 3: Get detailed Android token info
      console.log('\nStep 3: Getting Android token debug info...');
      const androidDebugInfo = await ShareHandler.getTokenDebugInfo();

      console.log('Android token debug info:', androidDebugInfo);

      // Step 4: Compare tokens
      console.log('\nStep 4: Comparing React Native vs Android tokens...');
      const tokensMatch = this.compareTokens(rnTokens, androidDebugInfo);

      if (tokensMatch) {
        console.log('TOKEN SYNC SUCCESS: React Native and Android tokens match!');
      } else {
        console.log('TOKEN SYNC FAILURE: Tokens do not match between platforms');
      }

    } catch (error) {
      console.error('Token sync test failed:', error);
    }
  }

  /**
   * Test 2: Test manual token sync
   */
  static async testManualTokenSync(): Promise<void> {
    console.log('\n=== Manual Token Sync Test ===');

    try {
      // Get current RN tokens
      const rnTokens = await getTokens();
      if (!rnTokens) {
        console.log('No React Native tokens to sync');
        return;
      }

      // Clear Android tokens first
      console.log('Clearing Android tokens...');
      await ShareHandler.clearAuthTokens();

      // Verify Android tokens are cleared
      const clearedStatus = await ShareHandler.isAuthenticated();
      console.log('Android auth status after clear:', clearedStatus);

      // Manually sync tokens
      console.log('Manually syncing tokens to Android...');

      // Calculate expiresIn from expiresAt (Android native expects seconds from now)
      const currentTime = Math.floor(Date.now() / 1000);
      const expiresIn = rnTokens.expiresAt - currentTime;

      console.log(`Token expires in ${expiresIn} seconds (${Math.floor(expiresIn / 60)} minutes)`);

      const syncResult = await ShareHandler.syncAuthTokens(
        rnTokens.accessToken,
        rnTokens.refreshToken,
        expiresIn
      );

      console.log('Manual sync result:', syncResult);

      // Verify sync worked
      const postSyncStatus = await ShareHandler.isAuthenticated();
      console.log('Android auth status after sync:', postSyncStatus);

      if (postSyncStatus.isAuthenticated) {
        console.log('MANUAL SYNC SUCCESS: Tokens successfully synced manually!');
      } else {
        console.log('MANUAL SYNC FAILURE: Manual sync did not work');
      }

    } catch (error) {
      console.error('Manual token sync test failed:', error);
    }
  }

  /**
   * Test 3: Test hardware security capabilities
   */
  static async testHardwareSecurityCapabilities(): Promise<void> {
    console.log('\n=== Hardware Security Test ===');

    try {
      if (!HardwareSecurity) {
        console.log('Hardware Security module not available');
        return;
      }

      // Get hardware security info
      console.log('Getting hardware security information...');
      const securityInfo = await HardwareSecurity.getHardwareSecurityInfo();

      console.log('Hardware Security Info:');
      console.log(`   Has Hardware Keystore: ${securityInfo.hasHardwareKeystore}`);
      console.log(`   Has StrongBox: ${securityInfo.hasStrongBox}`);
      console.log(`   Has TEE: ${securityInfo.hasTEE}`);
      console.log(`   Biometric Status: ${securityInfo.biometricStatus}`);
      console.log(`   Is Device Secure: ${securityInfo.isDeviceSecure}`);
      console.log(`   Android Version: ${securityInfo.androidVersion}`);
      console.log(`   API Level: ${securityInfo.apiLevel}`);

      // Test hardware security functionality
      console.log('\nTesting hardware security functionality...');
      const testResult = await HardwareSecurity.testHardwareSecurity();

      console.log('Hardware Security Test Result:', testResult);

      if (testResult.success) {
        console.log('HARDWARE SECURITY SUCCESS: All tests passed!');
      } else {
        console.log('HARDWARE SECURITY PARTIAL: Some features may not be available');
        console.log(`   Error: ${testResult.error || testResult.message}`);
      }

    } catch (error) {
      console.error('Hardware security test failed:', error);
    }
  }

  /**
   * Test 4: Test token persistence across app restarts
   */
  static async testTokenPersistence(): Promise<void> {
    console.log('\n=== Token Persistence Test ===');
    console.log('This test checks if tokens persist in Android native storage');
    console.log('Instructions: Close the app completely and reopen to test persistence');

    try {
      const androidAuthStatus = await ShareHandler.isAuthenticated();
      const androidDebugInfo = await ShareHandler.getTokenDebugInfo();

      console.log('Current Android auth status:', androidAuthStatus);
      console.log('Current Android token info:', {
        hasTokens: androidDebugInfo.hasTokens,
        isAuthenticated: androidDebugInfo.isAuthenticated,
        isExpired: androidDebugInfo.isExpired,
        timeUntilExpiry: Math.floor(androidDebugInfo.timeUntilExpiry / 60) + ' minutes',
      });

      if (androidAuthStatus.isAuthenticated) {
        console.log('PERSISTENCE SUCCESS: Tokens are persisted in Android native storage!');
        console.log('Next: Close and reopen the app to verify persistence across restarts');
      } else {
        console.log('PERSISTENCE FAILURE: No tokens found in Android native storage');
      }

    } catch (error) {
      console.error('Token persistence test failed:', error);
    }
  }

  /**
   * Test 5: Test Enhanced Automatic Token Synchronization
   */
  static async testEnhancedTokenSync(): Promise<void> {
    console.log('\n=== Enhanced Token Sync Test ===');

    try {
      if (!EnhancedTokenSyncDebug) {
        console.log('Enhanced token sync debug utilities not available');
        return;
      }

      // Get current sync status
      console.log('Getting current sync status...');
      const syncStatus = await EnhancedTokenSyncDebug.getSyncStatus();

      console.log('Enhanced Sync Status:');
      console.log(`   Is In Sync: ${syncStatus.isInSync}`);
      console.log(`   RN Has Tokens: ${syncStatus.rnHasTokens}`);
      console.log(`   Android Has Tokens: ${syncStatus.androidHasTokens}`);
      console.log(`   Last Sync Time: ${new Date(syncStatus.lastSyncTime).toISOString()}`);
      console.log(`   Retry Count: ${syncStatus.retryCount}`);
      console.log(`   Recommendation: ${syncStatus.recommendation}`);

      // Force sync if needed
      if (!syncStatus.isInSync) {
        console.log('\nForcing synchronization...');
        const syncResult = await EnhancedTokenSyncDebug.forceSyncNow();

        console.log('Force Sync Result:', syncResult);

        if (syncResult.success) {
          console.log('ENHANCED SYNC SUCCESS: Tokens synchronized successfully!');

          // Verify sync worked
          const newStatus = await EnhancedTokenSyncDebug.getSyncStatus();
          console.log(`Post-sync status: In Sync = ${newStatus.isInSync}`);
        } else {
          console.log('ENHANCED SYNC FAILURE: Failed to synchronize tokens');
        }
      } else {
        console.log('ENHANCED SYNC SUCCESS: Tokens already synchronized!');
      }

    } catch (error) {
      console.error('Enhanced token sync test failed:', error);
    }
  }

  /**
   * Run all tests in sequence
   */
  static async runAllTests(): Promise<void> {
    console.log('Starting comprehensive token sync test suite...\n');

    await this.testTokenSyncFromReactNative();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

    await this.testEnhancedTokenSync();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await this.testHardwareSecurityCapabilities();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await this.testTokenPersistence();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Don't run manual sync test automatically as it clears tokens
    console.log('\nManual sync test available but not run automatically');
    console.log('Call TokenSyncTestSuite.testManualTokenSync() if needed');

    console.log('\n=== Test Suite Complete ===');
  }

  /**
   * Compare React Native and Android tokens
   */
  private static compareTokens(rnTokens: any, androidDebugInfo: any): boolean {
    // Compare access token (first 50 characters for security)
    const rnAccessPreview = rnTokens.accessToken.substring(0, 50);
    const androidAccessPreview = androidDebugInfo.accessTokenPreview?.substring(0, 50);

    // Compare refresh token (first 50 characters for security)
    const rnRefreshPreview = rnTokens.refreshToken.substring(0, 50);
    const androidRefreshPreview = androidDebugInfo.refreshTokenPreview?.substring(0, 50);

    const accessMatch = rnAccessPreview === androidAccessPreview;
    const refreshMatch = rnRefreshPreview === androidRefreshPreview;

    console.log(`   Access token match: ${accessMatch ? 'YES' : 'NO'}`);
    console.log(`   Refresh token match: ${refreshMatch ? 'YES' : 'NO'}`);
    console.log(`   RN Access Preview: ${rnAccessPreview}...`);
    console.log(`   Android Access Preview: ${androidAccessPreview}...`);

    return accessMatch && refreshMatch;
  }
}

// Export for easy console access
(global as any).TokenSyncTestSuite = TokenSyncTestSuite;
