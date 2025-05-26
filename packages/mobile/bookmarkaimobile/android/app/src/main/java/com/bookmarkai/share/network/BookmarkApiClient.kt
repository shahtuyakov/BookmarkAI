package com.bookmarkai.share.network

import android.content.Context
import com.bookmarkai.share.auth.AuthTokens
import com.bookmarkai.share.auth.RefreshTokenResponse
import com.bookmarkai.share.auth.TokenManager
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * HTTP client for BookmarkAI API operations.
 * Handles authentication, token refresh, and share creation.
 */
class BookmarkApiClient(context: Context) {
    
    private val tokenManager = TokenManager(context)
    private val moshi = Moshi.Builder().build()
    
    // API configuration - matches React Native client configuration
    private val baseUrl = "http://10.0.2.2:3001/api" // Android emulator localhost
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(AuthInterceptor())
        .addInterceptor(createLoggingInterceptor())
        .build()
    
    /**
     * Create a new share on the server
     */
    suspend fun createShare(url: String, idempotencyKey: String): ApiResult<Share> {
        return try {
            val requestBody = CreateShareRequest(url)
            val json = moshi.adapter(CreateShareRequest::class.java).toJson(requestBody)
            
            val request = Request.Builder()
                .url("$baseUrl/v1/shares")
                .post(json.toRequestBody("application/json".toMediaType()))
                .addHeader("Content-Type", "application/json")
                .addHeader("Idempotency-Key", idempotencyKey)
                .build()
            
            val response = client.newCall(request).execute()
            handleResponse<ShareResponse, Share>(response) { it.data }
            
        } catch (e: Exception) {
            android.util.Log.e("BookmarkApiClient", "Error creating share", e)
            ApiResult.Error(e)
        }
    }
    
    /**
     * Refresh authentication tokens
     */
    suspend fun refreshTokens(): ApiResult<AuthTokens> {
        return try {
            val refreshToken = tokenManager.getRefreshToken()
                ?: return ApiResult.Error(Exception("No refresh token available"))
            
            val requestBody = RefreshTokenRequest(refreshToken)
            val json = moshi.adapter(RefreshTokenRequest::class.java).toJson(requestBody)
            
            val request = Request.Builder()
                .url("$baseUrl/auth/refresh")
                .post(json.toRequestBody("application/json".toMediaType()))
                .addHeader("Content-Type", "application/json")
                .build()
            
            val response = client.newCall(request).execute()
            val result = handleResponse<RefreshTokenResponse, AuthTokens>(response) { it.data }
            
            // Save new tokens if successful
            if (result is ApiResult.Success) {
                tokenManager.saveTokens(result.data)
            }
            
            result
            
        } catch (e: Exception) {
            android.util.Log.e("BookmarkApiClient", "Error refreshing tokens", e)
            ApiResult.Error(e)
        }
    }
    
    /**
     * Generic response handler
     */
    private inline fun <reified T, R> handleResponse(
        response: Response,
        transform: (T) -> R
    ): ApiResult<R> {
        return try {
            val responseBody = response.body?.string() ?: ""
            
            when (response.code) {
                in 200..299 -> {
                    val adapter = moshi.adapter(T::class.java)
                    val data = adapter.fromJson(responseBody)
                    if (data != null) {
                        ApiResult.Success(transform(data))
                    } else {
                        ApiResult.Error(Exception("Failed to parse response"))
                    }
                }
                401 -> ApiResult.AuthError(Exception("Authentication failed"))
                429 -> ApiResult.RateLimitError(Exception("Rate limit exceeded"))
                in 400..499 -> ApiResult.ClientError(Exception("Client error: ${response.code}"))
                in 500..599 -> ApiResult.ServerError(Exception("Server error: ${response.code}"))
                else -> ApiResult.Error(Exception("Unknown error: ${response.code}"))
            }
        } catch (e: Exception) {
            ApiResult.Error(e)
        }
    }
    
    /**
     * Create logging interceptor for debugging
     */
    private fun createLoggingInterceptor(): HttpLoggingInterceptor {
        return HttpLoggingInterceptor { message ->
            android.util.Log.d("BookmarkAPI", message)
        }.apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
    }
    
    /**
     * Interceptor that adds authentication headers
     */
    private inner class AuthInterceptor : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val originalRequest = chain.request()
            
            // Skip auth for token refresh requests
            if (originalRequest.url.encodedPath.contains("/auth/refresh")) {
                return chain.proceed(originalRequest)
            }
            
            // Add access token if available
            val accessToken = tokenManager.getValidAccessToken()
            val request = if (accessToken != null) {
                originalRequest.newBuilder()
                    .addHeader("Authorization", "Bearer $accessToken")
                    .build()
            } else {
                originalRequest
            }
            
            return chain.proceed(request)
        }
    }
}

/**
 * Sealed class for API results
 */
sealed class ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>()
    data class Error(val exception: Throwable) : ApiResult<Nothing>()
    data class AuthError(val exception: Throwable) : ApiResult<Nothing>()
    data class RateLimitError(val exception: Throwable) : ApiResult<Nothing>()
    data class ClientError(val exception: Throwable) : ApiResult<Nothing>()
    data class ServerError(val exception: Throwable) : ApiResult<Nothing>()
}

/**
 * Request/Response data classes
 */
@JsonClass(generateAdapter = true)
data class CreateShareRequest(
    @Json(name = "url") val url: String
)

@JsonClass(generateAdapter = true)
data class RefreshTokenRequest(
    @Json(name = "refreshToken") val refreshToken: String
)

@JsonClass(generateAdapter = true)
data class ShareResponse(
    @Json(name = "data") val data: Share
)

@JsonClass(generateAdapter = true)
data class Share(
    @Json(name = "id") val id: String,
    @Json(name = "url") val url: String,
    @Json(name = "platform") val platform: String,
    @Json(name = "status") val status: String,
    @Json(name = "createdAt") val createdAt: String,
    @Json(name = "updatedAt") val updatedAt: String,
    @Json(name = "metadata") val metadata: ShareMetadata? = null
)

@JsonClass(generateAdapter = true)
data class ShareMetadata(
    @Json(name = "author") val author: String? = null,
    @Json(name = "title") val title: String? = null,
    @Json(name = "description") val description: String? = null,
    @Json(name = "thumbnailUrl") val thumbnailUrl: String? = null
)