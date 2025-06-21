import * as Keychain from 'react-native-keychain';

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
      return false;
    }
  },

  async getInternetCredentials(
    server: string
  ): Promise<{ username: string; password: string } | false> {
    try {
      // For SDK token storage, use internet credentials only (no fallback)
      if (shouldUseAuthService(server)) {
        const sdkCredentials = await Keychain.getInternetCredentials(server);
        return sdkCredentials || false;
      }
      
      // For other servers, use internet credentials as normal
      const credentials = await Keychain.getInternetCredentials(server);
      return credentials;
    } catch (error) {
      return false;
    }
  },

  async resetInternetCredentials(server: string): Promise<boolean> {
    try {
      // For SDK token storage, properly reset internet credentials
      if (shouldUseAuthService(server)) {
        // Reset the internet credentials for this server (SDK tokens)
        await Keychain.resetInternetCredentials(server);
        return true;
      }
      
      // For other servers, use internet credentials as normal
      await Keychain.resetInternetCredentials(server);
      return true;
    } catch (error) {
      return false;
    }
  },
};