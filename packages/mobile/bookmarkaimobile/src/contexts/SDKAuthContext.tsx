import React, { createContext, useContext, useState, useEffect } from 'react';
import { DeviceEventEmitter, Alert, Platform } from 'react-native';
import { createSDKAuthService, User } from '../services/sdk/auth';
import * as biometricService from '../services/biometrics';
import { androidTokenSync } from '../services/android-token-sync';
import { BookmarkAIClient } from '@bookmarkai/sdk';

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

const SDKAuthContext = createContext<AuthContextType>({
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

export const useAuth = () => useContext(SDKAuthContext);

/**
 * Clear tokens from Android native storage
 */
async function clearAndroidTokens(): Promise<void> {
  if (Platform.OS !== 'android') return;
  
  try {
    const result = await androidTokenSync.clearTokens();
    
    if (!result.success) {
      // Failed to clear Android tokens
    }
  } catch (error) {
    // Token clear error
  }
}

interface SDKAuthProviderProps {
  children: React.ReactNode;
  client: BookmarkAIClient;
}

export const SDKAuthProvider: React.FC<SDKAuthProviderProps> = ({ children, client }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isBiometricsAvailable, setIsBiometricsAvailable] = useState<boolean>(false);
  const [isBiometricsEnabled, setIsBiometricsEnabled] = useState<boolean>(false);
  const [biometryType, setBiometryType] = useState<string | undefined>(undefined);
  
  // Initialize auth service with provided client
  const authService = React.useMemo(() => {
    return createSDKAuthService(client);
  }, [client]);
  
  const checkBiometrics = async () => {
    const { available, biometryType } = await biometricService.checkBiometricAvailability();
    setIsBiometricsAvailable(available);
    setBiometryType(biometryType);
    
    if (available) {
      const enabled = await biometricService.isBiometricLoginEnabled();
      setIsBiometricsEnabled(enabled);
    }
  };
  
  // Check for existing session on app start (same logic as original)
  useEffect(() => {
    const checkAuth = async () => {
      console.log('🔐 [SDKAuthContext] Checking authentication on mount...');
      try {
        // Let SDK check if authenticated
        const isAuthenticated = await client?.isAuthenticated();
        console.log('🔑 [SDKAuthContext] SDK isAuthenticated:', isAuthenticated);
        
        if (isAuthenticated && authService) {
          try {
            console.log('👤 [SDKAuthContext] Fetching user profile...');
            // Try to get user profile using SDK
            const userData = await authService.getUserProfile();
            setUser(userData);
            console.log('✅ [SDKAuthContext] User profile retrieved:', userData?.email);
            
            // User profile retrieved successfully
            
          } catch (err) {
            console.error('❌ [SDKAuthContext] Failed to get user profile:', err);
            // Failed to get user profile
            // Let SDK handle token clearing
            await client?.logout();
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
        // Auth check failed
        setError('Session expired. Please login again.');
        setUser(null);
        await clearAndroidTokens();
      } finally {
        setIsLoading(false);
      }
    };
    
    // Check auth when component mounts
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
  }, [authService, client]);
  
  const login = async (email: string, password: string) => {
    if (!authService) {
      setError('SDK not initialized');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔐 [SDKAuthContext] Attempting login for:', email);
      const { user: userData } = await authService.login({ email, password });
      console.log('✅ [SDKAuthContext] Login successful, user:', userData?.email);
      setUser(userData);
      
      // Add a delay to ensure tokens are properly stored and SDK is ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if SDK is authenticated after login
      const isAuth = await client?.isAuthenticated();
      console.log('🔑 [SDKAuthContext] Post-login authentication check:', isAuth);
      
      // Login successful
      
      // After successful login, check if biometrics should be offered (same as original)
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
      console.error('❌ SDKAuthContext: Login failed', err);
      
      // Extract error message (SDK provides better error structure)
      const errorMessage = err.message || 
                           err.response?.data?.error?.message || 
                           'Login failed. Please check your credentials.';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  const loginWithBiometrics = async () => {
    if (!authService) {
      setError('SDK not initialized');
      return;
    }
    
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
      
      const userData = await authService.getUserProfile();
      if (userData) {
        setUser(userData);
        
        // Biometric login successful
      } else {
        setError('Failed to retrieve user data');
      }
    } catch (err: any) {
      // Biometric login failed
      const errorMessage = err.message || 
                           err.response?.data?.error?.message || 
                           'Biometric login failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  const register = async (email: string, name: string, password: string) => {
    if (!authService) {
      setError('SDK not initialized');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { user: userData } = await authService.register({ email, name, password });
      setUser(userData);
      
      // Registration successful
    } catch (err: any) {
      console.error('❌ SDKAuthContext: Registration failed', err);
      
      let errorMessage = 'Registration failed. Please try again.';
      
      if (err.message) {
        errorMessage = err.message;
      } else if (err.response?.data?.error?.message) {
        errorMessage = err.response.data.error.message;
      }
      
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  const logout = async () => {
    if (!authService) {
      // Even without SDK, clear local state
      setUser(null);
      await clearAndroidTokens();
      return;
    }
    
    setIsLoading(true);
    
    try {
      await authService.logout();
      setUser(null);
    } catch (err) {
      console.error('❌ SDKAuthContext: Logout failed', err);
      // Even if logout fails, clear local state (same as original)
      setUser(null);
      await clearAndroidTokens();
    } finally {
      setIsLoading(false);
    }
  };
  
  const resetPassword = async (email: string) => {
    if (!authService) {
      setError('SDK not initialized');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await authService.requestPasswordReset(email);
    } catch (err: any) {
      console.error('❌ SDKAuthContext: Password reset request failed', err);
      
      const errorMessage = err.message || 
                           err.response?.data?.error?.message || 
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
      console.error('❌ SDKAuthContext: Failed to enable biometrics:', err);
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
      console.error('❌ SDKAuthContext: Failed to disable biometrics:', err);
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
    <SDKAuthContext.Provider value={value}>
      {children}
    </SDKAuthContext.Provider>
  );
};