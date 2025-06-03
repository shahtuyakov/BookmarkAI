import * as Keychain from 'react-native-keychain';

// Use the same keychain service as AuthContext
const KEYCHAIN_SERVICE = 'com.bookmarkai.auth';

// Helper function to check if server should use AuthContext keychain service
const shouldUseAuthService = (server: string): boolean => {
  return server === 'bookmarkai' || 
         server === 'tokens' || 
         server.includes('bookmarkai') || 
         server.includes('localhost') ||
         server === 'api' ||
         server === 'default';
};

/**
 * Wrapper for react-native-keychain to ensure compatibility with SDK's KeychainModule interface
 * This bridges the SDK's InternetCredentials interface with the AuthContext's GenericPassword storage
 */
export const keychainWrapper = {
  async setInternetCredentials(
    server: string,
    username: string,
    password: string
  ): Promise<boolean> {
    try {
      console.log(`🔐 Keychain: Storing tokens for server: ${server}`);
      
      // For SDK token storage, use the same service as AuthContext
      if (shouldUseAuthService(server)) {
        const result = await Keychain.setGenericPassword(username, password, {
          service: KEYCHAIN_SERVICE
        });
        console.log(`✅ Keychain: Tokens stored using service ${KEYCHAIN_SERVICE}`);
        return !!result;
      }
      
      // For other servers, use internet credentials as normal
      const result = await Keychain.setInternetCredentials(server, username, password);
      return !!result;
    } catch (error) {
      console.error('Keychain setInternetCredentials error:', error);
      return false;
    }
  },

  async getInternetCredentials(
    server: string
  ): Promise<{ username: string; password: string } | false> {
    try {
      console.log(`🔐 Keychain: Getting tokens for server: ${server}`);
      
      // For SDK token storage, use the same service as AuthContext
      if (shouldUseAuthService(server)) {
        const credentials = await Keychain.getGenericPassword({
          service: KEYCHAIN_SERVICE
        });
        
        if (credentials) {
          console.log(`✅ Keychain: Tokens retrieved using service ${KEYCHAIN_SERVICE}`);
          
          // Parse the AuthContext token format
          try {
            const tokenData = JSON.parse(credentials.password);
            console.log(`🔍 Parsed token data:`, { hasAccessToken: !!tokenData.accessToken });
            
            // Return in format expected by SDK (access token as password, metadata as username)
            const sdkTokenFormat = {
              accessToken: tokenData.accessToken,
              refreshToken: tokenData.refreshToken || '',
              expiresAt: Date.now() + (24 * 60 * 60 * 1000) // Default to 24 hours
            };
            
            console.log(`🔄 Returning tokens to SDK in format:`, { 
              username: 'sdk_tokens',
              hasPassword: !!JSON.stringify(sdkTokenFormat),
              accessTokenLength: tokenData.accessToken?.length || 0
            });
            
            return {
              username: 'sdk_tokens',
              password: JSON.stringify(sdkTokenFormat)
            };
          } catch (parseError) {
            console.error(`❌ Failed to parse token data:`, parseError);
            console.log(`🔍 Raw credentials:`, credentials);
            return false;
          }
        } else {
          console.log(`ℹ️ Keychain: No tokens found in service ${KEYCHAIN_SERVICE}`);
          return false;
        }
      }
      
      // For other servers, use internet credentials as normal
      const credentials = await Keychain.getInternetCredentials(server);
      return credentials;
    } catch (error) {
      console.error('Keychain getInternetCredentials error:', error);
      return false;
    }
  },

  async resetInternetCredentials(server: string): Promise<boolean> {
    try {
      console.log(`🔐 Keychain: Resetting tokens for server: ${server}`);
      
      // For SDK token storage, use the same service as AuthContext
      if (shouldUseAuthService(server)) {
        const result = await Keychain.resetGenericPassword({
          service: KEYCHAIN_SERVICE
        });
        console.log(`✅ Keychain: Tokens reset for service ${KEYCHAIN_SERVICE}`);
        return true; // resetGenericPassword returns void, but we'll assume success if no error
      }
      
      // For other servers, use internet credentials as normal
      const result = await Keychain.resetInternetCredentials(server);
      return result;
    } catch (error) {
      console.error('Keychain resetInternetCredentials error:', error);
      return false;
    }
  },
};