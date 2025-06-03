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
    const response = await this.client.request<LoginResponse>({
      url: '/auth/login',
      method: 'POST',
      data: credentials,
    });

    // Automatically set tokens in the client
    await this.client.setTokens({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
    });

    return response.data;
  }

  /**
   * Refresh access token
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const response = await this.client.request<TokenPair>({
      url: '/auth/refresh',
      method: 'POST',
      data: { refreshToken },
    });

    return response.data;
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
    const response = await this.client.request<User>({
      url: '/auth/me',
      method: 'GET',
    });

    return response.data;
  }
}