import type { PKCEData } from '../types/auth';

/**
 * Generate a random string for PKCE code verifier
 * According to RFC 7636, length should be 43-128 characters
 */
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  
  return result;
}

/**
 * Generate SHA256 hash and base64url encode for PKCE code challenge
 */
async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

/**
 * Base64 URL encode (without padding)
 */
function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = '';
  
  for (let i = 0; i < bytes.byteLength; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  
  return btoa(result)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate PKCE data (code verifier, challenge, and state)
 */
export async function generatePKCEData(): Promise<PKCEData> {
  // Generate code verifier (43-128 characters)
  const codeVerifier = generateRandomString(64);
  
  // Generate code challenge using SHA256
  const challengeBuffer = await sha256(codeVerifier);
  const codeChallenge = base64URLEncode(challengeBuffer);
  
  // Generate state parameter for CSRF protection
  const state = generateRandomString(32);
  
  return {
    codeVerifier,
    codeChallenge,
    state,
  };
}

/**
 * Validate PKCE state parameter
 */
export function validateState(receivedState: string, expectedState: string): boolean {
  return receivedState === expectedState;
} 