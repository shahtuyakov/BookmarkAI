import browser from 'webextension-polyfill';
import type { AuthTokens, PKCEData, AuthState, UserProfile, TokenRefreshResponse, OAuthError } from '../types/auth';
import { generatePKCEData, validateState } from '../utils/pkce';
import { OAUTH_CONFIG, STORAGE_KEYS } from '../config/oauth';

export class AuthService {
  private static instance: AuthService;
  private authState: AuthState;
  private isInitialized: boolean = false;
  private restorationPromise: Promise<void> | null = null;

  private constructor() {
    this.authState = {
      isAuthenticated: false,
      user: null,
      tokens: undefined,
      isLoading: true,
      error: undefined,
    };
    this.restorationPromise = this.restoreAuthStateInternal();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private setLoading(isLoading: boolean): void {
    if (this.authState.isLoading !== isLoading) {
      this.authState.isLoading = isLoading;
      this.notifyAuthStateChange();
    }
  }

  private async restoreAuthStateInternal(): Promise<void> {
    console.log('AuthService: Restoring auth state...');
    this.setLoading(true);
    try {
      const storedState = await browser.storage.local.get(STORAGE_KEYS.AUTH_STATE);
      if (storedState && storedState[STORAGE_KEYS.AUTH_STATE]) {
        const retrievedState = storedState[STORAGE_KEYS.AUTH_STATE] as AuthState;
        this.authState = {
            ...retrievedState,
            user: retrievedState.user || null,
            isLoading: true,
        };
        console.log('AuthService: Auth state restored from storage:', this.authState);
        
        if (this.authState.tokens) {
          if (Date.now() >= this.authState.tokens.expiresAt) {
            console.log('AuthService: Access token expired, attempting refresh...');
            try {
              await this.refreshTokenInternal();
            } catch (refreshError) {
              console.error('AuthService: Failed to refresh token on restore, logging out:', refreshError);
              this.authState = { isAuthenticated: false, user: null, tokens: undefined, isLoading: false, error: 'Session expired, please login again.' };
              await this.clearStoredAuthState();
            }
          } else {
            this.authState.isAuthenticated = true;
          }
        } else {
           this.authState.isAuthenticated = false;
           this.authState.user = null;
        }
      } else {
        console.log('AuthService: No stored auth state found.');
        this.authState = { isAuthenticated: false, user: null, tokens: undefined, isLoading: false, error: undefined };
      }
    } catch (error) {
      console.error('AuthService: Error restoring auth state:', error);
      this.authState = { isAuthenticated: false, user: null, tokens: undefined, isLoading: false, error: 'Failed to restore session' };
    } finally {
      this.isInitialized = true;
      this.setLoading(false);
      this.notifyAuthStateChange();
    }
  }
  
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized && this.restorationPromise) {
      await this.restorationPromise;
    }
  }

  public getAuthState(): AuthState {
    return { ...this.authState };
  }

  private async storeAuthState(): Promise<void> {
    try {
      await browser.storage.local.set({ [STORAGE_KEYS.AUTH_STATE]: { ...this.authState, isLoading: false } });
      console.log('AuthService: Auth state persisted.');
    } catch (error) {
      console.error('AuthService: Error storing auth state:', error);
    }
  }

  private async clearStoredAuthState(): Promise<void> {
    try {
      await browser.storage.local.remove(STORAGE_KEYS.AUTH_STATE);
      console.log('AuthService: Stored auth state cleared.');
    } catch (error) {
      console.error('AuthService: Error clearing stored auth state:', error);
    }
  }

  public async initiateLogin(): Promise<void> {
    await this.ensureInitialized();
    console.log('AuthService: Initiating login...');
    this.setLoading(true);
    
    const pkceData = await generatePKCEData();
    await browser.storage.local.set({ [STORAGE_KEYS.PKCE_DATA]: pkceData });

    const authUrl = new URL(OAUTH_CONFIG.authUrl);
    authUrl.searchParams.append('client_id', OAUTH_CONFIG.clientId);
    authUrl.searchParams.append('redirect_uri', OAUTH_CONFIG.redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', OAUTH_CONFIG.scopes.join(' '));
    authUrl.searchParams.append('code_challenge', pkceData.codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('state', pkceData.state);

    browser.tabs.create({ url: authUrl.toString() });
  }

  public async handleCallback(url: string): Promise<void> {
    console.log('AuthService: Handling OAuth callback...');
    this.setLoading(true);

    const params = new URLSearchParams(url.split('?')[1]);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      const errorDescription = params.get('error_description') || 'OAuth error during login';
      console.error(`AuthService: OAuth Error: ${error} - ${errorDescription}`);
      this.authState = { isAuthenticated: false, user: null, tokens: undefined, isLoading: false, error: errorDescription };
      await this.clearStoredAuthState();
      this.notifyAuthStateChange();
      throw new Error(errorDescription);
    }

    if (!code || !state) {
      console.error('AuthService: Missing code or state in callback.');
      this.authState = { isAuthenticated: false, user: null, tokens: undefined, isLoading: false, error: 'Invalid callback parameters' };
      await this.clearStoredAuthState();
      this.notifyAuthStateChange();
      throw new Error('Invalid callback parameters');
    }

    const storedPKCE = await browser.storage.local.get(STORAGE_KEYS.PKCE_DATA);
    const pkceData = storedPKCE[STORAGE_KEYS.PKCE_DATA] as PKCEData | undefined;

    if (!pkceData || !validateState(state, pkceData.state)) {
      console.error('AuthService: Invalid state or no PKCE data found.');
      this.authState = { isAuthenticated: false, user: null, tokens: undefined, isLoading: false, error: 'State validation failed. Please try logging in again.' };
      await this.clearStoredAuthState();
      this.notifyAuthStateChange();
      throw new Error('State validation failed');
    }

    try {
      const tokens = await this.exchangeCodeForTokens(code, pkceData.codeVerifier);
      this.authState.tokens = tokens;
      
      const userProfile = await this.fetchUserProfile(tokens.accessToken);
      this.authState.user = userProfile;
      this.authState.isAuthenticated = true;
      this.authState.error = undefined;
      console.log('AuthService: Login successful, user profile fetched.', userProfile);
    } catch (e: any) {
      console.error('AuthService: Error during token exchange or profile fetch:', e);
      this.authState = { isAuthenticated: false, user: null, tokens: undefined, isLoading: false, error: e.message || 'Login process failed' };
      await this.clearStoredAuthState(); 
    } finally {
      this.setLoading(false);
      await browser.storage.local.remove(STORAGE_KEYS.PKCE_DATA);
      await this.storeAuthState();
      this.notifyAuthStateChange();
    }
  }

  private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<AuthTokens> {
    const response = await fetch(OAUTH_CONFIG.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: OAUTH_CONFIG.clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: OAUTH_CONFIG.redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const responseData: TokenRefreshResponse | OAuthError = await response.json();

    if (!response.ok) {
      const errorDetails = responseData as OAuthError;
      console.error('AuthService: Token exchange failed:', errorDetails);
      throw new Error(errorDetails.error_description || errorDetails.error || 'Failed to exchange code for tokens');
    }

    const newTokens = responseData as TokenRefreshResponse;
    return {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || '',
      expiresAt: Date.now() + newTokens.expires_in * 1000,
      tokenType: newTokens.token_type,
      scope: newTokens.scope,
    };
  }
  
  private async refreshTokenInternal(): Promise<void> {
    if (!this.authState.tokens?.refreshToken) {
      console.warn('AuthService: No refresh token available. Cannot refresh.');
      this.authState = { isAuthenticated: false, user: null, tokens: undefined, isLoading: false, error: 'Session expired, please login again.' };
      await this.clearStoredAuthState();
      throw new Error('No refresh token available to refresh session.');
    }

    console.log('AuthService: Refreshing token...');

    try {
      const response = await fetch(OAUTH_CONFIG.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: OAUTH_CONFIG.clientId,
          grant_type: 'refresh_token',
          refresh_token: this.authState.tokens.refreshToken,
          scope: OAUTH_CONFIG.scopes.join(' '),
        }),
      });

      const responseData: TokenRefreshResponse | OAuthError = await response.json();

      if (!response.ok) {
        const errorDetails = responseData as OAuthError;
        console.error('AuthService: Token refresh failed with API error:', errorDetails);
        if (response.status === 400 || response.status === 401) { 
          console.log('AuthService: Refresh token rejected, logging out.');
          this.authState = { isAuthenticated: false, user: null, tokens: undefined, isLoading: false, error: 'Session expired. Please log in again.'};
          await this.clearStoredAuthState();
        } else {
           this.authState.error = `Failed to refresh session: ${errorDetails.error_description || errorDetails.error}`;
        }
        throw new Error(this.authState.error || 'Token refresh HTTP error');
      }

      const newTokens = responseData as TokenRefreshResponse;
      this.authState.tokens = {
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || this.authState.tokens.refreshToken,
        expiresAt: Date.now() + newTokens.expires_in * 1000,
        tokenType: newTokens.token_type,
        scope: newTokens.scope || this.authState.tokens.scope,
      };
      this.authState.isAuthenticated = true; 
      this.authState.error = undefined;
      console.log('AuthService: Token refreshed successfully.');
      
    } catch (e: any) {
      console.error('AuthService: Exception during token refresh:', e.message);
      if (this.authState.isAuthenticated) {
        this.authState.isAuthenticated = false;
      }
      if (!this.authState.error) this.authState.error = e.message || 'Could not refresh session.';
      throw e;
    } finally {
      await this.storeAuthState();
      this.notifyAuthStateChange();
    }
  }

  public async logout(): Promise<void> {
    await this.ensureInitialized();
    console.log('AuthService: Logging out...');

    this.authState = {
      isAuthenticated: false,
      user: null,
      tokens: undefined,
      isLoading: false,
      error: undefined,
    };
    await this.clearStoredAuthState();
    
    this.notifyAuthStateChange();
    console.log('AuthService: Logout complete.');
  }

  public async isAuthenticated(): Promise<boolean> {
    await this.ensureInitialized();

    if (this.authState.isLoading) {
      console.log("AuthService: isAuthenticated called while loading, awaiting...");
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.authState.isLoading) {
         await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    if (!this.authState.tokens) {
      return false;
    }

    if (Date.now() >= this.authState.tokens.expiresAt) {
      console.log('AuthService: Token expired, attempting refresh for isAuthenticated check.');
      try {
        await this.refreshTokenInternal();
        return this.authState.isAuthenticated;
      } catch (error) {
        console.warn('AuthService: Token refresh failed during isAuthenticated check.', error);
        return false; 
      }
    }
    return this.authState.isAuthenticated; 
  }

  public async getValidAccessToken(): Promise<string | null> {
    await this.ensureInitialized();
    
    const isAuthed = await this.isAuthenticated();
    if (isAuthed && this.authState.tokens) {
      return this.authState.tokens.accessToken;
    }
    
    console.log('AuthService: No valid access token available after isAuthenticated check.');
    return null;
  }
  
  private async fetchUserProfile(accessToken: string): Promise<UserProfile> {
    const userInfoUrl = OAUTH_CONFIG.userInfoUrl; 
    console.log(`AuthService: Fetching user profile from ${userInfoUrl}`);

    try {
      const response = await fetch(userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AuthService: Failed to fetch user profile (${response.status}):`, errorText);
        throw new Error(`Failed to fetch user profile: ${response.status}`);
      }
      const profileData = await response.json();
      return {
        id: profileData.sub || profileData.id, 
        email: profileData.email,
        name: profileData.name || profileData.preferred_username,
        avatar: profileData.picture, 
      };
    } catch (error: any) {
      console.error('AuthService: Error parsing user profile or network issue:', error);
      throw new Error(error.message || 'Could not load user profile data.');
    }
  }

  private notifyAuthStateChange() {
    const stateToSend = { ...this.authState };
    console.log('AuthService: Notifying auth state change to listeners.', stateToSend);
    
    browser.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED', data: stateToSend }).catch(error => {
        if (error.message && (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist'))) {
        } else {
            console.warn('AuthService: Error sending auth state change message:', error);
        }
    });
  }
} 