import { Platform } from 'react-native';
import { HardwareSecurityService, hardwareSecurityService } from '../hardware-security';

// Mock React Native modules for testing
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android'
  },
  NativeModules: {
    HardwareSecurityModule: {
      getHardwareSecurityInfo: jest.fn(),
      generateHardwareKey: jest.fn(),
      encryptWithHardwareKey: jest.fn(),
      decryptWithHardwareKey: jest.fn(),
      hasHardwareKey: jest.fn(),
      deleteHardwareKey: jest.fn(),
      testHardwareSecurity: jest.fn(),
      PLATFORM: 'android',
      MODULE_NAME: 'HardwareSecurityModule',
      SUPPORTS_HARDWARE_KEYSTORE: true,
      SUPPORTS_STRONGBOX: false,
      SUPPORTS_BIOMETRIC: true,
      API_LEVEL: 30
    }
  }
}));

describe('HardwareSecurityService', () => {
  const mockNativeModule = require('react-native').NativeModules.HardwareSecurityModule;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('platform availability', () => {
    it('should be available on Android', () => {
      expect(HardwareSecurityService.isAvailable()).toBe(true);
    });

    it('should not be available on iOS', () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios' });
      expect(HardwareSecurityService.isAvailable()).toBe(false);
    });
  });

  describe('security info', () => {
    it('should get hardware security information', async () => {
      const mockSecurityInfo = {
        hasHardwareKeystore: true,
        hasStrongBox: false,
        hasTEE: true,
        hasBiometricHardware: true,
        biometricStatus: 'available',
        hasFingerprint: true,
        hasFaceUnlock: false,
        isDeviceSecure: true,
        hasScreenLock: true,
        androidVersion: '11',
        apiLevel: 30,
        supportsAES: true,
        supportsECDSA: true,
        supportsRSA: true
      };

      mockNativeModule.getHardwareSecurityInfo.mockResolvedValue(mockSecurityInfo);

      const info = await hardwareSecurityService.getSecurityInfo();
      
      expect(info).toEqual(mockSecurityInfo);
      expect(mockNativeModule.getHardwareSecurityInfo).toHaveBeenCalled();
    });

    it('should handle security info errors', async () => {
      mockNativeModule.getHardwareSecurityInfo.mockRejectedValue(new Error('Security info failed'));

      await expect(hardwareSecurityService.getSecurityInfo()).rejects.toThrow('Hardware security info failed');
    });
  });

  describe('key management', () => {
    it('should generate hardware key successfully', async () => {
      const mockResult = {
        success: true,
        keyAlias: 'test_key',
        requiresBiometric: false
      };

      mockNativeModule.generateHardwareKey.mockResolvedValue(mockResult);

      const result = await hardwareSecurityService.generateKey('test_key', false);
      
      expect(result).toEqual(mockResult);
      expect(mockNativeModule.generateHardwareKey).toHaveBeenCalledWith('test_key', false);
    });

    it('should generate biometric-protected key', async () => {
      const mockResult = {
        success: true,
        keyAlias: 'biometric_key',
        requiresBiometric: true
      };

      mockNativeModule.generateHardwareKey.mockResolvedValue(mockResult);

      const result = await hardwareSecurityService.generateKey('biometric_key', true);
      
      expect(result.requiresBiometric).toBe(true);
      expect(mockNativeModule.generateHardwareKey).toHaveBeenCalledWith('biometric_key', true);
    });

    it('should check if key exists', async () => {
      mockNativeModule.hasHardwareKey.mockResolvedValue(true);

      const exists = await hardwareSecurityService.hasKey('test_key');
      
      expect(exists).toBe(true);
      expect(mockNativeModule.hasHardwareKey).toHaveBeenCalledWith('test_key');
    });

    it('should delete hardware key', async () => {
      mockNativeModule.deleteHardwareKey.mockResolvedValue(true);

      const deleted = await hardwareSecurityService.deleteKey('test_key');
      
      expect(deleted).toBe(true);
      expect(mockNativeModule.deleteHardwareKey).toHaveBeenCalledWith('test_key');
    });
  });

  describe('encryption and decryption', () => {
    it('should encrypt data with hardware key', async () => {
      const mockEncryption = {
        encryptedData: 'encrypted_base64_data',
        iv: 'iv_base64_data',
        keyAlias: 'test_key'
      };

      mockNativeModule.encryptWithHardwareKey.mockResolvedValue(mockEncryption);

      const result = await hardwareSecurityService.encrypt('test_key', 'sensitive data');
      
      expect(result).toEqual(mockEncryption);
      expect(mockNativeModule.encryptWithHardwareKey).toHaveBeenCalledWith('test_key', 'sensitive data');
    });

    it('should decrypt data with hardware key', async () => {
      const mockDecryption = {
        decryptedData: 'sensitive data',
        keyAlias: 'test_key'
      };

      mockNativeModule.decryptWithHardwareKey.mockResolvedValue(mockDecryption);

      const result = await hardwareSecurityService.decrypt('test_key', 'encrypted_data', 'iv_data');
      
      expect(result).toEqual(mockDecryption);
      expect(mockNativeModule.decryptWithHardwareKey).toHaveBeenCalledWith('test_key', 'encrypted_data', 'iv_data');
    });

    it('should handle encryption errors', async () => {
      mockNativeModule.encryptWithHardwareKey.mockRejectedValue(new Error('Encryption failed'));

      await expect(hardwareSecurityService.encrypt('test_key', 'data')).rejects.toThrow('Hardware encryption failed');
    });

    it('should handle decryption errors', async () => {
      mockNativeModule.decryptWithHardwareKey.mockRejectedValue(new Error('Decryption failed'));

      await expect(hardwareSecurityService.decrypt('test_key', 'encrypted', 'iv')).rejects.toThrow('Hardware decryption failed');
    });
  });

  describe('testing functionality', () => {
    it('should test hardware security successfully', async () => {
      const mockTestResult = {
        success: true,
        message: 'Hardware security test passed',
        keyGeneration: true,
        encryption: true,
        decryption: true
      };

      mockNativeModule.testHardwareSecurity.mockResolvedValue(mockTestResult);

      const result = await hardwareSecurityService.test();
      
      expect(result).toEqual(mockTestResult);
      expect(result.success).toBe(true);
    });

    it('should handle test failures', async () => {
      const mockTestResult = {
        success: false,
        message: 'Hardware security test failed: Key generation failed',
        error: 'KeyGenerationException'
      };

      mockNativeModule.testHardwareSecurity.mockResolvedValue(mockTestResult);

      const result = await hardwareSecurityService.test();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('KeyGenerationException');
    });
  });

  describe('capabilities summary', () => {
    it('should provide capabilities summary for StrongBox device', async () => {
      const mockSecurityInfo = {
        hasHardwareKeystore: true,
        hasStrongBox: true,
        biometricStatus: 'available',
        isDeviceSecure: true,
        hasScreenLock: true
      };

      mockNativeModule.getHardwareSecurityInfo.mockResolvedValue(mockSecurityInfo);

      const summary = await hardwareSecurityService.getCapabilitiesSummary();
      
      expect(summary.securityLevel).toBe('strongbox');
      expect(summary.biometricSupport).toBe(true);
      expect(summary.recommendedForProduction).toBe(true);
      expect(summary.summary).toContain('STRONGBOX');
      expect(summary.summary).toContain('StrongBox Keymaster');
    });

    it('should provide capabilities summary for hardware keystore device', async () => {
      const mockSecurityInfo = {
        hasHardwareKeystore: true,
        hasStrongBox: false,
        biometricStatus: 'available',
        isDeviceSecure: true,
        hasScreenLock: true
      };

      mockNativeModule.getHardwareSecurityInfo.mockResolvedValue(mockSecurityInfo);

      const summary = await hardwareSecurityService.getCapabilitiesSummary();
      
      expect(summary.securityLevel).toBe('hardware');
      expect(summary.biometricSupport).toBe(true);
      expect(summary.recommendedForProduction).toBe(true);
    });

    it('should warn about insecure devices', async () => {
      const mockSecurityInfo = {
        hasHardwareKeystore: true,
        hasStrongBox: false,
        biometricStatus: 'none_enrolled',
        isDeviceSecure: false,
        hasScreenLock: false
      };

      mockNativeModule.getHardwareSecurityInfo.mockResolvedValue(mockSecurityInfo);

      const summary = await hardwareSecurityService.getCapabilitiesSummary();
      
      expect(summary.biometricSupport).toBe(false);
      expect(summary.recommendedForProduction).toBe(false);
      expect(summary.summary).toContain('Warning: Device not secure');
    });
  });

  describe('error handling for unsupported platforms', () => {
    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'ios' });
    });

    it('should throw error for unsupported platform operations', async () => {
      const service = new HardwareSecurityService();

      await expect(service.getSecurityInfo()).rejects.toThrow('Hardware security not available on this platform');
      await expect(service.generateKey('test')).rejects.toThrow('Hardware security not available on this platform');
      await expect(service.encrypt('test', 'data')).rejects.toThrow('Hardware security not available on this platform');
      await expect(service.decrypt('test', 'data', 'iv')).rejects.toThrow('Hardware security not available on this platform');
      await expect(service.test()).rejects.toThrow('Hardware security not available on this platform');
    });

    it('should return false for key operations on unsupported platforms', async () => {
      const service = new HardwareSecurityService();

      expect(await service.hasKey('test')).toBe(false);
      expect(await service.deleteKey('test')).toBe(false);
    });

    it('should return appropriate capabilities summary for unsupported platforms', async () => {
      const service = new HardwareSecurityService();
      const summary = await service.getCapabilitiesSummary();

      expect(summary.available).toBe(false);
      expect(summary.securityLevel).toBe('none');
      expect(summary.biometricSupport).toBe(false);
      expect(summary.recommendedForProduction).toBe(false);
      expect(summary.summary).toContain('not available on this platform');
    });
  });
});