/**
 * Feature flags for the extension
 * These can be toggled to enable/disable features during development
 * or for gradual rollout
 */

import browser from 'webextension-polyfill';

export const FEATURE_FLAGS = {
  // Use SDK for authentication instead of direct API calls
  USE_SDK_AUTH: true, // Force SDK usage in all environments
  
  // Enable debug logging
  DEBUG_LOGGING: process.env.NODE_ENV === 'development',
  
  // Enable SDK interceptors
  SDK_INTERCEPTORS: process.env.NODE_ENV === 'development',
  
  // Enable migration of existing tokens
  MIGRATE_TOKENS: true,
} as const;

/**
 * Get feature flag value with optional override from storage
 */
export async function getFeatureFlag(flag: keyof typeof FEATURE_FLAGS): Promise<boolean> {
  try {
    // Check for runtime override in storage
    const overrides = await browser.storage.local.get('feature_flags');
    if (overrides.feature_flags && flag in overrides.feature_flags) {
      return overrides.feature_flags[flag];
    }
  } catch {
    // Ignore errors and use default
  }
  
  return FEATURE_FLAGS[flag];
}

/**
 * Set feature flag override
 */
export async function setFeatureFlag(flag: keyof typeof FEATURE_FLAGS, value: boolean): Promise<void> {
  const overrides = await browser.storage.local.get('feature_flags');
  const flags = overrides.feature_flags || {};
  flags[flag] = value;
  await browser.storage.local.set({ feature_flags: flags });
}