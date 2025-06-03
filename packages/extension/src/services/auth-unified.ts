import { AuthService } from './auth';
import { AuthSDKService } from './auth-sdk';
import { getFeatureFlag } from '../config/features';
import type {
  AuthState,
  LoginCredentials,
  UserProfile,
} from '../types/auth';

/**
 * Unified auth service that delegates to either the legacy AuthService
 * or the new SDK-based AuthSDKService based on feature flag
 */
export class UnifiedAuthService {
  private static instance: UnifiedAuthService;
  private legacyService: AuthService;
  private sdkService: AuthSDKService;
  private useSDK: boolean = false;

  private constructor() {
    this.legacyService = AuthService.getInstance();
    this.sdkService = AuthSDKService.getInstance();
    this.initializeService();
  }

  static getInstance(): UnifiedAuthService {
    if (!UnifiedAuthService.instance) {
      UnifiedAuthService.instance = new UnifiedAuthService();
    }
    return UnifiedAuthService.instance;
  }

  private async initializeService(): Promise<void> {
    // Check feature flag
    this.useSDK = await getFeatureFlag('USE_SDK_AUTH');
    
    // If using SDK, migrate existing tokens
    if (this.useSDK && await getFeatureFlag('MIGRATE_TOKENS')) {
      await this.sdkService.migrateExistingTokens();
    }
    
    console.log(`[UnifiedAuthService] Using ${this.useSDK ? 'SDK' : 'Legacy'} authentication`);
  }

  private get activeService(): AuthService | AuthSDKService {
    return this.useSDK ? this.sdkService : this.legacyService;
  }

  /**
   * Ensure initialization is complete
   */
  async ensureInitialized(): Promise<void> {
    await this.activeService.ensureInitialized();
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<void> {
    return this.activeService.login(credentials);
  }

  /**
   * Logout and clear auth state
   */
  async logout(): Promise<void> {
    return this.activeService.logout();
  }

  /**
   * Get a valid access token
   */
  async getValidAccessToken(): Promise<string | null> {
    return this.activeService.getValidAccessToken();
  }

  /**
   * Get current auth state
   */
  getAuthState(): AuthState {
    return this.activeService.getAuthState();
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    if (this.useSDK) {
      return (this.activeService as AuthSDKService).isAuthenticated();
    } else {
      return (this.activeService as AuthService).isAuthenticated();
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<UserProfile | null> {
    if (this.useSDK) {
      return (this.activeService as AuthSDKService).getCurrentUser();
    } else {
      // Legacy service doesn't have this method, get from state
      const state = this.getAuthState();
      return state.user;
    }
  }

  /**
   * Refresh the access token (legacy only)
   */
  async refreshToken(): Promise<string> {
    if (!this.useSDK) {
      return (this.activeService as AuthService).refreshToken();
    }
    // SDK handles refresh automatically
    const token = await this.getValidAccessToken();
    if (!token) {
      throw new Error('Failed to refresh token');
    }
    return token;
  }

  /**
   * Switch between SDK and legacy auth (for testing)
   */
  async switchAuthMode(useSDK: boolean): Promise<void> {
    if (this.useSDK !== useSDK) {
      this.useSDK = useSDK;
      console.log(`[UnifiedAuthService] Switched to ${useSDK ? 'SDK' : 'Legacy'} authentication`);
      
      // Re-initialize the appropriate service
      await this.activeService.ensureInitialized();
    }
  }
}

// Export singleton instance for convenience
export const authService = UnifiedAuthService.getInstance();