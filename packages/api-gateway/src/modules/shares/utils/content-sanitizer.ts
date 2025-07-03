/**
 * Utility functions for sanitizing content to prevent binary data errors
 */

/**
 * Sanitize text content by removing problematic characters that can cause
 * binary data validation errors in downstream services
 */
export function sanitizeContent(text: string | undefined | null): string {
  if (!text) {
    return '';
  }

  // Ensure string type
  const content = String(text);

  // Remove Unicode replacement characters (�) and other problematic chars
  let sanitized = content
    // Remove replacement characters
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')
    // Remove NULL bytes and control characters (except tab, newline, carriage return)
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    // Remove other invisible characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Normalize Unicode to fix composed characters
  try {
    sanitized = sanitized.normalize('NFC');
  } catch (e) {
    // If normalization fails, continue with unnormalized text
  }

  // Trim whitespace
  return sanitized.trim();
}

/**
 * Sanitize an object's string properties recursively
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized: any = { ...obj };

  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeContent(sanitized[key]);
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeObject(sanitized[key]);
    }
  }

  return sanitized as T;
}