export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope?: string;
}

export interface PKCEData {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user?: UserProfile;
  tokens?: AuthTokens;
  isLoading: boolean;
  error?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
}

export interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export interface TokenRefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface OAuthError {
  error: string;
  error_description?: string;
  error_uri?: string;
} 