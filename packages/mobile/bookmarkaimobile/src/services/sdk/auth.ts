// SDK-based auth service that maintains compatibility with existing logic
// while leveraging SDK features for improved reliability

import { BookmarkAIClient } from '@bookmarkai/sdk';
import { saveTokens, clearTokens, getTokens } from '../api/client';
import { Platform } from 'react-native';
import { androidTokenSync } from '../android-token-sync';

export interface User {
  id: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  lastLogin?: string;
  role?: string;
  createdAt?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user?: User;
}

export const createSDKAuthService = (client: BookmarkAIClient) => {
  
  // Helper function to sync tokens to Android native storage
  const syncTokensToAndroid = async (accessToken: string, refreshToken: string, expiresIn: number) => {
    if (Platform.OS !== 'android') return;
    
    try {
      const result = await androidTokenSync.syncTokens(
        accessToken,
        refreshToken,
        expiresIn
      );
      
      if (!result.success) {
        console.error('❌ SDK Auth: Failed to sync tokens to Android:', result.message);
      }
    } catch (error) {
      console.error('❌ SDK Auth: Android token sync error:', error);
    }
  };

  return {
    // Login with improved error handling and single token save
    login: async (credentials: { email: string; password: string }) => {
      try {
        // SDK's login method returns the data directly (not wrapped in response)
        const loginResponse = await client.auth.login(credentials);
        
        console.log('Login response structure:', {
          hasUser: !!loginResponse.user,
          hasTokens: !!(loginResponse.accessToken && loginResponse.refreshToken),
          userFields: loginResponse.user ? Object.keys(loginResponse.user) : []
        });
        
        // Extract tokens with default expiresIn
        const { accessToken, refreshToken, expiresIn = 15 * 60 } = loginResponse;
        
        // Save tokens once (fixing the double save issue)
        await saveTokens(accessToken, refreshToken, expiresIn);
        
        // Sync to Android if needed
        await syncTokensToAndroid(accessToken, refreshToken, expiresIn);
        
        // Check if user data is already in the login response
        if (loginResponse.user) {
          return { user: loginResponse.user };
        }
        
        // If user data isn't included, return fallback data with more fields
        // Note: Profile fetching is failing due to server issues, so we'll use enhanced fallback
        return {
          user: {
            id: 'temp-' + Date.now(),
            email: credentials.email,
            name: credentials.email.split('@')[0],
            emailVerified: false,
            lastLogin: new Date().toISOString(),
            role: 'user',
            createdAt: new Date().toISOString(),
          }
        };
      } catch (error) {
        console.error('SDK Login error:', error);
        throw error;
      }
    },

    // Register with same improvements
    register: async (userData: { email: string; name: string; password: string }) => {
      try {
        // Use SDK's register method for consistency
        const registerResponse = await client.auth.register(userData);
        
        // Extract tokens with default expiresIn
        const { accessToken, refreshToken, expiresIn = 15 * 60 } = registerResponse;
        
        // Save tokens once
        await saveTokens(accessToken, refreshToken, expiresIn);
        
        // Sync to Android if needed
        await syncTokensToAndroid(accessToken, refreshToken, expiresIn);
        
        // Check if user data is already in the register response
        if (registerResponse.user) {
          return { user: registerResponse.user };
        }
        
        // If user data isn't included, return fallback data with more fields
        // Note: Profile fetching is failing due to server issues, so we'll use enhanced fallback
        return {
          user: {
            id: 'temp-' + Date.now(),
            email: userData.email,
            name: userData.name,
            emailVerified: false,
            lastLogin: new Date().toISOString(),
            role: 'user',
            createdAt: new Date().toISOString(),
          }
        };
      } catch (error) {
        console.error('SDK Registration error:', error);
        throw error;
      }
    },

    // Logout with graceful error handling
    logout: async () => {
      try {
        // Get refresh token for logout request
        const tokens = await getTokens();
        
        // Attempt server logout (don't let failures block local cleanup)
        try {
          if (tokens?.refreshToken) {
            await client.auth.logout();
          }
        } catch (serverError) {
          console.error('SDK logout server error (continuing with local cleanup):', serverError);
        }
        
        // Always clear local tokens
        await clearTokens();
        
        // Clear Android tokens
        if (Platform.OS === 'android') {
          try {
            const result = await androidTokenSync.clearTokens();
            if (!result.success) {
              console.error('❌ SDK Auth: Failed to clear Android tokens:', result.message);
            }
          } catch (error) {
            console.error('❌ SDK Auth: Android token clear error:', error);
          }
        }
      } catch (error) {
        console.error('SDK Logout error:', error);
        // Even on error, ensure tokens are cleared
        await clearTokens();
      }
    },

    // Get user profile
    getUserProfile: async (): Promise<User> => {
      // SDK returns data directly
      const user = await client.auth.getCurrentUser();
      return user as User;
    },

    // Request password reset
    requestPasswordReset: async (email: string) => {
      // SDK doesn't have this endpoint yet, so we'll use direct API call
      // This maintains functionality while we wait for SDK support
      // Get base URL from environment
      const baseUrl = __DEV__ 
        ? 'https://bookmarkai-dev.ngrok.io/api'
        : 'https://api.bookmarkai.com/api';
      
      const response = await fetch(`${baseUrl}/v1/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Password reset request failed');
      }
    },

    // Note: Token refresh is handled automatically by SDK
    // No need for manual refresh implementation
  };
};

// Helper to verify token sync (dev only)
export const verifySDKTokenSync = async (_client: BookmarkAIClient, accessToken?: string): Promise<void> => {
  if (Platform.OS !== 'android' || !__DEV__) return;
  
  try {
    const tokens = await getTokens();
    const isValid = await androidTokenSync.verifySync(tokens?.accessToken || accessToken);
    
    if (!isValid) {
      console.warn('⚠️ SDK Auth: Token sync verification failed');
      // Re-sync if needed
      if (tokens) {
        const currentTimeMs = Date.now();
        const expiresIn = Math.max(0, Math.floor((tokens.expiresAt - currentTimeMs) / 1000));
        await androidTokenSync.syncTokens(tokens.accessToken, tokens.refreshToken, expiresIn);
      }
    }
  } catch (error) {
    console.error('❌ SDK Auth: Token sync verification error:', error);
  }
};