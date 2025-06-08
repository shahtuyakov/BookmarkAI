/**
 * ULID (Universally Unique Lexicographically Sortable Identifier) generation
 * Ensures consistent cross-platform queue item IDs with iOS and Android implementations
 * 
 * Format: TTTTTTRRRRRRRRRR (16 characters)
 * - TTTTTT: Timestamp component (6 chars, base-36 encoded)
 * - RRRRRRRRRR: Random component (10 chars, hex)
 */

/**
 * Generate a ULID string compatible with mobile platforms
 * 
 * iOS pattern: timestamp (base-36) + random suffix
 * Android pattern: System.currentTimeMillis().toString(36) + UUID.randomUUID()...
 */
export function generateULID(): string {
  // Get current timestamp and convert to base-36 (same as mobile platforms)
  const timestamp = Date.now().toString(36).toUpperCase();
  
  // Generate random component (10 characters hex, uppercase for consistency)
  const randomPart = generateRandomHex(10).toUpperCase();
  
  // Combine timestamp + random (total 16 chars max, same as mobile)
  const ulid = (timestamp + randomPart).substring(0, 16);
  
  return ulid;
}

/**
 * Generate random hexadecimal string of specified length
 */
function generateRandomHex(length: number): string {
  const chars = '0123456789ABCDEF';
  let result = '';
  
  // Use crypto.getRandomValues for secure random generation
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  
  return result;
}

/**
 * Extract timestamp from ULID (for debugging/sorting)
 */
export function extractTimestampFromULID(ulid: string): number {
  try {
    // Extract timestamp portion (first 6-8 chars before random part)
    // Find where random hex part starts (non-base36 chars)
    let timestampEnd = 6;
    for (let i = 0; i < ulid.length; i++) {
      const char = ulid[i];
      if (!/[0-9A-Z]/.test(char) || parseInt(char, 36) >= 36) {
        timestampEnd = i;
        break;
      }
    }
    
    const timestampStr = ulid.substring(0, timestampEnd);
    return parseInt(timestampStr, 36);
  } catch (error) {
    console.warn('Failed to extract timestamp from ULID:', ulid, error);
    return Date.now(); // Fallback to current time
  }
}

/**
 * Validate ULID format
 */
export function isValidULID(ulid: string): boolean {
  if (!ulid || typeof ulid !== 'string') {
    return false;
  }
  
  // Check length (should be around 16 chars, allowing some variance)
  if (ulid.length < 10 || ulid.length > 20) {
    return false;
  }
  
  // Check that it contains only valid characters (alphanumeric uppercase)
  if (!/^[0-9A-Z]+$/.test(ulid)) {
    return false;
  }
  
  // Try to extract timestamp to validate format
  try {
    const timestamp = extractTimestampFromULID(ulid);
    return timestamp > 0 && timestamp <= Date.now() + 86400000; // Within 24 hours future
  } catch {
    return false;
  }
}

/**
 * Generate multiple ULIDs with guaranteed uniqueness
 */
export function generateMultipleULIDs(count: number): string[] {
  const ulids = new Set<string>();
  
  while (ulids.size < count) {
    ulids.add(generateULID());
    
    // Small delay to ensure timestamp differences for uniqueness
    if (ulids.size % 100 === 0) {
      // Add microsecond variance for high-volume generation
      const delay = Math.random() * 2;
      const start = Date.now();
      while (Date.now() - start < delay) {
        // Busy wait for precise timing
      }
    }
  }
  
  return Array.from(ulids);
}