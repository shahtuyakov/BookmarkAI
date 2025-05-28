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
  user: UserProfile | null;
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
  userInfoUrl: string;
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

export interface ShareItem {
  id: string;
  url: string;
  title?: string;
  faviconUrl?: string;
  ogImageUrl?: string; // Or a more generic meta.ogImage
  createdAt: string; // ISO date string
  source?: string; // e.g., "webext", "ios", "android"
  // Add any other relevant fields that the API returns for a share listing
}

export interface GetSharesResponse {
  items: ShareItem[];
  total: number;
  page: number;
  limit: number;
  // Any other pagination metadata
} 