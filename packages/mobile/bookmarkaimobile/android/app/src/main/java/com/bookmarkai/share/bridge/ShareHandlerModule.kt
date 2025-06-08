package com.bookmarkai.share.bridge

import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.bookmarkai.share.database.BookmarkDatabase
import com.bookmarkai.share.database.BookmarkQueueStatus
import com.bookmarkai.share.work.ShareUploadWorker
import com.bookmarkai.share.auth.TokenManager
import com.bookmarkai.share.auth.AuthTokens
import com.bookmarkai.share.database.BookmarkQueueEntity
import kotlinx.coroutines.*
import java.util.*

/**
 * React Native module that bridges Android share functionality to JavaScript.
 * Enhanced with authentication token synchronization.
 */
class ShareHandlerModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
    
    private val database = BookmarkDatabase.getDatabase(reactContext)
    private val tokenManager = TokenManager(reactContext)
    private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    companion object {
        private const val MODULE_NAME = "ShareHandler"
        private const val EVENT_SHARE_EXTENSION_DATA = "ShareExtensionData"
        private const val EVENT_PENDING_COUNT_CHANGED = "PendingCountChanged"
    }
    
    override fun getName(): String = MODULE_NAME
    
    /**
     * Sync authentication tokens from React Native to Android native storage
     */
    @ReactMethod
    fun syncAuthTokens(
        accessToken: String,
        refreshToken: String,
        expiresIn: Double,
        promise: Promise
    ) {
        try {
            val authTokens = AuthTokens(
                accessToken = accessToken,
                refreshToken = refreshToken,
                expiresIn = expiresIn.toLong()
            )
            
            tokenManager.saveTokens(authTokens)
            
            // Verify tokens were saved correctly
            val savedTokens = tokenManager.getTokens()
            val isValid = savedTokens?.accessToken == accessToken && 
                         savedTokens.refreshToken == refreshToken
            
            if (isValid) {
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("message", "Tokens synced successfully")
                    putBoolean("isAuthenticated", tokenManager.isAuthenticated())
                })
            } else {
                promise.reject("SYNC_ERROR", "Token verification failed after sync")
            }
            
        } catch (e: Exception) {
            promise.reject("SYNC_ERROR", "Failed to sync auth tokens: ${e.message}", e)
        }
    }
    
    /**
     * Clear authentication tokens from Android native storage
     */
    @ReactMethod
    fun clearAuthTokens(promise: Promise) {
        try {
            tokenManager.clearTokens()
            
            // Verify tokens were cleared
            val isCleared = !tokenManager.isAuthenticated()
            
            if (isCleared) {
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("message", "Tokens cleared successfully")
                    putBoolean("isAuthenticated", false)
                })
            } else {
                promise.reject("CLEAR_ERROR", "Token clear verification failed")
            }
            
        } catch (e: Exception) {
            promise.reject("CLEAR_ERROR", "Failed to clear auth tokens: ${e.message}", e)
        }
    }
    
    /**
     * Check if user is authenticated in Android native storage
     */
    @ReactMethod
    fun isAuthenticated(promise: Promise) {
        try {
            val isAuth = tokenManager.isAuthenticated()
            val hasValidToken = tokenManager.getValidAccessToken() != null
            val hasRefreshToken = tokenManager.hasRefreshToken()
            
            promise.resolve(Arguments.createMap().apply {
                putBoolean("isAuthenticated", isAuth)
                putBoolean("hasValidAccessToken", hasValidToken)
                putBoolean("hasRefreshToken", hasRefreshToken)
            })
            
        } catch (e: Exception) {
            promise.reject("AUTH_CHECK_ERROR", "Failed to check auth status: ${e.message}", e)
        }
    }
    
    /**
     * Get detailed token information for debugging
     */
    @ReactMethod
    fun getTokenDebugInfo(promise: Promise) {
        try {
            val tokens = tokenManager.getTokens()
            val currentTime = System.currentTimeMillis() / 1000
            
            val debugInfo = Arguments.createMap().apply {
                putBoolean("hasTokens", tokens != null)
                putBoolean("isAuthenticated", tokenManager.isAuthenticated())
                putBoolean("hasValidAccessToken", tokenManager.getValidAccessToken() != null)
                putBoolean("hasRefreshToken", tokenManager.hasRefreshToken())
                
                if (tokens != null) {
                    putString("accessTokenPreview", tokens.accessToken.take(20) + "...")
                    putString("refreshTokenPreview", tokens.refreshToken.take(20) + "...")
                    putDouble("expiresAt", tokens.expiresAt.toDouble())
                    putDouble("currentTime", currentTime.toDouble())
                    putBoolean("isExpired", currentTime >= tokens.expiresAt)
                    putDouble("timeUntilExpiry", (tokens.expiresAt - currentTime).toDouble())
                } else {
                    putString("accessTokenPreview", "none")
                    putString("refreshTokenPreview", "none")
                    putDouble("expiresAt", 0.0)
                    putDouble("currentTime", currentTime.toDouble())
                    putBoolean("isExpired", true)
                    putDouble("timeUntilExpiry", 0.0)
                }
            }
            
            promise.resolve(debugInfo)
            
        } catch (e: Exception) {
            promise.reject("DEBUG_ERROR", "Failed to get token debug info: ${e.message}", e)
        }
    }

    // [Keep all existing methods: flushQueue, getPendingCount, etc.]
    
    /**
     * Flush the queue by triggering WorkManager upload AND process completed items
     */
    @ReactMethod
    fun flushQueue(promise: Promise) {
        try {
            // Schedule immediate upload work
            ShareUploadWorker.scheduleWork(reactContext)
            
            moduleScope.launch {
                try {
                    // Wait a moment for any immediate processing
                    delay(500)
                    
                    // Check for recently uploaded items and notify React Native
                    val recentlyUploaded = withContext(Dispatchers.IO) {
                        database.bookmarkQueueDao().getAllBookmarks().filter { 
                            it.status == BookmarkQueueStatus.UPLOADED &&
                            (System.currentTimeMillis() - it.updatedAt) < 30000 // Last 30 seconds
                        }
                    }
                    
                    if (recentlyUploaded.isNotEmpty()) {
                        // Convert to format expected by React Native
                        val sharesArray = Arguments.createArray()
                        
                        recentlyUploaded.forEach { item ->
                            val shareMap = Arguments.createMap().apply {
                                putString("url", item.url)
                                putString("id", item.id)
                                putDouble("timestamp", item.createdAt.toDouble())
                                putString("status", "uploaded")
                            }
                            sharesArray.pushMap(shareMap)
                        }
                        
                        // Send event to React Native
                        val eventData = Arguments.createMap().apply {
                            putBoolean("isQueue", true)
                            putArray("shares", sharesArray)
                            putBoolean("silent", true)
                            putString("source", "android_upload_complete")
                        }
                        
                        sendEvent(EVENT_SHARE_EXTENSION_DATA, eventData)
                    }
                    
                    // Get current pending count for response
                    val pendingCount = withContext(Dispatchers.IO) {
                        database.bookmarkQueueDao().getPendingCount()
                    }
                    
                    val result = Arguments.createMap().apply {
                        putInt("pendingCount", pendingCount)
                        putInt("processedCount", recentlyUploaded.size)
                        putString("status", "scheduled")
                        putBoolean("hasAuthTokens", tokenManager.isAuthenticated())
                    }
                    promise.resolve(result)
                    
                } catch (e: Exception) {
                    promise.reject("FLUSH_ERROR", "Failed to process queue", e)
                }
            }
            
        } catch (e: Exception) {
            promise.reject("FLUSH_ERROR", "Failed to schedule upload work", e)
        }
    }
    
    /**
     * Get current pending count
     */
    @ReactMethod
    fun getPendingCount(promise: Promise) {
        moduleScope.launch {
            try {
                val pendingCount = withContext(Dispatchers.IO) {
                    database.bookmarkQueueDao().getPendingCount()
                }
                promise.resolve(pendingCount)
            } catch (e: Exception) {
                promise.reject("COUNT_ERROR", "Failed to get pending count", e)
            }
        }
    }

    /**
     * Check for pending shares (Android equivalent of iOS checkPendingShares)
     */
    @ReactMethod
    fun checkPendingShares() {
        moduleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val dao = database.bookmarkQueueDao()
                    val pendingItems = dao.getPendingBookmarks()
                    val authNeededItems = dao.getBookmarksNeedingAuth()
                    val recentlyUploaded = dao.getAllBookmarks().filter { 
                        it.status == BookmarkQueueStatus.UPLOADED &&
                        (System.currentTimeMillis() - it.updatedAt) < 30000 // Last 30 seconds
                    }
                    
                    
                    // Process recently uploaded items first (show them in UI)
                    if (recentlyUploaded.isNotEmpty()) {
                        val sharesArray = Arguments.createArray()
                        
                        recentlyUploaded.forEach { item ->
                            val shareMap = Arguments.createMap().apply {
                                putString("url", item.url)
                                putString("id", item.id)
                                putDouble("timestamp", item.createdAt.toDouble())
                                putString("status", "uploaded")
                            }
                            sharesArray.pushMap(shareMap)
                        }
                        
                        val eventData = Arguments.createMap().apply {
                            putBoolean("isQueue", true)
                            putArray("shares", sharesArray)
                            putBoolean("silent", true)
                            putString("source", "android_check_completed")
                        }
                        
                        sendEvent(EVENT_SHARE_EXTENSION_DATA, eventData)
                    }
                    
                    // Send NEEDS_AUTH items to React Native for processing
                    if (authNeededItems.isNotEmpty()) {
                        val authSharesArray = Arguments.createArray()
                        
                        authNeededItems.forEach { item ->
                            val shareMap = Arguments.createMap().apply {
                                putString("url", item.url)
                                putString("id", item.id)
                                putDouble("timestamp", item.createdAt.toDouble())
                                putString("status", "needs_auth")
                            }
                            authSharesArray.pushMap(shareMap)
                        }
                        
                        val authEventData = Arguments.createMap().apply {
                            putBoolean("isQueue", true)
                            putArray("shares", authSharesArray)
                            putBoolean("silent", true)
                            putString("source", "android_needs_auth")
                            putBoolean("needsAuth", true)
                        }
                        
                        sendEvent(EVENT_SHARE_EXTENSION_DATA, authEventData)
                    }
                    
                    // Process pending items (schedule for upload)
                    if (pendingItems.isNotEmpty()) {
                        ShareUploadWorker.scheduleWork(reactContext)
                    }
                }
                
            } catch (e: Exception) {
                // Critical error handling for production debugging
            }
        }
    }

    /**
     * Get detailed queue status including recently completed items
     */
    @ReactMethod
    fun getQueueStatus(promise: Promise) {
        moduleScope.launch {
            try {
                val statusMap = withContext(Dispatchers.IO) {
                    val dao = database.bookmarkQueueDao()
                    val allItems = dao.getAllBookmarks()
                    val now = System.currentTimeMillis()
                    
                    Arguments.createMap().apply {
                        putInt("pending", allItems.count { it.status == BookmarkQueueStatus.PENDING })
                        putInt("uploading", allItems.count { it.status == BookmarkQueueStatus.UPLOADING })
                        putInt("uploaded", allItems.count { it.status == BookmarkQueueStatus.UPLOADED })
                        putInt("failed", allItems.count { it.status == BookmarkQueueStatus.FAILED })
                        putInt("needsAuth", allItems.count { it.status == BookmarkQueueStatus.NEEDS_AUTH })
                        putInt("total", allItems.size)
                        putInt("recentlyUploaded", allItems.count { 
                            it.status == BookmarkQueueStatus.UPLOADED && (now - it.updatedAt) < 60000 
                        })
                    }
                }
                
                promise.resolve(statusMap)
            } catch (e: Exception) {
                promise.reject("STATUS_ERROR", "Failed to get queue status", e)
            }
        }
    }
    
    /**
     * Get recently completed shares (for immediate UI updates)
     */
    @ReactMethod
    fun getRecentlyCompletedShares(promise: Promise) {
        moduleScope.launch {
            try {
                val recentShares = withContext(Dispatchers.IO) {
                    val dao = database.bookmarkQueueDao()
                    val cutoffTime = System.currentTimeMillis() - 60000 // Last minute
                    
                    dao.getAllBookmarks().filter { 
                        it.status == BookmarkQueueStatus.UPLOADED && it.updatedAt >= cutoffTime
                    }
                }
                
                val sharesArray = Arguments.createArray()
                recentShares.forEach { item ->
                    val shareMap = Arguments.createMap().apply {
                        putString("url", item.url)
                        putString("id", item.id)
                        putDouble("timestamp", item.createdAt.toDouble())
                        putDouble("completedAt", item.updatedAt.toDouble())
                        putString("status", "uploaded")
                    }
                    sharesArray.pushMap(shareMap)
                }
                
                promise.resolve(sharesArray)
                
            } catch (e: Exception) {
                promise.reject("RECENT_ERROR", "Failed to get recent shares", e)
            }
        }
    }
    
    /**
     * Clear all completed items from queue
     */
    @ReactMethod
    fun clearCompletedItems(promise: Promise) {
        moduleScope.launch {
            try {
                val deletedCount = withContext(Dispatchers.IO) {
                    database.bookmarkQueueDao().deleteOldCompletedBookmarks(
                        cutoffTime = 0L // Delete all completed items regardless of age
                    )
                }
                promise.resolve(deletedCount)
            } catch (e: Exception) {
                promise.reject("CLEAR_ERROR", "Failed to clear completed items", e)
            }
        }
    }
    
    /**
     * Retry all failed items
     */
    @ReactMethod
    fun retryFailedItems(promise: Promise) {
        moduleScope.launch {
            try {
                val retryCount = withContext(Dispatchers.IO) {
                    val dao = database.bookmarkQueueDao()
                    val failedItems = dao.getAllBookmarks().filter { 
                        it.status == BookmarkQueueStatus.FAILED 
                    }
                    
                    // Reset failed items to pending status
                    failedItems.forEach { item ->
                        dao.updateBookmarkStatus(
                            id = item.id,
                            status = BookmarkQueueStatus.PENDING,
                            retryCount = 0,
                            error = null
                        )
                    }
                    
                    // Schedule upload work
                    if (failedItems.isNotEmpty()) {
                        ShareUploadWorker.scheduleWork(reactContext)
                    }
                    
                    failedItems.size
                }
                
                promise.resolve(retryCount)
            } catch (e: Exception) {
                promise.reject("RETRY_ERROR", "Failed to retry failed items", e)
            }
        }
    }

    // Add a new method to mark items as processed after React Native handles them
    @ReactMethod
    fun markShareAsProcessed(shareId: String, promise: Promise) {
        moduleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    database.bookmarkQueueDao().updateBookmarkStatus(
                        id = shareId,
                        status = BookmarkQueueStatus.UPLOADED,
                        error = null
                    )
                }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("MARK_ERROR", "Failed to mark share as processed", e)
            }
        }
    }
    
    /**
     * Get all queue items (for AndroidRoomQueueService)
     */
    @ReactMethod
    fun getAllQueueItems(promise: Promise) {
        moduleScope.launch {
            try {
                val items = withContext(Dispatchers.IO) {
                    database.bookmarkQueueDao().getAllBookmarks()
                }
                
                val itemsArray = Arguments.createArray()
                items.forEach { item ->
                    val itemMap = Arguments.createMap().apply {
                        putString("id", item.id)
                        putString("url", item.url)
                        putString("title", item.title)
                        putString("notes", item.notes)
                        putDouble("createdAt", item.createdAt.toDouble())
                        putString("status", item.status)
                        putInt("retryCount", item.retryCount)
                        putString("lastError", item.lastError)
                        putDouble("updatedAt", item.updatedAt.toDouble())
                    }
                    itemsArray.pushMap(itemMap)
                }
                
                promise.resolve(itemsArray)
            } catch (e: Exception) {
                promise.reject("GET_ALL_ERROR", "Failed to get all queue items: ${e.message}", e)
            }
        }
    }
    
    /**
     * Get pending queue items (for AndroidRoomQueueService)
     */
    @ReactMethod
    fun getPendingQueueItems(promise: Promise) {
        moduleScope.launch {
            try {
                val items = withContext(Dispatchers.IO) {
                    database.bookmarkQueueDao().getPendingBookmarks()
                }
                
                val itemsArray = Arguments.createArray()
                items.forEach { item ->
                    val itemMap = Arguments.createMap().apply {
                        putString("id", item.id)
                        putString("url", item.url)
                        putString("title", item.title)
                        putString("notes", item.notes)
                        putDouble("createdAt", item.createdAt.toDouble())
                        putString("status", item.status)
                        putInt("retryCount", item.retryCount)
                        putString("lastError", item.lastError)
                        putDouble("updatedAt", item.updatedAt.toDouble())
                    }
                    itemsArray.pushMap(itemMap)
                }
                
                promise.resolve(itemsArray)
            } catch (e: Exception) {
                promise.reject("GET_PENDING_ERROR", "Failed to get pending queue items: ${e.message}", e)
            }
        }
    }
    
    /**
     * Add item to queue (for AndroidRoomQueueService)
     */
    @ReactMethod
    fun addQueueItem(
        url: String,
        title: String?,
        notes: String?,
        status: String,
        promise: Promise
    ) {
        moduleScope.launch {
            try {
                val itemId = withContext(Dispatchers.IO) {
                    val dao = database.bookmarkQueueDao()
                    
                    // Check if URL already exists to prevent duplicates
                    val existingCount = dao.isUrlAlreadyQueued(url)
                    if (existingCount > 0) {
                        return@withContext null
                    }
                    
                    // Generate ULID for consistent cross-platform sorting
                    val id = generateULID()
                    val now = System.currentTimeMillis()
                    
                    val entity = BookmarkQueueEntity(
                        id = id,
                        url = url,
                        title = title,
                        notes = notes,
                        createdAt = now,
                        status = status,
                        retryCount = 0,
                        lastError = null,
                        updatedAt = now
                    )
                    
                    dao.insertBookmark(entity)
                    id
                }
                
                if (itemId != null) {
                    promise.resolve(itemId)
                } else {
                    promise.resolve(false) // Already exists
                }
            } catch (e: Exception) {
                promise.reject("ADD_ERROR", "Failed to add queue item: ${e.message}", e)
            }
        }
    }
    
    /**
     * Remove queue item (for AndroidRoomQueueService)
     */
    @ReactMethod
    fun removeQueueItem(itemId: String, promise: Promise) {
        moduleScope.launch {
            try {
                val removed = withContext(Dispatchers.IO) {
                    val dao = database.bookmarkQueueDao()
                    val item = dao.getAllBookmarks().find { it.id == itemId }
                    if (item != null) {
                        // Room doesn't have direct delete by ID, so we'll mark as deleted
                        // or use a direct SQL query
                        dao.updateBookmarkStatus(
                            id = itemId,
                            status = "deleted", // Custom status for removal
                            error = "Removed by user"
                        )
                        true
                    } else {
                        false
                    }
                }
                
                promise.resolve(removed)
            } catch (e: Exception) {
                promise.reject("REMOVE_ERROR", "Failed to remove queue item: ${e.message}", e)
            }
        }
    }
    
    /**
     * Clear all items from queue (for testing)
     */
    @ReactMethod
    fun clearAllItems(promise: Promise) {
        moduleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    database.bookmarkQueueDao().clearAll()
                }
                
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("CLEAR_ALL_ERROR", "Failed to clear all items: ${e.message}", e)
            }
        }
    }
    
    /**
     * Generate ULID (Universally Unique Lexicographically Sortable Identifier)
     * Compatible with iOS implementation for cross-platform consistency
     */
    private fun generateULID(): String {
        val timestamp = System.currentTimeMillis()
        val random = UUID.randomUUID().toString().replace("-", "")
        return "${timestamp.toString(36)}${random.substring(0, 16)}".uppercase()
    }
    
    /**
     * Start observing queue changes and emit events to React Native
     */
    private fun startObservingQueueChanges() {
        try {
            moduleScope.launch {
                var lastPendingCount = 0
                var lastUploadedCount = 0
                
                while (true) {
                    try {
                        val (currentPendingCount, currentUploadedCount) = withContext(Dispatchers.IO) {
                            val dao = database.bookmarkQueueDao()
                            val pending = dao.getPendingCount()
                            val uploaded = dao.getAllBookmarks().count { 
                                it.status == BookmarkQueueStatus.UPLOADED 
                            }
                            pending to uploaded
                        }
                        
                        // Check for pending count changes
                        if (currentPendingCount != lastPendingCount) {
                            lastPendingCount = currentPendingCount
                            
                            val eventData = Arguments.createMap().apply {
                                putInt("pendingCount", currentPendingCount)
                            }
                            
                            sendEvent(EVENT_PENDING_COUNT_CHANGED, eventData)
                        }
                        
                        // Check for new completed uploads
                        if (currentUploadedCount > lastUploadedCount) {
                            lastUploadedCount = currentUploadedCount
                            
                            // Trigger a check for recent completions
                            checkPendingShares()
                        }
                        
                        delay(2000) // Check every 2 seconds
                    } catch (e: Exception) {
                        delay(5000) // Wait longer on error
                    }
                }
            }
            
        } catch (e: Exception) {
            // Critical error handling for production debugging
        }
    }
    
    /**
     * Send event to React Native
     */
    private fun sendEvent(eventName: String, params: WritableMap) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            // Critical error handling for production debugging
        }
    }
    
    /**
     * Export constants to React Native
     */
    override fun getConstants(): MutableMap<String, Any> {
        return hashMapOf(
            "PLATFORM" to "android",
            "SUPPORTED_EVENTS" to arrayOf(
                EVENT_SHARE_EXTENSION_DATA,
                EVENT_PENDING_COUNT_CHANGED
            ),
            "HAS_TOKEN_SYNC" to true
        )
    }
    
    /**
     * Module supports invalidation
     */
    override fun invalidate() {
        super.invalidate()
        moduleScope.cancel()
    }
}