import apiClient, { saveTokens, clearTokens } from './client';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
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
    const response = await apiClient.post<{data: AuthResponse}>('/auth/login', credentials);
    const { accessToken, refreshToken, user } = response.data.data;
    await saveTokens(accessToken, refreshToken);
    return { user };
  },
  
  // Register
  register: async (userData: RegisterRequest) => {
    const response = await apiClient.post<{data: AuthResponse}>('/auth/register', userData);
    const { accessToken, refreshToken, user } = response.data.data;
    await saveTokens(accessToken, refreshToken);
    return { user };
  },
  
  // Logout
  logout: async () => {
    try {
      // Call the backend to invalidate token
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Error logging out from server', error);
    }
    
    // Always clear local tokens regardless of server response
    await clearTokens();
  },
  
  // Get user profile
  getUserProfile: async () => {
    const response = await apiClient.get<{data: User}>('/auth/profile');
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
};
