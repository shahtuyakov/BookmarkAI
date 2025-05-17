import React, { createContext, useContext, useState, useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { getAccessToken } from '../services/api/client';
import { authAPI, User } from '../services/api/auth';

// Interface for Auth Context
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

// Create context with default values
const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: false,
  error: null,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  resetPassword: async () => {},
});

// Hook to use the auth context
export const useAuth = () => useContext(AuthContext);

// Auth Provider component
export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Check for existing session on app start
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await getAccessToken();
        
        if (token) {
          // If we have a token, fetch the user profile
          const userData = await authAPI.getUserProfile();
          setUser(userData);
        }
      } catch (err) {
        console.error('Auth check failed', err);
        setError('Session expired. Please login again.');
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
    
    // Use React Native's DeviceEventEmitter instead of window.addEventListener
    DeviceEventEmitter.addListener('auth-error', handleAuthError);
    
    return () => {
      // Clean up the event listener
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
  
  // Register function
  const register = async (email: string, name: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { user: userData } = await authAPI.register({ email, name, password });
      setUser(userData);
    } catch (err: any) {
      console.error('Registration failed', err);
      
      const errorMessage = err.response?.data?.error?.message || 
                           'Registration failed. Please try again.';
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
  
  // Create context value
  const value = {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    resetPassword,
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
