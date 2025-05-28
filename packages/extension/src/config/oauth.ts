import type { OAuthConfig } from '../types/auth';
import browser from 'webextension-polyfill';

// All OAuth configuration is now sourced from Vite environment variables (VITE_ prefix)
// Vite automatically loads .env.development or .env.production based on the command (dev vs build).

// Helper function to get environment variables with a fallback, primarily for type safety
// and to make it clear where these are coming from.
function getEnvVar(key: string, defaultValue?: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

// DEBUG: Log the VITE_OAUTH_AUTH_URL to see what Vite has loaded
console.log('[DEBUG] VITE_OAUTH_AUTH_URL from import.meta.env:', import.meta.env.VITE_OAUTH_AUTH_URL);
console.log('[DEBUG] All import.meta.env keys:', Object.keys(import.meta.env));

/**
 * OAuth configuration for BookmarkAI
 * According to ADR-009, this should integrate with existing JWT auth
 */
export const OAUTH_CONFIG: OAuthConfig = {
  authUrl: getEnvVar('VITE_OAUTH_AUTH_URL'),
  tokenUrl: getEnvVar('VITE_OAUTH_TOKEN_URL'),
  userInfoUrl: getEnvVar('VITE_OAUTH_USERINFO_URL'),
  clientId: getEnvVar('VITE_OAUTH_CLIENT_ID'),
  redirectUri: browser.runtime.getURL('auth/callback.html'),
  scopes: ['openid', 'profile', 'email', 'offline_access', 'shares:read', 'shares:write'],
};

export const API_BASE_URL = getEnvVar('VITE_API_BASE_URL');
export const WEB_APP_URL = getEnvVar('VITE_WEB_APP_URL');

/**
 * Storage keys for OAuth data
 */
export const STORAGE_KEYS = {
  AUTH_TOKENS: 'bookmarkai_auth_tokens',
  PKCE_DATA: 'bookmarkai_pkce_data',
  USER_PROFILE: 'bookmarkai_user_profile',
  AUTH_STATE: 'bookmarkai_auth_state',
} as const; 