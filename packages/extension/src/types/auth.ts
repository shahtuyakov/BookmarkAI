export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken?: string;
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

export interface AuthError {
  error: string;
  message?: string;
  statusCode?: number;
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