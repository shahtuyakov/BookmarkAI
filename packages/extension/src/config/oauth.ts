import type { OAuthConfig } from '../types/auth';
import browser from 'webextension-polyfill';

/**
 * OAuth configuration for BookmarkAI
 * According to ADR-009, this should integrate with existing JWT auth
 */
export const OAUTH_CONFIG: OAuthConfig = {
  authUrl: 'https://api.bookmarkai.com/oauth/authorize',
  tokenUrl: 'https://api.bookmarkai.com/oauth/token',
  clientId: 'bookmarkai-webext', // TODO: Get from environment/manifest
  redirectUri: browser.runtime.getURL('auth/callback.html'),
  scopes: ['bookmark:write', 'bookmark:read', 'profile:read'],
};

/**
 * Development configuration for local testing
 */
export const DEV_OAUTH_CONFIG: OAuthConfig = {
  authUrl: 'http://localhost:3000/oauth/authorize',
  tokenUrl: 'http://localhost:3000/oauth/token',
  clientId: 'bookmarkai-webext-dev',
  redirectUri: browser.runtime.getURL('auth/callback.html'),
  scopes: ['bookmark:write', 'bookmark:read', 'profile:read'],
};

/**
 * Get OAuth config based on environment
 */
export function getOAuthConfig(): OAuthConfig {
  const isDevelopment = process.env.NODE_ENV === 'development';
  return isDevelopment ? DEV_OAUTH_CONFIG : OAUTH_CONFIG;
}

/**
 * Storage keys for OAuth data
 */
export const STORAGE_KEYS = {
  AUTH_TOKENS: 'bookmarkai_auth_tokens',
  PKCE_DATA: 'bookmarkai_pkce_data',
  USER_PROFILE: 'bookmarkai_user_profile',
  AUTH_STATE: 'bookmarkai_auth_state',
} as const; 