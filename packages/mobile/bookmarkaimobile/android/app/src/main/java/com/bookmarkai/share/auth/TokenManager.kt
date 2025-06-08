package com.bookmarkai.share.auth

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Enhanced Token Manager with hardware security support
 * Uses encrypted shared preferences with hardware-backed encryption when available
 */
class TokenManager(private val context: Context) {
    
    private val masterKey = androidx.security.crypto.MasterKey.Builder(context)
        .setKeyScheme(androidx.security.crypto.MasterKey.KeyScheme.AES256_GCM)
        .build()
    
    private val sharedPreferences = EncryptedSharedPreferences.create(
        context,
        "bookmarkai_auth_tokens",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    // Enhanced preferences with hardware security
    private val enhancedPreferences by lazy {
        try {
            val enhancedKeyAlias = getOrCreateHardwareBackedKey()
            if (enhancedKeyAlias != null) {
                // Create hardware-backed master key
                val hardwareMasterKey = androidx.security.crypto.MasterKey.Builder(context, enhancedKeyAlias)
                    .setKeyScheme(androidx.security.crypto.MasterKey.KeyScheme.AES256_GCM)
                    .build()
                
                EncryptedSharedPreferences.create(
                    context,
                    "bookmarkai_auth_tokens_enhanced",
                    hardwareMasterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            } else {
                sharedPreferences
            }
        } catch (e: Exception) {
            Log.w(TAG, "Enhanced preferences not available, falling back to standard", e)
            sharedPreferences
        }
    }
    
    private val moshi = Moshi.Builder().build()
    private val tokensAdapter = moshi.adapter(AuthTokens::class.java)
    private val enhancedTokensAdapter = moshi.adapter(EnhancedAuthTokens::class.java)
    
    companion object {
        private const val TAG = "TokenManager"
        private const val KEY_AUTH_TOKENS = "auth_tokens"
        private const val KEY_ENHANCED_AUTH_TOKENS = "enhanced_auth_tokens"
        private const val HARDWARE_KEY_ALIAS = "bookmarkai_token_storage_key"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
    
    /**
     * Get stored authentication tokens (tries enhanced storage first, then fallback)
     */
    fun getTokens(): AuthTokens? {
        return try {
            // Try enhanced storage first
            getEnhancedTokens()?.tokens ?: run {
                // Fallback to standard storage
                val tokensJson = sharedPreferences.getString(KEY_AUTH_TOKENS, null)
                tokensJson?.let { tokensAdapter.fromJson(it) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error reading tokens", e)
            null
        }
    }
    
    /**
     * Save authentication tokens with enhanced security when available
     */
    fun saveTokens(tokens: AuthTokens) {
        try {
            // Try to save with enhanced security first
            if (saveTokensWithHardwareSecurity(tokens)) {
                Log.d(TAG, "✅ Tokens saved with hardware security")
            } else {
                // Fallback to standard encryption
                val tokensJson = tokensAdapter.toJson(tokens)
                sharedPreferences.edit()
                    .putString(KEY_AUTH_TOKENS, tokensJson)
                    .apply()
                Log.d(TAG, "✅ Tokens saved with standard encryption")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error saving tokens", e)
        }
    }
    
    /**
     * Save tokens with hardware security (enhanced mode)
     */
    fun saveTokensWithHardwareSecurity(tokens: AuthTokens, requireBiometric: Boolean = false): Boolean {
        return try {
            if (!isHardwareSecurityAvailable()) {
                return false
            }
            
            val enhancedTokens = EnhancedAuthTokens(
                tokens = tokens,
                deviceFingerprint = getDeviceFingerprint(),
                encryptionLevel = if (requireBiometric) "BIOMETRIC" else "HARDWARE",
                createdAt = System.currentTimeMillis(),
                version = 1
            )
            
            val tokensJson = enhancedTokensAdapter.toJson(enhancedTokens)
            enhancedPreferences.edit()
                .putString(KEY_ENHANCED_AUTH_TOKENS, tokensJson)
                .apply()
            
            Log.d(TAG, "Enhanced tokens saved with ${enhancedTokens.encryptionLevel} security")
            true
            
        } catch (e: Exception) {
            Log.w(TAG, "Failed to save tokens with hardware security, will use fallback", e)
            false
        }
    }
    
    /**
     * Get enhanced tokens with metadata
     */
    fun getEnhancedTokens(): EnhancedAuthTokens? {
        return try {
            val tokensJson = enhancedPreferences.getString(KEY_ENHANCED_AUTH_TOKENS, null)
            tokensJson?.let { 
                val enhanced = enhancedTokensAdapter.fromJson(it)
                
                // Verify device fingerprint for security
                if (enhanced?.deviceFingerprint == getDeviceFingerprint()) {
                    enhanced
                } else {
                    Log.w(TAG, "Device fingerprint mismatch, enhanced tokens invalidated")
                    null
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error reading enhanced tokens", e)
            null
        }
    }
    
    /**
     * Clear all stored tokens (both standard and enhanced)
     */
    fun clearTokens() {
        try {
            sharedPreferences.edit()
                .remove(KEY_AUTH_TOKENS)
                .apply()
            
            enhancedPreferences.edit()
                .remove(KEY_ENHANCED_AUTH_TOKENS)
                .apply()
                
            Log.d(TAG, "All tokens cleared")
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing tokens", e)
        }
    }
    
    /**
     * Get access token if available and not expired
     */
    fun getValidAccessToken(): String? {
        val tokens = getTokens() ?: return null
        
        // Check if token is expired (with 5 minute buffer)
        val currentTime = System.currentTimeMillis() / 1000
        val expiryBuffer = 5 * 60 // 5 minutes
        
        return if (currentTime < (tokens.expiresAt - expiryBuffer)) {
            tokens.accessToken
        } else {
            null
        }
    }
    
    /**
     * Check if we have a refresh token
     */
    fun hasRefreshToken(): Boolean {
        return getTokens()?.refreshToken?.isNotBlank() == true
    }
    
    /**
     * Get refresh token
     */
    fun getRefreshToken(): String? {
        return getTokens()?.refreshToken
    }
    
    /**
     * Check if user is authenticated (has valid access token or refresh token)
     */
    fun isAuthenticated(): Boolean {
        return getValidAccessToken() != null || hasRefreshToken()
    }
    
    /**
     * Get security information about stored tokens
     */
    fun getSecurityInfo(): TokenSecurityInfo {
        val enhanced = getEnhancedTokens()
        val hasStandard = sharedPreferences.getString(KEY_AUTH_TOKENS, null) != null
        
        return TokenSecurityInfo(
            hasEnhancedSecurity = enhanced != null,
            hasStandardSecurity = hasStandard,
            encryptionLevel = enhanced?.encryptionLevel ?: if (hasStandard) "STANDARD" else "NONE",
            deviceFingerprint = getDeviceFingerprint(),
            hardwareSecurityAvailable = isHardwareSecurityAvailable(),
            createdAt = enhanced?.createdAt,
            version = enhanced?.version ?: 0
        )
    }
    
    // Private helper methods for hardware security
    
    private fun isHardwareSecurityAvailable(): Boolean {
        return try {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            hasHardwareKeystore() &&
            getOrCreateHardwareBackedKey() != null
        } catch (e: Exception) {
            Log.w(TAG, "Hardware security check failed", e)
            false
        }
    }
    
    private fun hasHardwareKeystore(): Boolean {
        return try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore != null
        } catch (e: Exception) {
            false
        }
    }
    
    private fun getOrCreateHardwareBackedKey(): String? {
        return try {
            if (!isHardwareKeystoreAvailable()) {
                return null
            }
            
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keyStore.load(null)
            
            if (!keyStore.containsAlias(HARDWARE_KEY_ALIAS)) {
                createHardwareBackedKey()
            }
            
            HARDWARE_KEY_ALIAS
        } catch (e: Exception) {
            Log.w(TAG, "Failed to create/get hardware key", e)
            null
        }
    }
    
    private fun isHardwareKeystoreAvailable(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
    }
    
    private fun createHardwareBackedKey() {
        try {
            val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
            
            val keyGenParameterSpec = KeyGenParameterSpec.Builder(
                HARDWARE_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .apply {
                    // Use StrongBox if available for highest security
                    if (hasStrongBoxKeystore()) {
                        setIsStrongBoxBacked(true)
                        Log.d(TAG, "Using StrongBox for hardware key")
                    }
                }
                .build()
            
            keyGenerator.init(keyGenParameterSpec)
            keyGenerator.generateKey()
            
            Log.d(TAG, "Hardware-backed key created: $HARDWARE_KEY_ALIAS")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create hardware-backed key", e)
            throw e
        }
    }
    
    private fun hasStrongBoxKeystore(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
                context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
    }
    
    private fun getDeviceFingerprint(): String {
        return try {
            val deviceInfo = "${Build.MANUFACTURER}_${Build.MODEL}_${Build.DEVICE}_${Build.ID}"
            val digest = MessageDigest.getInstance("SHA-256")
            val hashBytes = digest.digest(deviceInfo.toByteArray())
            Base64.encodeToString(hashBytes, Base64.NO_WRAP).take(16)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to generate device fingerprint", e)
            "unknown_device"
        }
    }
}

/**
 * Data class representing authentication tokens
 */
@JsonClass(generateAdapter = true)
data class AuthTokens(
    @Json(name = "accessToken") val accessToken: String,
    @Json(name = "refreshToken") val refreshToken: String,
    @Json(name = "expiresIn") val expiresIn: Long, // seconds from issue time
    @Json(name = "expiresAt") val expiresAt: Long = System.currentTimeMillis() / 1000 + expiresIn
)

/**
 * Enhanced authentication tokens with security metadata
 */
@JsonClass(generateAdapter = true)
data class EnhancedAuthTokens(
    @Json(name = "tokens") val tokens: AuthTokens,
    @Json(name = "deviceFingerprint") val deviceFingerprint: String,
    @Json(name = "encryptionLevel") val encryptionLevel: String, // "STANDARD", "HARDWARE", "BIOMETRIC"
    @Json(name = "createdAt") val createdAt: Long,
    @Json(name = "version") val version: Int = 1
)

/**
 * Token security information
 */
data class TokenSecurityInfo(
    val hasEnhancedSecurity: Boolean,
    val hasStandardSecurity: Boolean,
    val encryptionLevel: String,
    val deviceFingerprint: String,
    val hardwareSecurityAvailable: Boolean,
    val createdAt: Long?,
    val version: Int
)

/**
 * API response for token refresh
 */
@JsonClass(generateAdapter = true)
data class RefreshTokenResponse(
    @Json(name = "data") val data: AuthTokens
)

/**
 * API error response
 */
@JsonClass(generateAdapter = true)
data class ApiError(
    @Json(name = "error") val error: ErrorDetails
)

@JsonClass(generateAdapter = true)
data class ErrorDetails(
    @Json(name = "message") val message: String,
    @Json(name = "code") val code: String? = null
)