import { BookmarkAIClient } from '../client';
import { TokenPair } from './auth.service';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse extends TokenPair {
  user: User;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

export class AuthApiService {
  constructor(private client: BookmarkAIClient) {}

  /**
   * Login with email and password
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.request<any>({
      url: '/auth/login',
      method: 'POST',
      data: credentials,
    });

    // Handle nested response structure: { data: { data: { accessToken, refreshToken, user } } }
    const loginData = response.data.data || response.data;
    
    if (!loginData.accessToken || !loginData.refreshToken) {
      throw new Error('Invalid login response: missing tokens');
    }

    // Automatically set tokens in the client
    await this.client.setTokens({
      accessToken: loginData.accessToken,
      refreshToken: loginData.refreshToken,
    });

    return loginData;
  }

  /**
   * Refresh access token
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const response = await this.client.request<any>({
      url: '/auth/refresh',
      method: 'POST',
      data: { refreshToken },
    });

    // Handle nested response structure
    const tokenData = response.data.data || response.data;
    return tokenData;
  }

  /**
   * Logout the current user
   */
  async logout(): Promise<void> {
    try {
      await this.client.request({
        url: '/auth/logout',
        method: 'POST',
      });
    } finally {
      // Always clear local tokens, even if server request fails
      await this.client.logout();
    }
  }

  /**
   * Get current user info (requires authentication)
   */
  async getCurrentUser(): Promise<User> {
    const response = await this.client.request<any>({
      url: '/auth/me',
      method: 'GET',
    });

    // Handle nested response structure
    const userData = response.data.data || response.data;
    return userData;
  }
}