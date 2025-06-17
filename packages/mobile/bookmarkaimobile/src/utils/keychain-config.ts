import { Platform } from 'react-native';

// Shared keychain configuration
export const KEYCHAIN_SERVICE = 'com.bookmarkai.auth';
// Updated to match the actual bundle identifier pattern
export const SHARED_ACCESS_GROUP = 'org.reactjs.native.example.BookmarkAI';

/**
 * Get keychain options with conditional access group
 * Access groups only work on physical iOS devices, not in simulator
 */
export const getKeychainOptions = (includeAccessGroup: boolean = true) => {
  const options: any = {
    service: KEYCHAIN_SERVICE
  };
  
  // Only include access group if requested and on iOS
  // Note: Access groups cause "entitlement not present" errors in iOS Simulator
  if (includeAccessGroup && Platform.OS === 'ios') {
    options.accessGroup = SHARED_ACCESS_GROUP;
  }
  
  return options;
};

/**
 * Get keychain options that are guaranteed to work (fallback without access group)
 */
export const getSafeKeychainOptions = () => {
  return {
    service: KEYCHAIN_SERVICE
    // No access group for maximum compatibility
  };
};

/**
 * Try keychain operation with access group first, fallback without it
 */
export const withKeychainFallback = async <T>(
  operation: (options: any) => Promise<T>
): Promise<T> => {
  try {
    // Try with access group first (for device compatibility)
    return await operation(getKeychainOptions(true));
  } catch (error: any) {
    // If it fails with entitlement error, try without access group (simulator compatibility)
    if (error.message?.includes('entitlement') || error.message?.includes('Internal error')) {
      console.log('⚠️ Keychain access group failed, retrying without access group');
      return await operation(getSafeKeychainOptions());
    }
    throw error;
  }
};