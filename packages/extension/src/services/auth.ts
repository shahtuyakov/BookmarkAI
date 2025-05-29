import browser from 'webextension-polyfill';
import type {
  AuthState,
  AuthTokens,
  LoginCredentials,
  LoginResponse,
  RefreshTokenResponse,
  UserProfile,
} from '../types/auth';
import { AUTH_CONFIG, STORAGE_KEYS, AUTH_CONSTANTS, createAuthError } from '../config/auth';

/**
 * AuthService handles direct login authentication
 * This is a singleton service that manages auth state in the extension
 */
export class AuthService {
  private static instance: AuthService;
  private authState: AuthState = {
    isAuthenticated: false,
    user: null,
    isLoading: false,
  };
  private initPromise: Promise<void>;

  private constructor() {
    this.initPromise = this.restoreAuthState();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Ensure initialization is complete
   */
  async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<void> {
    this.updateAuthState({ isLoading: true, error: undefined });

    try {
      const response = await fetch(AUTH_CONFIG.loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw createAuthError(
          errorData.message || `Login failed: ${response.statusText}`,
          response.status
        );
      }

      const data: LoginResponse = await response.json();
      console.log('BookmarkAI: Login API response:', data);
      console.log('BookmarkAI: API response data field:', data.data);

      // Calculate token expiration
      const expiresAt = Date.now() + 3600 * 1000; // Default 1 hour if not provided

      // Extract tokens from the nested data structure
      const tokenData = data.data || data;
      const tokens: AuthTokens = {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt,
        tokenType: 'Bearer',
      };
      
      console.log('BookmarkAI: Tokens created:', tokens);

      // Update auth state
      this.updateAuthState({
        isAuthenticated: true,
        user: tokenData.user,
        tokens,
        isLoading: false,
      });

      // Store auth data
      await this.storeAuthData(tokens, tokenData.user);

      // Notify other parts of the extension
      this.notifyAuthStateChange();
    } catch (error) {
      const authError = error instanceof Error ? error.message : 'Login failed';
      this.updateAuthState({
        isAuthenticated: false,
        user: null,
        tokens: undefined,
        isLoading: false,
        error: authError,
      });
      throw error;
    }
  }

  /**
   * Logout and clear auth state
   */
  async logout(): Promise<void> {
    // Clear stored auth data
    await browser.storage.local.remove([
      STORAGE_KEYS.AUTH_TOKENS,
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.AUTH_STATE,
    ]);

    // Reset auth state
    this.authState = {
      isAuthenticated: false,
      user: null,
      isLoading: false,
    };

    // Notify other parts of the extension
    this.notifyAuthStateChange();
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshToken(): Promise<string> {
    const { tokens } = this.authState;
    if (!tokens?.refreshToken) {
      throw createAuthError('No refresh token available');
    }

    try {
      const response = await fetch(AUTH_CONFIG.refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: tokens.refreshToken,
        }),
      });

      if (!response.ok) {
        throw createAuthError('Token refresh failed', response.status);
      }

      const data: RefreshTokenResponse = await response.json();

      // Update tokens
      const newTokens: AuthTokens = {
        ...tokens,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || tokens.refreshToken,
        expiresAt: Date.now() + 3600 * 1000, // Default 1 hour
      };

      // Update auth state
      this.updateAuthState({ tokens: newTokens });

      // Store updated tokens
      await browser.storage.local.set({
        [STORAGE_KEYS.AUTH_TOKENS]: newTokens,
      });

      return newTokens.accessToken;
    } catch (error) {
      // If refresh fails, logout
      await this.logout();
      throw error;
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidAccessToken(): Promise<string | null> {
    const { tokens, isAuthenticated } = this.authState;

    if (!isAuthenticated || !tokens) {
      return null;
    }

    // Check if token is expired or about to expire
    const now = Date.now();
    const isExpired = tokens.expiresAt <= now + AUTH_CONSTANTS.TOKEN_REFRESH_BUFFER;

    if (isExpired && tokens.refreshToken) {
      try {
        return await this.refreshToken();
      } catch (error) {
        console.error('Failed to refresh token:', error);
        return null;
      }
    }

    return tokens.accessToken;
  }

  /**
   * Get current auth state
   */
  getAuthState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.authState.isAuthenticated;
  }

  /**
   * Restore auth state from storage
   */
  private async restoreAuthState(): Promise<void> {
    try {
      const stored = await browser.storage.local.get([
        STORAGE_KEYS.AUTH_TOKENS,
        STORAGE_KEYS.USER_PROFILE,
      ]);

      const tokens = stored[STORAGE_KEYS.AUTH_TOKENS] as AuthTokens | undefined;
      const user = stored[STORAGE_KEYS.USER_PROFILE] as UserProfile | undefined;

      if (tokens && user) {
        // Check if tokens are still valid
        const isExpired = tokens.expiresAt <= Date.now();
        
        if (!isExpired) {
          this.authState = {
            isAuthenticated: true,
            user,
            tokens,
            isLoading: false,
          };
        } else if (tokens.refreshToken) {
          // Try to refresh
          try {
            await this.refreshToken();
          } catch (error) {
            console.error('Failed to refresh token on restore:', error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to restore auth state:', error);
    }
  }

  /**
   * Store auth data in browser storage
   */
  private async storeAuthData(tokens: AuthTokens, user: UserProfile): Promise<void> {
    await browser.storage.local.set({
      [STORAGE_KEYS.AUTH_TOKENS]: tokens,
      [STORAGE_KEYS.USER_PROFILE]: user,
      [STORAGE_KEYS.AUTH_STATE]: {
        isAuthenticated: true,
        user,
      },
    });
  }

  /**
   * Update auth state
   */
  private updateAuthState(updates: Partial<AuthState>): void {
    this.authState = {
      ...this.authState,
      ...updates,
    };
  }

  /**
   * Notify other parts of the extension about auth state changes
   */
  private notifyAuthStateChange(): void {
    browser.runtime.sendMessage({
      type: 'AUTH_STATE_CHANGED',
      authState: this.getAuthState(),
    }).catch(() => {
      // Ignore errors if no listeners
    });
  }
}