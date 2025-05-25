package com.bookmarkai.share.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi

/**
 * Manages authentication tokens for BookmarkAI API.
 * Uses encrypted shared preferences to securely store tokens.
 */
class TokenManager(private val context: Context) {
    
    private val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
    private val sharedPreferences = EncryptedSharedPreferences.create(
        "bookmarkai_auth_tokens",
        masterKeyAlias,
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    private val moshi = Moshi.Builder().build()
    private val tokensAdapter = moshi.adapter(AuthTokens::class.java)
    
    companion object {
        private const val KEY_AUTH_TOKENS = "auth_tokens"
    }
    
    /**
     * Get stored authentication tokens
     */
    fun getTokens(): AuthTokens? {
        return try {
            val tokensJson = sharedPreferences.getString(KEY_AUTH_TOKENS, null)
            tokensJson?.let { tokensAdapter.fromJson(it) }
        } catch (e: Exception) {
            android.util.Log.e("TokenManager", "Error reading tokens", e)
            null
        }
    }
    
    /**
     * Save authentication tokens
     */
    fun saveTokens(tokens: AuthTokens) {
        try {
            val tokensJson = tokensAdapter.toJson(tokens)
            sharedPreferences.edit()
                .putString(KEY_AUTH_TOKENS, tokensJson)
                .apply()
        } catch (e: Exception) {
            android.util.Log.e("TokenManager", "Error saving tokens", e)
        }
    }
    
    /**
     * Clear all stored tokens
     */
    fun clearTokens() {
        sharedPreferences.edit()
            .remove(KEY_AUTH_TOKENS)
            .apply()
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