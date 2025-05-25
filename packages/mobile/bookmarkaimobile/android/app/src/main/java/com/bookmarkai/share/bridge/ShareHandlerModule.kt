package com.bookmarkai.share.bridge

import android.content.Context
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.bookmarkai.share.database.BookmarkDatabase
import com.bookmarkai.share.database.BookmarkQueueStatus
import com.bookmarkai.share.work.ShareUploadWorker
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/**
 * React Native module that bridges Android share functionality to JavaScript.
 * Provides methods to manage the share queue and get pending counts.
 */
class ShareHandlerModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
    
    private val database = BookmarkDatabase.getDatabase(reactContext)
    
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
     * Flush the queue by triggering WorkManager upload
     */
    @ReactMethod
    fun flushQueue(promise: Promise) {
        try {
            // Schedule immediate upload work
            ShareUploadWorker.scheduleWork(reactContext)
            
            // Get current pending count for immediate feedback
            Thread {
                try {
                    val pendingCount = database.bookmarkQueueDao().getPendingCount()
                    val result = Arguments.createMap().apply {
                        putInt("pendingCount", pendingCount)
                        putString("status", "scheduled")
                    }
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.reject("FLUSH_ERROR", "Failed to get pending count", e)
                }
            }.start()
            
        } catch (e: Exception) {
            promise.reject("FLUSH_ERROR", "Failed to schedule upload work", e)
        }
    }
    
    /**
     * Get current pending count
     */
    @ReactMethod
    fun getPendingCount(promise: Promise) {
        Thread {
            try {
                val pendingCount = database.bookmarkQueueDao().getPendingCount()
                promise.resolve(pendingCount)
            } catch (e: Exception) {
                promise.reject("COUNT_ERROR", "Failed to get pending count", e)
            }
        }.start()
    }
    
    /**
     * Get detailed queue status
     */
    @ReactMethod
    fun getQueueStatus(promise: Promise) {
        Thread {
            try {
                val dao = database.bookmarkQueueDao()
                val allItems = dao.getAllBookmarks()
                
                val statusMap = Arguments.createMap().apply {
                    putInt("pending", allItems.count { it.status == BookmarkQueueStatus.PENDING })
                    putInt("uploading", allItems.count { it.status == BookmarkQueueStatus.UPLOADING })
                    putInt("uploaded", allItems.count { it.status == BookmarkQueueStatus.UPLOADED })
                    putInt("failed", allItems.count { it.status == BookmarkQueueStatus.FAILED })
                    putInt("needsAuth", allItems.count { it.status == BookmarkQueueStatus.NEEDS_AUTH })
                    putInt("total", allItems.size)
                }
                
                promise.resolve(statusMap)
            } catch (e: Exception) {
                promise.reject("STATUS_ERROR", "Failed to get queue status", e)
            }
        }.start()
    }
    
    /**
     * Clear all completed items from queue
     */
    @ReactMethod
    fun clearCompletedItems(promise: Promise) {
        Thread {
            try {
                val deletedCount = database.bookmarkQueueDao().deleteOldCompletedBookmarks(
                    cutoffTime = 0L // Delete all completed items regardless of age
                )
                promise.resolve(deletedCount)
            } catch (e: Exception) {
                promise.reject("CLEAR_ERROR", "Failed to clear completed items", e)
            }
        }.start()
    }
    
    /**
     * Retry all failed items
     */
    @ReactMethod
    fun retryFailedItems(promise: Promise) {
        Thread {
            try {
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
                
                promise.resolve(failedItems.size)
            } catch (e: Exception) {
                promise.reject("RETRY_ERROR", "Failed to retry failed items", e)
            }
        }.start()
    }
    
    /**
     * Check for pending shares (Android equivalent of iOS checkPendingShares)
     * This method processes any queued items and notifies React Native
     */
    @ReactMethod
    fun checkPendingShares() {
        Thread {
            try {
                val dao = database.bookmarkQueueDao()
                val pendingItems = dao.getPendingBookmarks()
                val authNeededItems = dao.getBookmarksNeedingAuth()
                val allPendingItems = pendingItems + authNeededItems
                
                if (allPendingItems.isNotEmpty()) {
                    // Convert to format expected by React Native
                    val sharesArray = Arguments.createArray()
                    
                    allPendingItems.forEach { item ->
                        val shareMap = Arguments.createMap().apply {
                            putString("url", item.url)
                            putString("id", item.id)
                            putDouble("timestamp", item.createdAt.toDouble())
                        }
                        sharesArray.pushMap(shareMap)
                    }
                    
                    // Send event to React Native using the same format as iOS
                    val eventData = Arguments.createMap().apply {
                        putBoolean("isQueue", true)
                        putArray("shares", sharesArray)
                        putBoolean("silent", true)
                    }
                    
                    sendEvent(EVENT_SHARE_EXTENSION_DATA, eventData)
                    
                    // Schedule upload work
                    ShareUploadWorker.scheduleWork(reactContext)
                }
                
            } catch (e: Exception) {
                android.util.Log.e("ShareHandlerModule", "Error checking pending shares", e)
            }
        }.start()
    }
    
    /**
     * Start observing queue changes and emit events to React Native
     */
    private fun startObservingQueueChanges() {
        try {
            // Note: In a production app, you'd want to use a proper lifecycle-aware component
            // For now, we'll observe changes when the module is active
            
            Thread {
                try {
                    // This is a simplified approach - in production you'd want to use
                    // proper lifecycle management and Flow collection
                    
                    var lastPendingCount = 0
                    
                    while (true) {
                        try {
                            val currentPendingCount = database.bookmarkQueueDao().getPendingCount()
                            
                            if (currentPendingCount != lastPendingCount) {
                                lastPendingCount = currentPendingCount
                                
                                val eventData = Arguments.createMap().apply {
                                    putInt("pendingCount", currentPendingCount)
                                }
                                
                                sendEvent(EVENT_PENDING_COUNT_CHANGED, eventData)
                            }
                            
                            Thread.sleep(2000) // Check every 2 seconds
                        } catch (e: Exception) {
                            android.util.Log.e("ShareHandlerModule", "Error observing queue changes", e)
                            Thread.sleep(5000) // Wait longer on error
                        }
                    }
                } catch (e: Exception) {
                    android.util.Log.e("ShareHandlerModule", "Observer thread stopped", e)
                }
            }.start()
            
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
        // Clean up resources if needed
    }
}