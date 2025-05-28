import browser from 'webextension-polyfill';
import type { AuthTokens, PKCEData, AuthState, UserProfile, TokenRefreshResponse } from '../types/auth';
import { generatePKCEData, validateState } from '../utils/pkce';
import { getOAuthConfig, STORAGE_KEYS } from '../config/oauth';

export class AuthService {
  private static instance: AuthService;
  private authState: AuthState = {
    isAuthenticated: false,
    isLoading: false,
  };

  private constructor() {
    // Initialize and restore auth state from storage
    this.restoreAuthState();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Initiate PKCE OAuth flow
   */
  async initiateLogin(): Promise<void> {
    try {
      this.setLoading(true);
      
      const pkceData = await generatePKCEData();
      const config = getOAuthConfig();
      
      // Store PKCE data for callback verification
      await this.storePKCEData(pkceData);
      
      // Build authorization URL
      const authUrl = new URL(config.authUrl);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', config.redirectUri);
      authUrl.searchParams.set('scope', config.scopes.join(' '));
      authUrl.searchParams.set('state', pkceData.state);
      authUrl.searchParams.set('code_challenge', pkceData.codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      
      // Open authorization window
      await browser.tabs.create({ url: authUrl.toString() });
      
    } catch (error) {
      console.error('AuthService: Failed to initiate login:', error);
      this.setError('Failed to start authentication process');
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Handle OAuth callback with authorization code
   */
  async handleCallback(code: string, state: string): Promise<boolean> {
    try {
      this.setLoading(true);
      
      // Retrieve stored PKCE data
      const pkceData = await this.getPKCEData();
      if (!pkceData) {
        throw new Error('No PKCE data found');
      }
      
      // Validate state parameter
      if (!validateState(state, pkceData.state)) {
        throw new Error('Invalid state parameter');
      }
      
      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(code, pkceData.codeVerifier);
      
      // Store tokens securely
      await this.storeTokens(tokens);
      
      // Fetch user profile
      const user = await this.fetchUserProfile(tokens.accessToken);
      await this.storeUserProfile(user);
      
      // Update auth state
      this.authState = {
        isAuthenticated: true,
        user,
        tokens,
        isLoading: false,
      };
      
      // Clean up PKCE data
      await this.clearPKCEData();
      
      return true;
      
    } catch (error) {
      console.error('AuthService: Callback handling failed:', error);
      this.setError('Authentication failed');
      return false;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<AuthTokens> {
    const config = getOAuthConfig();
    
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }
    
    const data: TokenRefreshResponse = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || '',
      expiresAt: Date.now() + (data.expires_in * 1000),
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(): Promise<boolean> {
    try {
      const tokens = await this.getStoredTokens();
      if (!tokens?.refreshToken) {
        throw new Error('No refresh token available');
      }
      
      const config = getOAuthConfig();
      
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: config.clientId,
          refresh_token: tokens.refreshToken,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }
      
      const data: TokenRefreshResponse = await response.json();
      
      const newTokens: AuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || tokens.refreshToken,
        expiresAt: Date.now() + (data.expires_in * 1000),
        tokenType: data.token_type,
        scope: data.scope,
      };
      
      await this.storeTokens(newTokens);
      this.authState.tokens = newTokens;
      
      return true;
      
    } catch (error) {
      console.error('AuthService: Token refresh failed:', error);
      await this.logout();
      return false;
    }
  }

  /**
   * Fetch user profile from API
   */
  private async fetchUserProfile(accessToken: string): Promise<UserProfile> {
    const config = getOAuthConfig();
    const profileUrl = config.authUrl.replace('/oauth/authorize', '/api/v1/user/profile');
    
    const response = await fetch(profileUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Profile fetch failed: ${response.status}`);
    }
    
    return response.json();
  }

  /**
   * Get current authentication state
   */
  getAuthState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Check if user is authenticated and token is valid
   */
  async isAuthenticated(): Promise<boolean> {
    const tokens = await this.getStoredTokens();
    
    if (!tokens) {
      return false;
    }
    
    // Check if token is expired
    if (Date.now() >= tokens.expiresAt) {
      // Try to refresh
      const refreshed = await this.refreshToken();
      return refreshed;
    }
    
    return true;
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(): Promise<string | null> {
    const isAuth = await this.isAuthenticated();
    
    if (!isAuth) {
      return null;
    }
    
    const tokens = await this.getStoredTokens();
    return tokens?.accessToken || null;
  }

  /**
   * Logout and clear all stored data
   */
  async logout(): Promise<void> {
    await browser.storage.local.remove([
      STORAGE_KEYS.AUTH_TOKENS,
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.AUTH_STATE,
    ]);
    
    this.authState = {
      isAuthenticated: false,
      isLoading: false,
    };
  }

  /**
   * Storage operations
   */
  private async storeTokens(tokens: AuthTokens): Promise<void> {
    await browser.storage.local.set({
      [STORAGE_KEYS.AUTH_TOKENS]: tokens,
    });
  }

  private async getStoredTokens(): Promise<AuthTokens | null> {
    const result = await browser.storage.local.get(STORAGE_KEYS.AUTH_TOKENS);
    return result[STORAGE_KEYS.AUTH_TOKENS] || null;
  }

  private async storeUserProfile(user: UserProfile): Promise<void> {
    await browser.storage.local.set({
      [STORAGE_KEYS.USER_PROFILE]: user,
    });
  }

  private async getStoredUserProfile(): Promise<UserProfile | null> {
    const result = await browser.storage.local.get(STORAGE_KEYS.USER_PROFILE);
    return result[STORAGE_KEYS.USER_PROFILE] || null;
  }

  private async storePKCEData(pkceData: PKCEData): Promise<void> {
    await browser.storage.local.set({
      [STORAGE_KEYS.PKCE_DATA]: pkceData,
    });
  }

  private async getPKCEData(): Promise<PKCEData | null> {
    const result = await browser.storage.local.get(STORAGE_KEYS.PKCE_DATA);
    return result[STORAGE_KEYS.PKCE_DATA] || null;
  }

  private async clearPKCEData(): Promise<void> {
    await browser.storage.local.remove(STORAGE_KEYS.PKCE_DATA);
  }

  private async restoreAuthState(): Promise<void> {
    try {
      const [tokens, user] = await Promise.all([
        this.getStoredTokens(),
        this.getStoredUserProfile(),
      ]);
      
      if (tokens && user) {
        this.authState = {
          isAuthenticated: true,
          user,
          tokens,
          isLoading: false,
        };
      }
    } catch (error) {
      console.error('AuthService: Failed to restore auth state:', error);
    }
  }

  private setLoading(isLoading: boolean): void {
    this.authState.isLoading = isLoading;
    this.authState.error = undefined;
  }

  private setError(error: string): void {
    this.authState.error = error;
    this.authState.isLoading = false;
  }
} 