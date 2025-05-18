// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { DeviceEventEmitter, Alert } from 'react-native';
import { getAccessToken, clearTokens } from '../services/api/client';
import { authAPI, User } from '../services/api/auth';
import * as biometricService from '../services/biometrics';

// Interface for Auth Context
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

// Create context with default values
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

// Hook to use the auth context
export const useAuth = () => useContext(AuthContext);

// Auth Provider component
export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isBiometricsAvailable, setIsBiometricsAvailable] = useState<boolean>(false);
  const [isBiometricsEnabled, setIsBiometricsEnabled] = useState<boolean>(false);
  const [biometryType, setBiometryType] = useState<string | undefined>(undefined);
  
  // Check biometric availability
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
        console.log('Checking for existing session...');
        const token = await getAccessToken();
        
        if (token) {
          try {
            // If we have a token, fetch the user profile
            const userData = await authAPI.getUserProfile();
            console.log('User session found:', userData);
            setUser(userData);
          } catch (err) {
            // If token is invalid or expired, clear it
            console.error('Failed to get user profile:', err);
            await clearTokens();
            setUser(null);
          }
        } else {
          console.log('No token found, user is not authenticated');
          setUser(null);
        }
        
        // Check biometric availability
        await checkBiometrics();
      } catch (err) {
        console.error('Auth check failed', err);
        setError('Session expired. Please login again.');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
    
    // Listen for auth errors (like token refresh failures)
    const handleAuthError = () => {
      setUser(null);
      setError('Authentication failed. Please login again.');
    };
    
    // Use React Native's DeviceEventEmitter
    DeviceEventEmitter.addListener('auth-error', handleAuthError);
    
    return () => {
      DeviceEventEmitter.removeAllListeners('auth-error');
    };
  }, []);
  
  // Login function
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { user: userData } = await authAPI.login({ email, password });
      setUser(userData);
      
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
      console.error('Login failed', err);
      
      const errorMessage = err.response?.data?.error?.message || 
                           'Login failed. Please check your credentials.';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Login with biometrics
  const loginWithBiometrics = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // First, check if biometric login is enabled
      const enabled = await biometricService.isBiometricLoginEnabled();
      if (!enabled) {
        setError('Biometric login is not enabled');
        return;
      }
      
      // Authenticate with biometrics
      const success = await biometricService.authenticateWithBiometrics(
        'Sign in to BookmarkAI'
      );
      
      if (!success) {
        setError('Biometric authentication failed');
        return;
      }
      
      // Get the stored user ID
      const userId = await biometricService.getBiometricUserId();
      if (!userId) {
        setError('User ID not found for biometric login');
        return;
      }
      
      // Get user data
      // This is simplified - in a real app, you'd have an endpoint to login with userId
      // or use the stored tokens
      const userData = await authAPI.getUserProfile();
      if (userData) {
        setUser(userData);
      } else {
        setError('Failed to retrieve user data');
      }
    } catch (err: any) {
      console.error('Biometric login failed', err);
      const errorMessage = err.response?.data?.error?.message || 
                           'Biometric login failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Register function
  const register = async (email: string, name: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Starting registration process:', { email, name });
      const { user: userData } = await authAPI.register({ email, name, password });
      console.log('Registration successful:', userData);
      setUser(userData);
    } catch (err: any) {
      console.error('Registration failed', err);
      
      // Extract error message from response if available
      let errorMessage = 'Registration failed. Please try again.';
      
      if (err.response?.data?.error?.message) {
        errorMessage = err.response.data.error.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      console.log('Setting error message:', errorMessage);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Logout function
  const logout = async () => {
    setIsLoading(true);
    
    try {
      await authAPI.logout();
      setUser(null);
    } catch (err) {
      console.error('Logout failed', err);
      // Even if the server-side logout fails, we still want to clear local data
      setUser(null);
      await clearTokens();
    } finally {
      setIsLoading(false);
    }
  };
  
  // Request password reset
  const resetPassword = async (email: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await authAPI.requestPasswordReset(email);
    } catch (err: any) {
      console.error('Password reset request failed', err);
      
      const errorMessage = err.response?.data?.error?.message || 
                           'Password reset failed. Please try again.';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Enable biometric login
  const enableBiometrics = async (): Promise<boolean> => {
    if (!user) {
      setError('You must be logged in to enable biometric login');
      return false;
    }
    
    try {
      // Enable biometric login with the user ID
      const success = await biometricService.enableBiometricLogin(user.id);
      
      if (success) {
        setIsBiometricsEnabled(true);
      }
      
      return success;
    } catch (err) {
      console.error('Failed to enable biometrics:', err);
      setError('Failed to enable biometric login. Please try again.');
      return false;
    }
  };
  
  // Disable biometric login
  const disableBiometrics = async (): Promise<boolean> => {
    try {
      const success = await biometricService.disableBiometricLogin();
      
      if (success) {
        setIsBiometricsEnabled(false);
      }
      
      return success;
    } catch (err) {
      console.error('Failed to disable biometrics:', err);
      setError('Failed to disable biometric login. Please try again.');
      return false;
    }
  };
  
  // Create context value
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