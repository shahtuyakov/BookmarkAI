import * as Keychain from 'react-native-keychain';

// Shared keychain configuration for main app and share extension
const KEYCHAIN_SERVICE = 'com.bookmarkai.auth';
const SHARED_ACCESS_GROUP = 'org.reactjs.native.example.BookmarkAI'; // Updated to match bundle ID

// Helper function to check if server should use AuthContext keychain service
const shouldUseAuthService = (server: string): boolean => {
  return server === 'com.bookmarkai.app' || 
         server === 'bookmarkai' || 
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
      // For SDK token storage, use SEPARATE storage to avoid conflicts with AuthContext
      if (shouldUseAuthService(server)) {
        // Use server-specific internet credentials instead of generic password
        // This prevents overwriting AuthContext tokens
        const result = await Keychain.setInternetCredentials(server, username, password);
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
      // For SDK token storage, check for SDK-specific data first
      if (shouldUseAuthService(server)) {
        // First try to get SDK-specific token storage
        try {
          const sdkCredentials = await Keychain.getInternetCredentials(server);
          if (sdkCredentials) {
            return sdkCredentials;
          }
        } catch (error) {
          // Silently fall back to AuthContext tokens
        }
        
        // Fallback: try to get AuthContext tokens and convert them
        const credentials = await Keychain.getGenericPassword({
          service: KEYCHAIN_SERVICE,
          accessGroup: SHARED_ACCESS_GROUP
        });
        
        if (credentials) {
          // Parse the AuthContext token format
          try {
            const tokenData = JSON.parse(credentials.password);
            
            // Return in format expected by SDK ReactNativeStorageAdapter
            const sdkTokenFormat = {
              bookmarkai_access_token: tokenData.accessToken,
              bookmarkai_refresh_token: tokenData.refreshToken || '',
            };
            
            return {
              username: 'bookmarkai_user',
              password: JSON.stringify(sdkTokenFormat)
            };
          } catch (parseError) {
            return false;
          }
        } else {
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
      // For SDK token storage, use the same service as AuthContext
      if (shouldUseAuthService(server)) {
        await Keychain.resetGenericPassword({
          service: KEYCHAIN_SERVICE,
          accessGroup: SHARED_ACCESS_GROUP
        });
        return true;
      }
      
      // For other servers, use internet credentials as normal
      await Keychain.resetInternetCredentials(server);
      return true;
    } catch (error) {
      console.error('Keychain resetInternetCredentials error:', error);
      return false;
    }
  },
};