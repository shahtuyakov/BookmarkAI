import type { AuthError } from '../types/auth';

// Helper function to get environment variables with a fallback
function getEnvVar(key: string, defaultValue?: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

/**
 * Auth configuration for BookmarkAI
 * Direct login approach with JWT tokens
 */
export const AUTH_CONFIG = {
  loginUrl: `${getEnvVar('VITE_API_BASE_URL')}/v1/auth/login`,
  refreshUrl: `${getEnvVar('VITE_API_BASE_URL')}/v1/auth/refresh`,
  userProfileUrl: `${getEnvVar('VITE_API_BASE_URL')}/v1/auth/profile`,
};

export const API_BASE_URL = getEnvVar('VITE_API_BASE_URL');
export const WEB_APP_URL = getEnvVar('VITE_WEB_APP_URL');

/**
 * Storage keys for auth data
 */
export const STORAGE_KEYS = {
  AUTH_TOKENS: 'bookmarkai_auth_tokens',
  USER_PROFILE: 'bookmarkai_user_profile',
  AUTH_STATE: 'bookmarkai_auth_state',
} as const;

/**
 * Auth constants
 */
export const AUTH_CONSTANTS = {
  TOKEN_REFRESH_BUFFER: 5 * 60 * 1000, // 5 minutes in milliseconds
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
} as const;

/**
 * Helper to create auth error
 */
export function createAuthError(message: string, statusCode?: number): AuthError {
  return {
    error: 'auth_error',
    message,
    statusCode,
  };
}