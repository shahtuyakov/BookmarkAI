package com.bookmarkai.share.bridge

import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.bookmarkai.share.database.BookmarkDatabase
import com.bookmarkai.share.database.BookmarkQueueStatus
import com.bookmarkai.share.work.ShareUploadWorker
import kotlinx.coroutines.*

/**
 * React Native module that bridges Android share functionality to JavaScript.
 * Provides methods to manage the share queue and get pending counts.
 */
class ShareHandlerModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
    
    private val database = BookmarkDatabase.getDatabase(reactContext)
    private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    companion object {
        private const val MODULE_NAME = "ShareHandler"
        private const val EVENT_SHARE_EXTENSION_DATA = "ShareExtensionData"
        private const val EVENT_PENDING_COUNT_CHANGED = "PendingCountChanged"
    }
    
    override fun getName(): String = MODULE_NAME
    
    /**
     * Initialize module and start observing queue changes
     */
    override fun initialize() {
        super.initialize()
        startObservingQueueChanges()
    }
    
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
                        android.util.Log.d("ShareHandlerModule", "Found ${recentlyUploaded.size} recently uploaded items")
                        
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
    
    /**
     * Check for pending shares (Android equivalent of iOS checkPendingShares)
     * This method processes any queued items and notifies React Native
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
                    
                    android.util.Log.d("ShareHandlerModule", "checkPendingShares - Pending: ${pendingItems.size}, Auth needed: ${authNeededItems.size}, Recently uploaded: ${recentlyUploaded.size}")
                    
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
                    
                    // Process pending items (schedule for upload)
                    val allPendingItems = pendingItems + authNeededItems
                    if (allPendingItems.isNotEmpty()) {
                        // Schedule upload work
                        ShareUploadWorker.scheduleWork(reactContext)
                        
                        android.util.Log.d("ShareHandlerModule", "Scheduled upload work for ${allPendingItems.size} pending items")
                    }
                }
                
            } catch (e: Exception) {
                android.util.Log.e("ShareHandlerModule", "Error checking pending shares", e)
            }
        }
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
                            android.util.Log.d("ShareHandlerModule", "Detected new uploads: $lastUploadedCount -> $currentUploadedCount")
                            lastUploadedCount = currentUploadedCount
                            
                            // Trigger a check for recent completions
                            checkPendingShares()
                        }
                        
                        delay(2000) // Check every 2 seconds
                    } catch (e: Exception) {
                        android.util.Log.e("ShareHandlerModule", "Error observing queue changes", e)
                        delay(5000) // Wait longer on error
                    }
                }
            }
            
        } catch (e: Exception) {
            android.util.Log.e("ShareHandlerModule", "Failed to start observing queue changes", e)
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
            android.util.Log.e("ShareHandlerModule", "Failed to send event: $eventName", e)
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
            )
        )
    }
    
    /**
     * Module supports invalidation
     */
    override fun invalidate() {
        super.invalidate()
        // Cancel all coroutines
        moduleScope.cancel()
    }
}