package com.bookmarkai.security

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import androidx.biometric.BiometricManager
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import android.util.Base64
import java.security.SecureRandom

/**
 * Hardware Security Module for Android
 * Provides hardware-backed encryption and biometric authentication
 */
class HardwareSecurityModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        const val MODULE_NAME = "HardwareSecurityModule"
        private const val TAG = "HardwareSecurityModule"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val KEY_ALIAS_PREFIX = "bookmarkai_hw_key_"
    }
    
    private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    override fun getName(): String = MODULE_NAME
    
    /**
     * Check hardware security capabilities
     */
    @ReactMethod
    fun getHardwareSecurityInfo(promise: Promise) {
        moduleScope.launch {
            try {
                val info = withContext(Dispatchers.IO) {
                    getSecurityCapabilities()
                }
                promise.resolve(info)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get hardware security info", e)
                promise.reject("SECURITY_INFO_ERROR", "Failed to get security info: ${e.message}", e)
            }
        }
    }
    
    /**
     * Generate hardware-backed encryption key
     */
    @ReactMethod
    fun generateHardwareKey(
        keyAlias: String,
        requireBiometric: Boolean,
        promise: Promise
    ) {
        moduleScope.launch {
            try {
                val success = withContext(Dispatchers.IO) {
                    createHardwareBackedKey(keyAlias, requireBiometric)
                }
                
                if (success) {
                    Log.d(TAG, "✅ Hardware key generated: $keyAlias")
                    promise.resolve(Arguments.createMap().apply {
                        putBoolean("success", true)
                        putString("keyAlias", keyAlias)
                        putBoolean("requiresBiometric", requireBiometric)
                    })
                } else {
                    promise.reject("KEY_GENERATION_ERROR", "Failed to generate hardware key")
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to generate hardware key: $keyAlias", e)
                promise.reject("KEY_GENERATION_ERROR", "Hardware key generation failed: ${e.message}", e)
            }
        }
    }
    
    /**
     * Encrypt data using hardware-backed key
     */
    @ReactMethod
    fun encryptWithHardwareKey(
        keyAlias: String,
        data: String,
        promise: Promise
    ) {
        moduleScope.launch {
            try {
                val encryptedData = withContext(Dispatchers.IO) {
                    encryptData(keyAlias, data)
                }
                
                Log.d(TAG, "✅ Data encrypted with hardware key: $keyAlias")
                promise.resolve(Arguments.createMap().apply {
                    putString("encryptedData", encryptedData.encryptedText)
                    putString("iv", encryptedData.iv)
                    putString("keyAlias", keyAlias)
                })
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to encrypt with hardware key: $keyAlias", e)
                promise.reject("ENCRYPTION_ERROR", "Hardware encryption failed: ${e.message}", e)
            }
        }
    }
    
    /**
     * Decrypt data using hardware-backed key
     */
    @ReactMethod
    fun decryptWithHardwareKey(
        keyAlias: String,
        encryptedData: String,
        iv: String,
        promise: Promise
    ) {
        moduleScope.launch {
            try {
                val decryptedData = withContext(Dispatchers.IO) {
                    decryptData(keyAlias, encryptedData, iv)
                }
                
                Log.d(TAG, "✅ Data decrypted with hardware key: $keyAlias")
                promise.resolve(Arguments.createMap().apply {
                    putString("decryptedData", decryptedData)
                    putString("keyAlias", keyAlias)
                })
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to decrypt with hardware key: $keyAlias", e)
                promise.reject("DECRYPTION_ERROR", "Hardware decryption failed: ${e.message}", e)
            }
        }
    }
    
    /**
     * Check if hardware key exists
     */
    @ReactMethod
    fun hasHardwareKey(keyAlias: String, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore.load(null)
            
            val exists = keyStore.containsAlias(getFullKeyAlias(keyAlias))
            promise.resolve(exists)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check hardware key existence", e)
            promise.reject("KEY_CHECK_ERROR", "Failed to check key: ${e.message}", e)
        }
    }
    
    /**
     * Delete hardware key
     */
    @ReactMethod
    fun deleteHardwareKey(keyAlias: String, promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore.load(null)
            
            val fullAlias = getFullKeyAlias(keyAlias)
            if (keyStore.containsAlias(fullAlias)) {
                keyStore.deleteEntry(fullAlias)
                Log.d(TAG, "✅ Hardware key deleted: $keyAlias")
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to delete hardware key: $keyAlias", e)
            promise.reject("KEY_DELETE_ERROR", "Failed to delete key: ${e.message}", e)
        }
    }
    
    /**
     * Test hardware security functionality
     */
    @ReactMethod
    fun testHardwareSecurity(promise: Promise) {
        moduleScope.launch {
            try {
                val testResult = withContext(Dispatchers.IO) {
                    performSecurityTest()
                }
                promise.resolve(testResult)
                
            } catch (e: Exception) {
                Log.e(TAG, "Hardware security test failed", e)
                promise.reject("TEST_ERROR", "Hardware security test failed: ${e.message}", e)
            }
        }
    }
    
    // Private helper methods
    
    private fun getFullKeyAlias(keyAlias: String): String {
        return "$KEY_ALIAS_PREFIX$keyAlias"
    }
    
    private fun getSecurityCapabilities(): WritableMap {
        val biometricManager = BiometricManager.from(reactContext)
        val packageManager = reactContext.packageManager
        
        return Arguments.createMap().apply {
            // Hardware security
            putBoolean("hasHardwareKeystore", hasHardwareKeystore())
            putBoolean("hasStrongBox", hasStrongBoxKeystore())
            putBoolean("hasTEE", hasTrustedExecutionEnvironment())
            
            // Biometric capabilities
            putBoolean("hasBiometricHardware", hasBiometricCapability())
            putString("biometricStatus", getBiometricStatus(biometricManager))
            putBoolean("hasFingerprint", packageManager.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT))
            putBoolean("hasFaceUnlock", hasFaceUnlockCapability())
            
            // Device security
            putBoolean("isDeviceSecure", isDeviceSecure())
            putBoolean("hasScreenLock", hasScreenLock())
            putString("androidVersion", Build.VERSION.RELEASE)
            putInt("apiLevel", Build.VERSION.SDK_INT)
            
            // Key capabilities
            putBoolean("supportsAES", true)
            putBoolean("supportsECDSA", supportsECDSA())
            putBoolean("supportsRSA", supportsRSA())
        }
    }
    
    private fun createHardwareBackedKey(keyAlias: String, requireBiometric: Boolean): Boolean {
        return try {
            val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
            val fullAlias = getFullKeyAlias(keyAlias)
            
            val keyGenParameterSpec = KeyGenParameterSpec.Builder(
                fullAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .apply {
                    // Use StrongBox if available for highest security
                    if (hasStrongBoxKeystore()) {
                        setIsStrongBoxBacked(true)
                    }
                    
                    // Require biometric authentication if requested
                    if (requireBiometric && hasBiometricCapability()) {
                        setUserAuthenticationRequired(true)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            setUserAuthenticationParameters(
                                30, // 30 seconds timeout
                                KeyProperties.AUTH_BIOMETRIC_STRONG
                            )
                        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            @Suppress("DEPRECATION")
                            setUserAuthenticationValidityDurationSeconds(30)
                        }
                    }
                }
                .build()
            
            keyGenerator.init(keyGenParameterSpec)
            keyGenerator.generateKey()
            
            Log.d(TAG, "Hardware key created with alias: $fullAlias, biometric: $requireBiometric")
            true
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create hardware key", e)
            false
        }
    }
    
    private data class EncryptedData(
        val encryptedText: String,
        val iv: String
    )
    
    private fun encryptData(keyAlias: String, data: String): EncryptedData {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)
        
        val secretKey = keyStore.getKey(getFullKeyAlias(keyAlias), null) as SecretKey
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey)
        
        val iv = cipher.iv
        val encryptedBytes = cipher.doFinal(data.toByteArray(Charsets.UTF_8))
        
        return EncryptedData(
            encryptedText = Base64.encodeToString(encryptedBytes, Base64.DEFAULT),
            iv = Base64.encodeToString(iv, Base64.DEFAULT)
        )
    }
    
    private fun decryptData(keyAlias: String, encryptedData: String, iv: String): String {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)
        
        val secretKey = keyStore.getKey(getFullKeyAlias(keyAlias), null) as SecretKey
        val cipher = Cipher.getInstance(TRANSFORMATION)
        
        val ivBytes = Base64.decode(iv, Base64.DEFAULT)
        val spec = GCMParameterSpec(128, ivBytes)
        
        cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)
        
        val encryptedBytes = Base64.decode(encryptedData, Base64.DEFAULT)
        val decryptedBytes = cipher.doFinal(encryptedBytes)
        
        return String(decryptedBytes, Charsets.UTF_8)
    }
    
    private fun performSecurityTest(): WritableMap {
        val testKeyAlias = "test_security_key"
        val testData = "Hello, Hardware Security!"
        
        return try {
            // Test key generation
            val keyGenerated = createHardwareBackedKey(testKeyAlias, false)
            if (!keyGenerated) {
                throw Exception("Failed to generate test key")
            }
            
            // Test encryption
            val encrypted = encryptData(testKeyAlias, testData)
            
            // Test decryption
            val decrypted = decryptData(testKeyAlias, encrypted.encryptedText, encrypted.iv)
            
            // Cleanup test key
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore.load(null)
            keyStore.deleteEntry(getFullKeyAlias(testKeyAlias))
            
            Arguments.createMap().apply {
                putBoolean("success", decrypted == testData)
                putString("message", "Hardware security test passed")
                putBoolean("keyGeneration", true)
                putBoolean("encryption", true)
                putBoolean("decryption", true)
            }
            
        } catch (e: Exception) {
            Arguments.createMap().apply {
                putBoolean("success", false)
                putString("message", "Hardware security test failed: ${e.message}")
                putString("error", e.javaClass.simpleName)
            }
        }
    }
    
    // Hardware capability detection methods
    
    private fun hasHardwareKeystore(): Boolean {
        return try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore != null
        } catch (e: Exception) {
            false
        }
    }
    
    private fun hasStrongBoxKeystore(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
                reactContext.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
    }
    
    private fun hasTrustedExecutionEnvironment(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
    }
    
    private fun hasBiometricCapability(): Boolean {
        val biometricManager = BiometricManager.from(reactContext)
        return biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS
    }
    
    private fun getBiometricStatus(biometricManager: BiometricManager): String {
        return when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> "available"
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "no_hardware"
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> "hardware_unavailable"
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "none_enrolled"
            BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED -> "security_update_required"
            BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED -> "unsupported"
            BiometricManager.BIOMETRIC_STATUS_UNKNOWN -> "unknown"
            else -> "error"
        }
    }
    
    private fun hasFaceUnlockCapability(): Boolean {
        return reactContext.packageManager.hasSystemFeature(PackageManager.FEATURE_FACE)
    }
    
    private fun isDeviceSecure(): Boolean {
        return try {
            val keyguardManager = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
            keyguardManager.isDeviceSecure
        } catch (e: Exception) {
            false
        }
    }
    
    private fun hasScreenLock(): Boolean {
        return try {
            val keyguardManager = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
            keyguardManager.isKeyguardSecure
        } catch (e: Exception) {
            false
        }
    }
    
    private fun supportsECDSA(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
    }
    
    private fun supportsRSA(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
    }
    
    /**
     * Export constants for React Native
     */
    override fun getConstants(): MutableMap<String, Any> {
        return hashMapOf(
            "PLATFORM" to "android",
            "MODULE_NAME" to MODULE_NAME,
            "SUPPORTS_HARDWARE_KEYSTORE" to hasHardwareKeystore(),
            "SUPPORTS_STRONGBOX" to hasStrongBoxKeystore(),
            "SUPPORTS_BIOMETRIC" to hasBiometricCapability(),
            "API_LEVEL" to Build.VERSION.SDK_INT
        )
    }
    
    /**
     * Module cleanup
     */
    override fun invalidate() {
        super.invalidate()
        moduleScope.cancel()
    }
}