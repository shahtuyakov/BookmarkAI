import React, { createContext, useContext, useState, useEffect } from 'react';
import { DeviceEventEmitter, Alert, Platform } from 'react-native';
import { getAccessToken, clearTokens, getTokens } from '../services/api/client';
import { authAPI, User } from '../services/api/auth';
import * as biometricService from '../services/biometrics';
import { androidTokenSync } from '../services/android-token-sync';
import { useSDK } from './SDKContext';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isBiometricsAvailable: boolean;
  isBiometricsEnabled: boolean;
  biometryType: string | undefined;
  login: (email: string, password: string) => Promise<void>;
  loginWithBiometrics: () => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  enableBiometrics: () => Promise<boolean>;
  disableBiometrics: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: false,
  error: null,
  isAuthenticated: false,
  isBiometricsAvailable: false,
  isBiometricsEnabled: false,
  biometryType: undefined,
  login: async () => {},
  loginWithBiometrics: async () => {},
  register: async () => {},
  logout: async () => {},
  resetPassword: async () => {},
  enableBiometrics: async () => false,
  disableBiometrics: async () => false,
});

export const useAuth = () => useContext(AuthContext);

/**
 * Sync authentication tokens to both Android native storage and SDK
 */
async function syncTokensToNative(sdkSyncFn?: (accessToken: string, refreshToken?: string) => Promise<void>): Promise<void> {
  try {
    const tokens = await getTokens();
    if (!tokens) {
      return;
    }

    // Sync to Android native storage
    if (Platform.OS === 'android') {
      // Calculate expires in from current time
      const currentTime = Math.floor(Date.now() / 1000);
      const expiresIn = Math.max(0, tokens.expiresAt - currentTime);

      const result = await androidTokenSync.syncTokens(
        tokens.accessToken,
        tokens.refreshToken,
        expiresIn
      );

      if (!result.success) {
        console.error('❌ AuthContext: Failed to sync tokens to Android:', result.message);
      }
    }

    // Sync to SDK if available
    if (sdkSyncFn) {
      try {
        await sdkSyncFn(tokens.accessToken, tokens.refreshToken);
      } catch (error) {
        console.error('❌ AuthContext: Failed to sync tokens to SDK:', error);
      }
    }
  } catch (error) {
    console.error('❌ AuthContext: Token sync error:', error);
  }
}

/**
 * Clear tokens from Android native storage
 */
async function clearAndroidTokens(): Promise<void> {
  if (Platform.OS !== 'android') return;
  
  try {
    const result = await androidTokenSync.clearTokens();
    
    if (!result.success) {
      console.error('❌ AuthContext: Failed to clear Android tokens:', result.message);
    }
  } catch (error) {
    console.error('❌ AuthContext: Token clear error:', error);
  }
}

/**
 * Verify token synchronization status
 */
async function verifyTokenSync(): Promise<void> {
  if (Platform.OS !== 'android' || !__DEV__) return;
  
  try {
    const tokens = await getTokens();
    const isValid = await androidTokenSync.verifySync(tokens?.accessToken);
    
    if (isValid) {
    } else {
      console.warn('⚠️ AuthContext: Token sync verification failed - attempting re-sync');
      // Note: We can't access SDK context here since this is outside the component
      // Only re-sync to Android for now
      if (Platform.OS === 'android') {
        const tokens = await getTokens();
        if (tokens) {
          const currentTime = Math.floor(Date.now() / 1000);
          const expiresIn = Math.max(0, tokens.expiresAt - currentTime);
          await androidTokenSync.syncTokens(tokens.accessToken, tokens.refreshToken, expiresIn);
        }
      }
    }
  } catch (error) {
    console.error('❌ AuthContext: Token sync verification error:', error);
  }
}

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isBiometricsAvailable, setIsBiometricsAvailable] = useState<boolean>(false);
  const [isBiometricsEnabled, setIsBiometricsEnabled] = useState<boolean>(false);
  const [biometryType, setBiometryType] = useState<string | undefined>(undefined);
  
  // Get SDK for token synchronization
  const { syncAuthTokens, isInitialized } = useSDK();
  
  const checkBiometrics = async () => {
    const { available, biometryType } = await biometricService.checkBiometricAvailability();
    setIsBiometricsAvailable(available);
    setBiometryType(biometryType);
    
    if (available) {
      const enabled = await biometricService.isBiometricLoginEnabled();
      setIsBiometricsEnabled(enabled);
    }
  };
  
  // Check for existing session on app start
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await getAccessToken();
        
        if (token) {
          try {
            const userData = await authAPI.getUserProfile();
            setUser(userData);
            
            // Sync tokens to Android and SDK after successful session restoration
            await syncTokensToNative(isInitialized ? syncAuthTokens : undefined);
            
            // Verify sync in development
            if (__DEV__) {
              setTimeout(() => verifyTokenSync(), 1000);
            }
            
          } catch (err) {
            console.error('❌ AuthContext: Failed to get user profile:', err);
            await clearTokens();
            await clearAndroidTokens();
            setUser(null);
          }
        } else {
          setUser(null);
          // Ensure Android tokens are also cleared
          await clearAndroidTokens();
        }
        
        await checkBiometrics();
      } catch (err) {
        console.error('❌ AuthContext: Auth check failed', err);
        setError('Session expired. Please login again.');
        setUser(null);
        await clearAndroidTokens();
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
    
    const handleAuthError = () => {
      setUser(null);
      setError('Authentication failed. Please login again.');
      clearAndroidTokens(); // Clear Android tokens on auth error
    };
    
    DeviceEventEmitter.addListener('auth-error', handleAuthError);
    
    return () => {
      DeviceEventEmitter.removeAllListeners('auth-error');
    };
  }, []);
  
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { user: userData } = await authAPI.login({ email, password });
      setUser(userData);
      
      // Sync tokens to Android and SDK immediately after successful login
      await syncTokensToNative(isInitialized ? syncAuthTokens : undefined);
      
      // Verify sync in development
      if (__DEV__) {
        setTimeout(() => verifyTokenSync(), 1000);
      }
      
      // After successful login, check if biometrics should be offered
      if (isBiometricsAvailable && !isBiometricsEnabled) {
        const biometricName = biometricService.getBiometricName(biometryType);
        Alert.alert(
          `Enable ${biometricName}`,
          `Would you like to enable ${biometricName} for faster secure access?`,
          [
            { text: 'Not Now', style: 'cancel' },
            { 
              text: 'Enable', 
              onPress: async () => {
                const success = await enableBiometrics();
                if (success) {
                  Alert.alert(
                    'Success',
                    `${biometricName} login has been enabled.`
                  );
                }
              } 
            },
          ]
        );
      }
    } catch (err: any) {
      console.error('❌ AuthContext: Login failed', err);
      
      const errorMessage = err.response?.data?.error?.message || 
                           'Login failed. Please check your credentials.';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  const loginWithBiometrics = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const enabled = await biometricService.isBiometricLoginEnabled();
      if (!enabled) {
        setError('Biometric login is not enabled');
        return;
      }
      
      const success = await biometricService.authenticateWithBiometrics(
        'Sign in to BookmarkAI'
      );
      
      if (!success) {
        setError('Biometric authentication failed');
        return;
      }
      
      const userId = await biometricService.getBiometricUserId();
      if (!userId) {
        setError('User ID not found for biometric login');
        return;
      }
      
      const userData = await authAPI.getUserProfile();
      if (userData) {
        setUser(userData);
        
        // Sync tokens after biometric login
        await syncTokensToNative(isInitialized ? syncAuthTokens : undefined);
        
        if (__DEV__) {
          setTimeout(() => verifyTokenSync(), 1000);
        }
      } else {
        setError('Failed to retrieve user data');
      }
    } catch (err: any) {
      console.error('❌ AuthContext: Biometric login failed', err);
      const errorMessage = err.response?.data?.error?.message || 
                           'Biometric login failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  const register = async (email: string, name: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { user: userData } = await authAPI.register({ email, name, password });
      setUser(userData);
      
      // Sync tokens to Android and SDK immediately after successful registration
      await syncTokensToNative(isInitialized ? syncAuthTokens : undefined);
      
      // Verify sync in development
      if (__DEV__) {
        setTimeout(() => verifyTokenSync(), 1000);
      }
    } catch (err: any) {
      console.error('❌ AuthContext: Registration failed', err);
      
      let errorMessage = 'Registration failed. Please try again.';
      
      if (err.response?.data?.error?.message) {
        errorMessage = err.response.data.error.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  const logout = async () => {
    setIsLoading(true);
    
    try {
      
      // Clear Android tokens first
      await clearAndroidTokens();
      
      // Then clear React Native tokens and call server logout
      await authAPI.logout();
      setUser(null);
      
    } catch (err) {
      console.error('❌ AuthContext: Logout failed', err);
      // Even if the server-side logout fails, we still want to clear local data
      setUser(null);
      await clearTokens();
      await clearAndroidTokens();
    } finally {
      setIsLoading(false);
    }
  };
  
  const resetPassword = async (email: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await authAPI.requestPasswordReset(email);
    } catch (err: any) {
      console.error('❌ AuthContext: Password reset request failed', err);
      
      const errorMessage = err.response?.data?.error?.message || 
                           'Password reset failed. Please try again.';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  const enableBiometrics = async (): Promise<boolean> => {
    if (!user) {
      setError('You must be logged in to enable biometric login');
      return false;
    }
    
    try {
      const success = await biometricService.enableBiometricLogin(user.id);
      
      if (success) {
        setIsBiometricsEnabled(true);
      }
      
      return success;
    } catch (err) {
      console.error('❌ AuthContext: Failed to enable biometrics:', err);
      setError('Failed to enable biometric login. Please try again.');
      return false;
    }
  };
  
  const disableBiometrics = async (): Promise<boolean> => {
    try {
      const success = await biometricService.disableBiometricLogin();
      
      if (success) {
        setIsBiometricsEnabled(false);
      }
      
      return success;
    } catch (err) {
      console.error('❌ AuthContext: Failed to disable biometrics:', err);
      setError('Failed to disable biometric login. Please try again.');
      return false;
    }
  };
  
  const value = {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    isBiometricsAvailable,
    isBiometricsEnabled,
    biometryType,
    login,
    loginWithBiometrics,
    register,
    logout,
    resetPassword,
    enableBiometrics,
    disableBiometrics,
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};