import { StorageAdapter } from '../adapters/types';
import { SingleFlight } from '../utils/singleflight';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthConfig {
  storage: StorageAdapter;
  onTokenRefresh?: (tokens: TokenPair) => void;
  tokenRefreshMargin?: number; // Refresh tokens X ms before expiry (default: 5 minutes)
}

interface StoredTokens extends TokenPair {
  accessTokenExpiry?: number;
  refreshTokenExpiry?: number;
}

export class AuthService {
  private static readonly ACCESS_TOKEN_KEY = 'bookmarkai_access_token';
  private static readonly REFRESH_TOKEN_KEY = 'bookmarkai_refresh_token';
  private static readonly TOKEN_EXPIRY_KEY = 'bookmarkai_token_expiry';
  
  private singleflight = new SingleFlight<TokenPair>();
  private tokenRefreshMargin: number;
  private refreshTimer?: NodeJS.Timeout;

  constructor(
    private config: AuthConfig,
    private refreshTokenFn: (refreshToken: string) => Promise<TokenPair>
  ) {
    this.tokenRefreshMargin = config.tokenRefreshMargin || 5 * 60 * 1000; // 5 minutes
    this.scheduleTokenRefresh();
  }

  /**
   * Get the current access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.getStoredTokens();
    
    if (!tokens) {
      return null;
    }

    // Check if token needs refresh
    if (this.shouldRefreshToken(tokens)) {
      try {
        const newTokens = await this.refreshTokens();
        return newTokens.accessToken;
      } catch (error) {
        console.error('Failed to refresh token:', error);
        // Return existing token and let request fail with 401
        return tokens.accessToken;
      }
    }

    return tokens.accessToken;
  }

  /**
   * Store new tokens
   */
  async setTokens(tokens: TokenPair, expiresIn?: number): Promise<void> {
    const accessTokenExpiry = expiresIn 
      ? Date.now() + (expiresIn * 1000) 
      : Date.now() + (15 * 60 * 1000); // Default 15 minutes

    const storedTokens: StoredTokens = {
      ...tokens,
      accessTokenExpiry,
      refreshTokenExpiry: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
    };

    await Promise.all([
      this.config.storage.setItem(
        AuthService.ACCESS_TOKEN_KEY, 
        storedTokens.accessToken
      ),
      this.config.storage.setItem(
        AuthService.REFRESH_TOKEN_KEY, 
        storedTokens.refreshToken
      ),
      this.config.storage.setItem(
        AuthService.TOKEN_EXPIRY_KEY, 
        JSON.stringify({
          accessTokenExpiry: storedTokens.accessTokenExpiry,
          refreshTokenExpiry: storedTokens.refreshTokenExpiry,
        })
      ),
    ]);

    // Notify listeners
    if (this.config.onTokenRefresh) {
      this.config.onTokenRefresh(tokens);
    }

    // Schedule next refresh
    this.scheduleTokenRefresh();
  }

  /**
   * Refresh tokens using singleflight pattern
   */
  async refreshTokens(): Promise<TokenPair> {
    return this.singleflight.do('refresh', async () => {
      const tokens = await this.getStoredTokens();
      if (!tokens?.refreshToken) {
        throw new Error('No refresh token available');
      }

      // Check if refresh token is expired
      if (tokens.refreshTokenExpiry && Date.now() > tokens.refreshTokenExpiry) {
        await this.clearTokens();
        throw new Error('Refresh token expired');
      }

      try {
        const newTokens = await this.refreshTokenFn(tokens.refreshToken);
        await this.setTokens(newTokens);
        return newTokens;
      } catch (error) {
        // If refresh fails, clear tokens
        await this.clearTokens();
        throw error;
      }
    });
  }

  /**
   * Clear all stored tokens
   */
  async clearTokens(): Promise<void> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    await Promise.all([
      this.config.storage.removeItem(AuthService.ACCESS_TOKEN_KEY),
      this.config.storage.removeItem(AuthService.REFRESH_TOKEN_KEY),
      this.config.storage.removeItem(AuthService.TOKEN_EXPIRY_KEY),
    ]);
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const tokens = await this.getStoredTokens();
    return !!(tokens?.accessToken && tokens?.refreshToken);
  }

  /**
   * Get stored tokens with expiry information
   */
  private async getStoredTokens(): Promise<StoredTokens | null> {
    const [accessToken, refreshToken, expiryData] = await Promise.all([
      this.config.storage.getItem(AuthService.ACCESS_TOKEN_KEY),
      this.config.storage.getItem(AuthService.REFRESH_TOKEN_KEY),
      this.config.storage.getItem(AuthService.TOKEN_EXPIRY_KEY),
    ]);

    if (!accessToken || !refreshToken) {
      return null;
    }

    let expiry = { accessTokenExpiry: 0, refreshTokenExpiry: 0 };
    if (expiryData) {
      try {
        expiry = JSON.parse(expiryData);
      } catch {
        // Ignore parse errors
      }
    }

    return {
      accessToken,
      refreshToken,
      ...expiry,
    };
  }

  /**
   * Check if token should be refreshed
   */
  private shouldRefreshToken(tokens: StoredTokens): boolean {
    if (!tokens.accessTokenExpiry) {
      return false; // No expiry info, don't refresh
    }

    const now = Date.now();
    const expiryWithMargin = tokens.accessTokenExpiry - this.tokenRefreshMargin;
    
    return now >= expiryWithMargin;
  }

  /**
   * Schedule automatic token refresh
   */
  private async scheduleTokenRefresh(): Promise<void> {
    // Clear any existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const tokens = await this.getStoredTokens();
    if (!tokens?.accessTokenExpiry) {
      return;
    }

    // Calculate when to refresh (with margin)
    const refreshAt = tokens.accessTokenExpiry - this.tokenRefreshMargin - Date.now();
    
    if (refreshAt > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTokens().catch(error => {
          console.error('Scheduled token refresh failed:', error);
        });
      }, refreshAt);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.singleflight.clear();
  }
}