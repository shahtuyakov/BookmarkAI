// src/services/api/auth.ts
import apiClient, { saveTokens, clearTokens, getTokens } from './client';

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
  user?: User; // Make this optional since your server might not include it
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ConfirmResetRequest {
  token: string;
  password: string;
}

// Auth API functions
export const authAPI = {
  // Login
  login: async (credentials: LoginRequest) => {
    console.log('Attempting login with:', credentials.email);
    try {
      const response = await apiClient.post<{data: AuthResponse}>('/auth/login', credentials);
      console.log('Full login response:', response.data);
      
      const { accessToken, refreshToken } = response.data.data;
      
      // If the server doesn't return user info directly, we'll fetch it
      let user: User;
      
      if (response.data.data.user) {
        // If user data is included in the response
        user = response.data.data.user;
        console.log('Login successful with user data from response:', user);
      } else {
        // If user data isn't included, fetch it separately using the new token
        console.log('No user data in response, fetching profile...');
        await saveTokens(accessToken, refreshToken);
        user = await authAPI.getUserProfile();
        console.log('Fetched user profile:', user);
      }
      
      await saveTokens(accessToken, refreshToken);
      return { user };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },
  
  // Register
  register: async (userData: RegisterRequest) => {
    console.log('Attempting registration with:', userData.email);
    try {
      const response = await apiClient.post<{data: AuthResponse}>('/auth/register', userData);
      console.log('Full registration response:', response.data);
      
      const { accessToken, refreshToken } = response.data.data;
      
      // If the server doesn't return user info directly, we'll fetch it
      let user: User;
      
      if (response.data.data.user) {
        // If user data is included in the response
        user = response.data.data.user;
        console.log('Registration successful with user data from response:', user);
      } else {
        // If user data isn't included, fetch it separately
        console.log('No user data in response, fetching profile...');
        await saveTokens(accessToken, refreshToken);
        user = await authAPI.getUserProfile();
        console.log('Fetched user profile:', user);
      }
      
      await saveTokens(accessToken, refreshToken);
      return { user };
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  },
  
  // Logout
    logout: async () => {
      try {
        // Get the refresh token from storage
        const tokens = await getTokens();
        
        // Call the backend to invalidate token, including the refresh token
        if (tokens?.refreshToken) {
          await apiClient.post('/auth/logout', { refreshToken: tokens.refreshToken });
        } else {
          await apiClient.post('/auth/logout');
        }
      } catch (error) {
        console.error('Error logging out from server', error);
      }
      
      // Always clear local tokens regardless of server response
      await clearTokens();
  },
  
  // Get user profile
  getUserProfile: async () => {
    console.log('Fetching user profile...');
    const response = await apiClient.get<{data: User}>('/auth/profile');
    console.log('User profile response:', response.data);
    return response.data.data;
  },
  
  // Request password reset
  requestPasswordReset: async (email: string) => {
    await apiClient.post('/auth/forgot-password', { email });
  },
  
  // Reset password with token
  resetPassword: async (data: ConfirmResetRequest) => {
    await apiClient.post('/auth/reset-password', data);
  },
  
  // Refresh token
  refreshToken: async (refreshToken: string) => {
    const response = await apiClient.post<{data: AuthResponse}>('/auth/refresh', { refreshToken });
    const { accessToken, refreshToken: newRefreshToken } = response.data.data;
    await saveTokens(accessToken, newRefreshToken);
    return { accessToken, refreshToken: newRefreshToken };
  },
};