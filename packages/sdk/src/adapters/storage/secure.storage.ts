import { StorageAdapter, CryptoAdapter } from '../types';

/**
 * Secure storage adapter that encrypts data before storing
 */
export class SecureStorageAdapter implements StorageAdapter {
  constructor(
    private baseStorage: StorageAdapter,
    private crypto: CryptoAdapter,
    private encryptionKey: string
  ) {}

  async getItem(key: string): Promise<string | null> {
    const encryptedValue = await this.baseStorage.getItem(key);
    if (!encryptedValue) {
      return null;
    }

    try {
      return await this.crypto.decrypt(encryptedValue, this.encryptionKey);
    } catch (error) {
      console.error('Failed to decrypt storage value:', error);
      // If decryption fails, remove the corrupted value
      await this.removeItem(key);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const encryptedValue = await this.crypto.encrypt(value, this.encryptionKey);
    await this.baseStorage.setItem(key, encryptedValue);
  }

  async removeItem(key: string): Promise<void> {
    await this.baseStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    await this.baseStorage.clear();
  }
}