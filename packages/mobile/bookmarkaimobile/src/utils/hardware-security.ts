import { NativeModules, Platform } from 'react-native';

/**
 * Hardware Security Module interface for React Native
 * Provides access to Android hardware-backed encryption
 */

interface HardwareSecurityModuleNative {
  getHardwareSecurityInfo(): Promise<HardwareSecurityInfo>;
  generateHardwareKey(keyAlias: string, requireBiometric: boolean): Promise<KeyGenerationResult>;
  encryptWithHardwareKey(keyAlias: string, data: string): Promise<EncryptionResult>;
  decryptWithHardwareKey(keyAlias: string, encryptedData: string, iv: string): Promise<DecryptionResult>;
  hasHardwareKey(keyAlias: string): Promise<boolean>;
  deleteHardwareKey(keyAlias: string): Promise<boolean>;
  testHardwareSecurity(): Promise<SecurityTestResult>;
  readonly PLATFORM: string;
  readonly MODULE_NAME: string;
  readonly SUPPORTS_HARDWARE_KEYSTORE: boolean;
  readonly SUPPORTS_STRONGBOX: boolean;
  readonly SUPPORTS_BIOMETRIC: boolean;
  readonly API_LEVEL: number;
}

interface HardwareSecurityInfo {
  // Hardware security
  hasHardwareKeystore: boolean;
  hasStrongBox: boolean;
  hasTEE: boolean;

  // Biometric capabilities
  hasBiometricHardware: boolean;
  biometricStatus: 'available' | 'no_hardware' | 'hardware_unavailable' | 'none_enrolled' | 'security_update_required' | 'unsupported' | 'unknown' | 'error';
  hasFingerprint: boolean;
  hasFaceUnlock: boolean;

  // Device security
  isDeviceSecure: boolean;
  hasScreenLock: boolean;
  androidVersion: string;
  apiLevel: number;

  // Key capabilities
  supportsAES: boolean;
  supportsECDSA: boolean;
  supportsRSA: boolean;
}

interface KeyGenerationResult {
  success: boolean;
  keyAlias: string;
  requiresBiometric: boolean;
}

interface EncryptionResult {
  encryptedData: string;
  iv: string;
  keyAlias: string;
}

interface DecryptionResult {
  decryptedData: string;
  keyAlias: string;
}

interface SecurityTestResult {
  success: boolean;
  message: string;
  keyGeneration?: boolean;
  encryption?: boolean;
  decryption?: boolean;
  error?: string;
}

// Get native module
const HardwareSecurityModuleNative = NativeModules.HardwareSecurityModule as HardwareSecurityModuleNative;

/**
 * Hardware Security Service for React Native
 */
export class HardwareSecurityService {

  /**
   * Check if hardware security is available
   */
  static isAvailable(): boolean {
    return Platform.OS === 'android' && !!HardwareSecurityModuleNative;
  }

  /**
   * Get comprehensive hardware security information
   */
  async getSecurityInfo(): Promise<HardwareSecurityInfo> {
    if (!HardwareSecurityService.isAvailable()) {
      throw new Error('Hardware security not available on this platform');
    }

    try {
      const info = await HardwareSecurityModuleNative.getHardwareSecurityInfo();
      return info;
    } catch (error: any) {
      throw new Error(`Hardware security info failed: ${error.message}`);
    }
  }

  /**
   * Generate hardware-backed encryption key
   */
  async generateKey(keyAlias: string, requireBiometric: boolean = false): Promise<KeyGenerationResult> {
    if (!HardwareSecurityService.isAvailable()) {
      throw new Error('Hardware security not available on this platform');
    }

    try {
      const result = await HardwareSecurityModuleNative.generateHardwareKey(keyAlias, requireBiometric);

      if (result.success) {
      }

      return result;
    } catch (error: any) {
      throw new Error(`Key generation failed: ${error.message}`);
    }
  }

  /**
   * Encrypt data using hardware-backed key
   */
  async encrypt(keyAlias: string, data: string): Promise<EncryptionResult> {
    if (!HardwareSecurityService.isAvailable()) {
      throw new Error('Hardware security not available on this platform');
    }

    try {
      const result = await HardwareSecurityModuleNative.encryptWithHardwareKey(keyAlias, data);
      return result;
    } catch (error: any) {
      throw new Error(`Hardware encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data using hardware-backed key
   */
  async decrypt(keyAlias: string, encryptedData: string, iv: string): Promise<DecryptionResult> {
    if (!HardwareSecurityService.isAvailable()) {
      throw new Error('Hardware security not available on this platform');
    }

    try {
      const result = await HardwareSecurityModuleNative.decryptWithHardwareKey(keyAlias, encryptedData, iv);
      return result;
    } catch (error: any) {
      throw new Error(`Hardware decryption failed: ${error.message}`);
    }
  }

  /**
   * Check if hardware key exists
   */
  async hasKey(keyAlias: string): Promise<boolean> {
    if (!HardwareSecurityService.isAvailable()) {
      return false;
    }

    try {
      return await HardwareSecurityModuleNative.hasHardwareKey(keyAlias);
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Delete hardware key
   */
  async deleteKey(keyAlias: string): Promise<boolean> {
    if (!HardwareSecurityService.isAvailable()) {
      return false;
    }

    try {
      const deleted = await HardwareSecurityModuleNative.deleteHardwareKey(keyAlias);

      if (deleted) {
      } else {
      }

      return deleted;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Test hardware security functionality
   */
  async test(): Promise<SecurityTestResult> {
    if (!HardwareSecurityService.isAvailable()) {
      throw new Error('Hardware security not available on this platform');
    }

    try {
      const result = await HardwareSecurityModuleNative.testHardwareSecurity();

      if (result.success) {
      } else {
      }

      return result;
    } catch (error: any) {
      throw new Error(`Hardware security test failed: ${error.message}`);
    }
  }

  /**
   * Get a summary of hardware security capabilities
   */
  async getCapabilitiesSummary(): Promise<{
    available: boolean;
    securityLevel: 'none' | 'software' | 'hardware' | 'strongbox';
    biometricSupport: boolean;
    recommendedForProduction: boolean;
    summary: string;
  }> {
    if (!HardwareSecurityService.isAvailable()) {
      return {
        available: false,
        securityLevel: 'none',
        biometricSupport: false,
        recommendedForProduction: false,
        summary: 'Hardware security not available on this platform',
      };
    }

    try {
      const info = await this.getSecurityInfo();

      let securityLevel: 'none' | 'software' | 'hardware' | 'strongbox' = 'none';
      if (info.hasStrongBox) {
        securityLevel = 'strongbox';
      } else if (info.hasHardwareKeystore) {
        securityLevel = 'hardware';
      } else {
        securityLevel = 'software';
      }

      const biometricSupport = info.biometricStatus === 'available';
      const recommendedForProduction = info.hasHardwareKeystore && info.isDeviceSecure;

      let summary = `Security Level: ${securityLevel.toUpperCase()}`;
      if (info.hasStrongBox) {
        summary += ' (StrongBox Keymaster)';
      }
      if (biometricSupport) {
        summary += ', Biometric authentication available';
      }
      if (!info.isDeviceSecure) {
        summary += ', Warning: Device not secure (no screen lock)';
      }

      return {
        available: true,
        securityLevel,
        biometricSupport,
        recommendedForProduction,
        summary,
      };

    } catch (error: any) {
      return {
        available: false,
        securityLevel: 'none',
        biometricSupport: false,
        recommendedForProduction: false,
        summary: `Error: ${error.message}`,
      };
    }
  }
}

/**
 * Create hardware security service instance
 */
export const hardwareSecurityService = new HardwareSecurityService();

// Export types
export type {
  HardwareSecurityInfo,
  KeyGenerationResult,
  EncryptionResult,
  DecryptionResult,
  SecurityTestResult,
};
