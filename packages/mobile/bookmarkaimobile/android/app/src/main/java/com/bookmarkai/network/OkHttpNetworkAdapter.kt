package com.bookmarkai.network

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

/**
 * Enhanced OkHttp Network Adapter for React Native
 * Provides native HTTP performance with certificate pinning, progress tracking, and cancellation support
 */
class OkHttpNetworkAdapter(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        const val MODULE_NAME = "OkHttpNetworkAdapter"
        private const val TAG = "OkHttpNetworkAdapter"
        private const val EVENT_UPLOAD_PROGRESS = "OkHttpUploadProgress"
        private const val EVENT_DOWNLOAD_PROGRESS = "OkHttpDownloadProgress"
    }
    
    private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val requestTasks = ConcurrentHashMap<String, Call>()
    
    // Base OkHttp client with optimized configuration
    private val baseClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .callTimeout(120, TimeUnit.SECONDS)
            .addInterceptor(createLoggingInterceptor())
            .addInterceptor(CertificatePinningInterceptor())
            .addNetworkInterceptor(ProgressInterceptor())
            .connectionPool(ConnectionPool(5, 5, TimeUnit.MINUTES))
            .retryOnConnectionFailure(true)
            .build()
    }
    
    override fun getName(): String = MODULE_NAME
    
    /**
     * Make HTTP request with enhanced error handling and progress tracking
     */
    @ReactMethod
    fun request(config: ReadableMap, promise: Promise) {
        moduleScope.launch {
            try {
                val requestId = config.getString("requestId") ?: generateRequestId()
                val url = config.getString("url") ?: throw IllegalArgumentException("URL is required")
                val method = config.getString("method") ?: "GET"
                val headers = config.getMap("headers")
                val body = config.getString("body")
                val timeout = config.getDouble("timeout").takeIf { it > 0 }?.toLong()
                val priority = config.getString("priority") ?: "normal"
                
                Log.d(TAG, "Making $method request to $url with priority: $priority")
                
                // Create client with priority-specific configuration
                val client = createPriorityClient(priority, timeout)
                
                // Build request
                val request = buildRequest(url, method, headers, body, requestId)
                
                // Execute request with tracking
                val call = client.newCall(request)
                requestTasks[requestId] = call
                
                val response = call.await()
                requestTasks.remove(requestId)
                
                // Process response
                val result = processResponse(response, requestId)
                promise.resolve(result)
                
            } catch (e: Exception) {
                Log.e(TAG, "Request failed", e)
                promise.reject("NETWORK_ERROR", e.message ?: "Unknown network error", e)
            }
        }
    }
    
    /**
     * Cancel specific request
     */
    @ReactMethod
    fun cancelRequest(requestId: String, promise: Promise) {
        try {
            val call = requestTasks[requestId]
            if (call != null) {
                call.cancel()
                requestTasks.remove(requestId)
                Log.d(TAG, "Cancelled request: $requestId")
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", "Failed to cancel request", e)
        }
    }
    
    /**
     * Cancel all pending requests
     */
    @ReactMethod
    fun cancelAllRequests(promise: Promise) {
        try {
            val cancelledCount = requestTasks.size
            requestTasks.values.forEach { it.cancel() }
            requestTasks.clear()
            
            Log.d(TAG, "Cancelled $cancelledCount requests")
            promise.resolve(cancelledCount)
        } catch (e: Exception) {
            promise.reject("CANCEL_ALL_ERROR", "Failed to cancel all requests", e)
        }
    }
    
    /**
     * Get network adapter info and capabilities
     */
    @ReactMethod
    fun getAdapterInfo(promise: Promise) {
        try {
            val info = Arguments.createMap().apply {
                putString("name", "OkHttpNetworkAdapter")
                putString("version", "1.0.0")
                putBoolean("supportsCertificatePinning", true)
                putBoolean("supportsProgressTracking", true)
                putBoolean("supportsCancellation", true)
                putBoolean("supportsConnectionPooling", true)
                putInt("activeRequests", requestTasks.size)
                putInt("connectionPoolSize", baseClient.connectionPool.connectionCount())
            }
            promise.resolve(info)
        } catch (e: Exception) {
            promise.reject("INFO_ERROR", "Failed to get adapter info", e)
        }
    }
    
    /**
     * Test network connectivity and adapter functionality
     */
    @ReactMethod
    fun testAdapter(testUrl: String?, promise: Promise) {
        moduleScope.launch {
            try {
                val url = testUrl ?: "https://httpbin.org/get"
                Log.d(TAG, "Testing adapter with URL: $url")
                
                val request = Request.Builder()
                    .url(url)
                    .get()
                    .addHeader("User-Agent", "BookmarkAI-OkHttp/1.0")
                    .build()
                
                val response = baseClient.newCall(request).await()
                
                val result = Arguments.createMap().apply {
                    putBoolean("success", response.isSuccessful)
                    putInt("statusCode", response.code)
                    putString("statusMessage", response.message)
                    putBoolean("isRedirect", response.isRedirect)
                    putDouble("responseTime", response.receivedResponseAtMillis - response.sentRequestAtMillis.toDouble())
                }
                
                response.close()
                promise.resolve(result)
                
            } catch (e: Exception) {
                Log.e(TAG, "Adapter test failed", e)
                promise.reject("TEST_ERROR", "Adapter test failed: ${e.message}", e)
            }
        }
    }
    
    /**
     * Create priority-specific client configuration
     */
    private fun createPriorityClient(priority: String, timeout: Long?): OkHttpClient {
        val builder = baseClient.newBuilder()
        
        when (priority.lowercase()) {
            "high", "urgent" -> {
                builder
                    .connectTimeout(10, TimeUnit.SECONDS)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .writeTimeout(30, TimeUnit.SECONDS)
                    .protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
            }
            "low", "background" -> {
                builder
                    .connectTimeout(60, TimeUnit.SECONDS)
                    .readTimeout(120, TimeUnit.SECONDS)
                    .writeTimeout(120, TimeUnit.SECONDS)
            }
        }
        
        // Apply custom timeout if provided
        timeout?.let {
            val timeoutSeconds = it / 1000
            builder
                .connectTimeout(timeoutSeconds, TimeUnit.SECONDS)
                .readTimeout(timeoutSeconds, TimeUnit.SECONDS)
                .writeTimeout(timeoutSeconds, TimeUnit.SECONDS)
        }
        
        return builder.build()
    }
    
    /**
     * Build OkHttp request from React Native config
     */
    private fun buildRequest(
        url: String, 
        method: String, 
        headers: ReadableMap?, 
        body: String?,
        requestId: String
    ): Request {
        val builder = Request.Builder()
            .url(url)
            .addHeader("X-Request-ID", requestId)
            .addHeader("User-Agent", "BookmarkAI-Mobile/1.0 (OkHttp)")
        
        // Add headers
        headers?.let { headersMap ->
            val iterator = headersMap.entryIterator
            while (iterator.hasNext()) {
                val entry = iterator.next()
                val value = when (val headerValue = entry.value) {
                    is String -> headerValue
                    is Double -> headerValue.toString()
                    is Boolean -> headerValue.toString()
                    else -> headerValue.toString()
                }
                builder.addHeader(entry.key, value)
            }
        }
        
        // Set method and body
        when (method.uppercase()) {
            "GET" -> builder.get()
            "POST" -> {
                val requestBody = body?.toRequestBody("application/json".toMediaType()) 
                    ?: "".toRequestBody("application/json".toMediaType())
                builder.post(requestBody)
            }
            "PUT" -> {
                val requestBody = body?.toRequestBody("application/json".toMediaType()) 
                    ?: "".toRequestBody("application/json".toMediaType())
                builder.put(requestBody)
            }
            "DELETE" -> {
                val requestBody = body?.toRequestBody("application/json".toMediaType())
                builder.delete(requestBody)
            }
            "PATCH" -> {
                val requestBody = body?.toRequestBody("application/json".toMediaType()) 
                    ?: "".toRequestBody("application/json".toMediaType())
                builder.patch(requestBody)
            }
            "HEAD" -> builder.head()
            else -> throw IllegalArgumentException("Unsupported HTTP method: $method")
        }
        
        return builder.build()
    }
    
    /**
     * Process OkHttp response for React Native
     */
    private suspend fun processResponse(response: Response, requestId: String): WritableMap = withContext(Dispatchers.IO) {
        val responseBody = response.body?.string() ?: ""
        
        Arguments.createMap().apply {
            putString("requestId", requestId)
            putInt("status", response.code)
            putString("statusText", response.message)
            putBoolean("ok", response.isSuccessful)
            putString("data", responseBody)
            
            // Response headers
            val headersMap = Arguments.createMap()
            response.headers.forEach { pair ->
                headersMap.putString(pair.first, pair.second)
            }
            putMap("headers", headersMap)
            
            // Timing information
            putDouble("responseTime", response.receivedResponseAtMillis - response.sentRequestAtMillis.toDouble())
            putBoolean("isRedirect", response.isRedirect)
            
            // Network information
            val networkInfo = Arguments.createMap().apply {
                response.networkResponse?.let { networkResp ->
                    putInt("networkStatus", networkResp.code)
                    putString("protocol", networkResp.protocol.toString())
                }
                response.cacheResponse?.let {
                    putBoolean("fromCache", true)
                }
            }
            putMap("networkInfo", networkInfo)
        }
    }
    
    /**
     * Create logging interceptor for development
     */
    private fun createLoggingInterceptor(): Interceptor {
        return Interceptor { chain ->
            val request = chain.request()
            val startTime = System.nanoTime()
            
            Log.d(TAG, "→ ${request.method} ${request.url}")
            
            try {
                val response = chain.proceed(request)
                val endTime = System.nanoTime()
                val duration = (endTime - startTime) / 1_000_000 // Convert to milliseconds
                
                Log.d(TAG, "← ${response.code} ${request.url} (${duration}ms)")
                response
            } catch (e: Exception) {
                val endTime = System.nanoTime()
                val duration = (endTime - startTime) / 1_000_000
                
                Log.e(TAG, "✗ ${request.method} ${request.url} failed after ${duration}ms", e)
                throw e
            }
        }
    }
    
    /**
     * Generate unique request ID
     */
    private fun generateRequestId(): String {
        return "okhttp_${System.currentTimeMillis()}_${(Math.random() * 1000).toInt()}"
    }
    
    /**
     * Send progress event to React Native
     */
    private fun sendProgressEvent(requestId: String, bytesTransferred: Long, totalBytes: Long, type: String) {
        try {
            val progressData = Arguments.createMap().apply {
                putString("requestId", requestId)
                putDouble("bytesTransferred", bytesTransferred.toDouble())
                putDouble("totalBytes", totalBytes.toDouble())
                putDouble("progress", if (totalBytes > 0) bytesTransferred.toDouble() / totalBytes else 0.0)
                putString("type", type)
            }
            
            val eventName = if (type == "upload") EVENT_UPLOAD_PROGRESS else EVENT_DOWNLOAD_PROGRESS
            
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, progressData)
                
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send progress event", e)
        }
    }
    
    /**
     * Progress tracking interceptor
     */
    private inner class ProgressInterceptor : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val request = chain.request()
            val requestId = request.header("X-Request-ID") ?: ""
            
            // Wrap request body for upload progress
            val wrappedRequest = if (request.body != null) {
                val progressRequestBody = ProgressRequestBody(request.body!!) { bytesWritten, contentLength ->
                    sendProgressEvent(requestId, bytesWritten, contentLength, "upload")
                }
                request.newBuilder().method(request.method, progressRequestBody).build()
            } else {
                request
            }
            
            val response = chain.proceed(wrappedRequest)
            
            // Wrap response body for download progress
            return if (response.body != null) {
                val progressResponseBody = ProgressResponseBody(response.body!!) { bytesRead, contentLength ->
                    sendProgressEvent(requestId, bytesRead, contentLength, "download")
                }
                response.newBuilder().body(progressResponseBody).build()
            } else {
                response
            }
        }
    }
    
    /**
     * Export constants for React Native
     */
    override fun getConstants(): MutableMap<String, Any> {
        return hashMapOf(
            "PLATFORM" to "android",
            "ADAPTER_NAME" to "OkHttp",
            "SUPPORTS_CERTIFICATE_PINNING" to true,
            "SUPPORTS_PROGRESS_TRACKING" to true,
            "SUPPORTS_CANCELLATION" to true,
            "EVENTS" to arrayOf(EVENT_UPLOAD_PROGRESS, EVENT_DOWNLOAD_PROGRESS)
        )
    }
    
    /**
     * Module cleanup
     */
    override fun invalidate() {
        super.invalidate()
        moduleScope.cancel()
        requestTasks.values.forEach { it.cancel() }
        requestTasks.clear()
    }
}

/**
 * Suspend extension for OkHttp Call
 */
private suspend fun Call.await(): Response = suspendCoroutine { continuation ->
    enqueue(object : okhttp3.Callback {
        override fun onResponse(call: Call, response: Response) {
            continuation.resume(response)
        }
        
        override fun onFailure(call: Call, e: IOException) {
            continuation.resumeWithException(e)
        }
    })
}