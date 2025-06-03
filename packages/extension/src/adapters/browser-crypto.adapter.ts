import { CryptoAdapter } from '@bookmarkai/sdk';

/**
 * Browser extension crypto adapter that implements the SDK CryptoAdapter interface
 * Uses the Web Crypto API for encryption/decryption
 */
export class BrowserExtensionCryptoAdapter implements CryptoAdapter {
  private algorithm = 'AES-GCM';
  private keyLength = 256;
  private saltLength = 16;
  private ivLength = 12;
  private tagLength = 128;

  /**
   * Encrypt data using AES-GCM
   */
  async encrypt(data: string, password: string): Promise<string> {
    try {
      // Generate salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(this.saltLength));
      const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));

      // Derive key from password
      const key = await this.deriveKey(password, salt);

      // Encode data
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(data);

      // Encrypt
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv,
          tagLength: this.tagLength,
        },
        key,
        encodedData
      );

      // Combine salt, iv, and encrypted data
      const combined = new Uint8Array(
        salt.length + iv.length + encryptedData.byteLength
      );
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encryptedData), salt.length + iv.length);

      // Convert to base64
      return this.arrayBufferToBase64(combined);
    } catch (error) {
      console.error('BrowserExtensionCryptoAdapter: Encryption failed', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data using AES-GCM
   */
  async decrypt(encryptedData: string, password: string): Promise<string> {
    try {
      // Convert from base64
      const combined = this.base64ToArrayBuffer(encryptedData);
      const combinedArray = new Uint8Array(combined);

      // Extract salt, iv, and encrypted data
      const salt = combinedArray.slice(0, this.saltLength);
      const iv = combinedArray.slice(this.saltLength, this.saltLength + this.ivLength);
      const encrypted = combinedArray.slice(this.saltLength + this.ivLength);

      // Derive key from password
      const key = await this.deriveKey(password, salt);

      // Decrypt
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: iv,
          tagLength: this.tagLength,
        },
        key,
        encrypted
      );

      // Decode data
      const decoder = new TextDecoder();
      return decoder.decode(decryptedData);
    } catch (error) {
      console.error('BrowserExtensionCryptoAdapter: Decryption failed', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Generate a random encryption key
   */
  async generateKey(): Promise<string> {
    try {
      // Generate random bytes for key
      const keyBytes = crypto.getRandomValues(new Uint8Array(32));
      return this.arrayBufferToBase64(keyBytes);
    } catch (error) {
      console.error('BrowserExtensionCryptoAdapter: Key generation failed', error);
      throw new Error('Key generation failed');
    }
  }

  /**
   * Derive a key from password using PBKDF2
   */
  private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    // Encode password
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive key using PBKDF2
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      {
        name: this.algorithm,
        length: this.keyLength,
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Hash data using SHA-256 (utility method)
   */
  async hash(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return this.arrayBufferToBase64(hashBuffer);
  }

  /**
   * Generate random string (utility method)
   */
  generateRandomString(length: number = 32): string {
    const array = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}