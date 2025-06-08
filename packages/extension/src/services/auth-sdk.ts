import { sdkClient } from '../sdk/client';
import type {
  AuthState,
  AuthTokens,
  LoginCredentials,
  UserProfile,
} from '../types/auth';
import browser from 'webextension-polyfill';
import { STORAGE_KEYS } from '../config/auth';

/**
 * AuthSDKService wraps the BookmarkAI SDK auth functionality
 * for use in the browser extension, maintaining backward compatibility
 * with the existing AuthService interface.
 */
export class AuthSDKService {
  private static instance: AuthSDKService;
  private authState: AuthState = {
    isAuthenticated: false,
    user: null,
    isLoading: false,
  };
  private initPromise: Promise<void>;

  private constructor() {
    this.initPromise = this.restoreAuthState();
  }

  static getInstance(): AuthSDKService {
    if (!AuthSDKService.instance) {
      AuthSDKService.instance = new AuthSDKService();
    }
    return AuthSDKService.instance;
  }

  /**
   * Ensure initialization is complete
   */
  async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Login with email and password using SDK
   */
  async login(credentials: LoginCredentials): Promise<void> {
    this.updateAuthState({ isLoading: true, error: undefined });

    try {
      // Use SDK to login
      const response = await sdkClient.auth.login({
        email: credentials.email,
        password: credentials.password,
      });

      // SDK handles token storage automatically
      // Update our local auth state
      this.updateAuthState({
        isAuthenticated: true,
        user: response.user,
        isLoading: false,
      });

      // Store user profile for backward compatibility
      await browser.storage.local.set({
        [STORAGE_KEYS.USER_PROFILE]: response.user,
      });

      // Notify other parts of the extension
      this.notifyAuthStateChange();
    } catch (error) {
      const authError = error instanceof Error ? error.message : 'Login failed';
      this.updateAuthState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: authError,
      });
      throw error;
    }
  }

  /**
   * Logout and clear auth state using SDK
   */
  async logout(): Promise<void> {
    try {
      // Use SDK to logout
      await sdkClient.auth.logout();
    } catch (error) {
      console.error('SDK logout error:', error);
    }

    // Clear browser storage for backward compatibility
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
   * Get a valid access token using SDK
   */
  async getValidAccessToken(): Promise<string | null> {
    try {
      // SDK handles token refresh automatically
      const isAuth = await sdkClient.isAuthenticated();
      if (!isAuth) {
        return null;
      }

      // Get token directly from SDK client
      const token = await sdkClient.getAccessToken();
      return token;
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
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
  async isAuthenticated(): Promise<boolean> {
    try {
      return await sdkClient.isAuthenticated();
    } catch {
      return false;
    }
  }

  /**
   * Get current user from SDK
   */
  async getCurrentUser(): Promise<UserProfile | null> {
    try {
      const user = await sdkClient.auth.getCurrentUser();
      return user;
    } catch {
      return null;
    }
  }

  /**
   * Restore auth state from SDK
   */
  private async restoreAuthState(): Promise<void> {
    try {
      // Check if authenticated via SDK
      const isAuth = await sdkClient.isAuthenticated();
      
      if (isAuth) {
        // Get current user from SDK
        const user = await sdkClient.auth.getCurrentUser();
        
        if (user) {
          this.authState = {
            isAuthenticated: true,
            user,
            isLoading: false,
          };

          // Store in browser storage for backward compatibility
          await browser.storage.local.set({
            [STORAGE_KEYS.USER_PROFILE]: user,
          });
        }
      }
    } catch (error) {
      console.error('Failed to restore auth state:', error);
    }
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

  /**
   * Migration helper: Import existing tokens into SDK
   */
  async migrateExistingTokens(): Promise<void> {
    try {
      const stored = await browser.storage.local.get([STORAGE_KEYS.AUTH_TOKENS]);
      const tokens = stored[STORAGE_KEYS.AUTH_TOKENS] as AuthTokens | undefined;
      
      if (tokens && tokens.accessToken && tokens.refreshToken) {
        // The SDK will pick up tokens from storage automatically
        // since we're using the same storage adapter with the same prefix
        console.log('Existing tokens found, SDK will use them automatically');
      }
    } catch (error) {
      console.error('Failed to check existing tokens:', error);
    }
  }
}