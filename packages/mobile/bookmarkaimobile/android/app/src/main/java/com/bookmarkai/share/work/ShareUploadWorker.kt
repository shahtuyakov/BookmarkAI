package com.bookmarkai.share.work

import android.content.Context
import androidx.work.*
import com.bookmarkai.share.auth.TokenManager
import com.bookmarkai.share.database.BookmarkDatabase
import com.bookmarkai.share.database.BookmarkQueueStatus
import com.bookmarkai.share.network.ApiResult
import com.bookmarkai.share.network.BookmarkApiClient
import kotlinx.coroutines.delay
import java.util.*
import java.util.concurrent.TimeUnit
import kotlin.random.Random

/**
 * WorkManager worker that uploads queued bookmarks to the server.
 * Implements exponential backoff, batch processing, and authentication handling.
 */
class ShareUploadWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    private val database = BookmarkDatabase.getDatabase(applicationContext)
    private val apiClient = BookmarkApiClient(applicationContext)
    private val tokenManager = TokenManager(applicationContext)
    
    companion object {
        private const val WORK_NAME = "bookmark_upload_work"
        private const val MAX_RETRIES = 3
        private const val BATCH_SIZE_SMALL = 5
        private const val BATCH_SIZE_LARGE = 3
        private const val DELAY_BETWEEN_REQUESTS_MS = 100L
        private const val JITTER_MAX_MS = 500L
        
        /**
         * Schedule upload work with network constraints
         */
        fun scheduleWork(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            
            val uploadWork = OneTimeWorkRequestBuilder<ShareUploadWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .build()
            
            WorkManager.getInstance(context)
                .enqueueUniqueWork(
                    WORK_NAME,
                    ExistingWorkPolicy.REPLACE,
                    uploadWork
                )
            
            android.util.Log.d("ShareUploadWorker", "Scheduled upload work")
        }
        
        /**
         * Cancel all upload work
         */
        fun cancelWork(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        }
    }
    
    override suspend fun doWork(): Result {
        return try {
            android.util.Log.d("ShareUploadWorker", "Starting bookmark upload work")
            
            // Check if user is authenticated
            if (!tokenManager.isAuthenticated()) {
                android.util.Log.w("ShareUploadWorker", "User not authenticated, marking items as NEEDS_AUTH")
                markPendingItemsAsNeedsAuth()
                return Result.success()
            }
            
            // Process pending items
            val processedCount = processPendingBookmarks()
            
            // Process items that need auth refresh
            if (tokenManager.hasRefreshToken()) {
                val authProcessedCount = processAuthNeededBookmarks()
                android.util.Log.d("ShareUploadWorker", "Processed $authProcessedCount auth-needed bookmarks")
            }
            
            // Clean up old completed items
            cleanupOldItems()
            
            android.util.Log.d("ShareUploadWorker", "Upload work completed. Processed $processedCount items")
            Result.success()
            
        } catch (e: Exception) {
            android.util.Log.e("ShareUploadWorker", "Upload work failed", e)
            Result.retry()
        }
    }
    
    /**
     * Process pending bookmarks with adaptive batching
     */
    private suspend fun processPendingBookmarks(): Int {
        val pendingItems = database.bookmarkQueueDao().getPendingBookmarks()
        
        if (pendingItems.isEmpty()) {
            android.util.Log.d("ShareUploadWorker", "No pending bookmarks to process")
            return 0
        }
        
        android.util.Log.d("ShareUploadWorker", "Processing ${pendingItems.size} pending bookmarks")
        
        // Adaptive batching based on queue size
        val batchSize = if (pendingItems.size <= BATCH_SIZE_SMALL) {
            // Sequential processing for small batches
            1
        } else {
            // Parallel processing for larger batches
            BATCH_SIZE_LARGE
        }
        
        var processedCount = 0
        
        // Process in batches
        pendingItems.chunked(batchSize).forEach { batch ->
            // Process batch items
            batch.forEach { item ->
                try {
                    processBookmarkItem(item.id)
                    processedCount++
                    
                    // Add delay between requests to be API-friendly
                    if (batch.size == 1 && pendingItems.size > 1) {
                        delay(DELAY_BETWEEN_REQUESTS_MS)
                    }
                    
                } catch (e: Exception) {
                    android.util.Log.e("ShareUploadWorker", "Failed to process bookmark ${item.id}", e)
                }
            }
            
            // Add jittered delay between batches
            if (batchSize > 1) {
                val jitter = Random.nextLong(0, JITTER_MAX_MS)
                delay(DELAY_BETWEEN_REQUESTS_MS + jitter)
            }
        }
        
        return processedCount
    }
    
    /**
     * Process a single bookmark item
     */
    private suspend fun processBookmarkItem(itemId: String) {
        val item = database.bookmarkQueueDao().getAllBookmarks().find { it.id == itemId }
            ?: return
        
        // Mark as uploading
        database.bookmarkQueueDao().updateBookmarkStatus(
            id = itemId,
            status = BookmarkQueueStatus.UPLOADING
        )
        
        // Generate idempotency key
        val idempotencyKey = UUID.randomUUID().toString()
        
        // Attempt upload
        when (val result = apiClient.createShare(item.url, idempotencyKey)) {
            is ApiResult.Success -> {
                // Mark as uploaded
                database.bookmarkQueueDao().updateBookmarkStatus(
                    id = itemId,
                    status = BookmarkQueueStatus.UPLOADED
                )
                android.util.Log.d("ShareUploadWorker", "Successfully uploaded bookmark: ${item.url}")
            }
            
            is ApiResult.AuthError -> {
                // Mark as needs auth
                database.bookmarkQueueDao().updateBookmarkStatus(
                    id = itemId,
                    status = BookmarkQueueStatus.NEEDS_AUTH,
                    error = "Authentication failed"
                )
                android.util.Log.w("ShareUploadWorker", "Auth failed for bookmark: ${item.url}")
            }
            
            is ApiResult.RateLimitError -> {
                // Mark as pending to retry later
                database.bookmarkQueueDao().updateBookmarkStatus(
                    id = itemId,
                    status = BookmarkQueueStatus.PENDING,
                    retryCount = item.retryCount + 1,
                    error = "Rate limited"
                )
                android.util.Log.w("ShareUploadWorker", "Rate limited for bookmark: ${item.url}")
                
                // Add extra delay for rate limiting
                delay(5000L)
            }
            
            is ApiResult.ClientError -> {
                // Permanent failure - mark as failed
                database.bookmarkQueueDao().updateBookmarkStatus(
                    id = itemId,
                    status = BookmarkQueueStatus.FAILED,
                    retryCount = MAX_RETRIES,
                    error = "Client error: ${result.exception.message}"
                )
                android.util.Log.e("ShareUploadWorker", "Client error for bookmark: ${item.url}", result.exception)
            }
            
            is ApiResult.ServerError -> {
                // Temporary failure - retry with exponential backoff
                val newRetryCount = item.retryCount + 1
                if (newRetryCount >= MAX_RETRIES) {
                    database.bookmarkQueueDao().updateBookmarkStatus(
                        id = itemId,
                        status = BookmarkQueueStatus.FAILED,
                        retryCount = newRetryCount,
                        error = result.exception.message ?: "Server error"
                    )
                    android.util.Log.e("ShareUploadWorker", "Max retries exceeded for bookmark: ${item.url}")
                } else {
                    database.bookmarkQueueDao().updateBookmarkStatus(
                        id = itemId,
                        status = BookmarkQueueStatus.PENDING,
                        retryCount = newRetryCount,
                        error = result.exception.message ?: "Server error"
                    )
                    android.util.Log.w("ShareUploadWorker", "Retry ${newRetryCount}/$MAX_RETRIES for bookmark: ${item.url}")
                }
            }
            
            is ApiResult.Error -> {
                // Temporary failure - retry with exponential backoff
                val newRetryCount = item.retryCount + 1
                if (newRetryCount >= MAX_RETRIES) {
                    database.bookmarkQueueDao().updateBookmarkStatus(
                        id = itemId,
                        status = BookmarkQueueStatus.FAILED,
                        retryCount = newRetryCount,
                        error = result.exception.message ?: "Unknown error"
                    )
                    android.util.Log.e("ShareUploadWorker", "Max retries exceeded for bookmark: ${item.url}")
                } else {
                    database.bookmarkQueueDao().updateBookmarkStatus(
                        id = itemId,
                        status = BookmarkQueueStatus.PENDING,
                        retryCount = newRetryCount,
                        error = result.exception.message ?: "Unknown error"
                    )
                    android.util.Log.w("ShareUploadWorker", "Retry ${newRetryCount}/$MAX_RETRIES for bookmark: ${item.url}")
                }
            }
        }
    }
    
    /**
     * Process bookmarks that need authentication refresh
     */
    private suspend fun processAuthNeededBookmarks(): Int {
        val authNeededItems = database.bookmarkQueueDao().getBookmarksNeedingAuth()
        
        if (authNeededItems.isEmpty()) {
            return 0
        }
        
        // Try to refresh tokens
        when (val refreshResult = apiClient.refreshTokens()) {
            is ApiResult.Success -> {
                android.util.Log.d("ShareUploadWorker", "Successfully refreshed tokens")
                
                // Mark auth-needed items as pending to retry
                authNeededItems.forEach { item ->
                    database.bookmarkQueueDao().updateBookmarkStatus(
                        id = item.id,
                        status = BookmarkQueueStatus.PENDING,
                        error = null
                    )
                }
                
                // Process the newly pending items
                return processPendingBookmarks()
            }
            
            is ApiResult.Error -> {
                android.util.Log.e("ShareUploadWorker", "Failed to refresh tokens", refreshResult.exception)
                return 0
            }
            
            is ApiResult.AuthError -> {
                android.util.Log.e("ShareUploadWorker", "Auth error during token refresh", refreshResult.exception)
                return 0
            }
            
            is ApiResult.RateLimitError -> {
                android.util.Log.e("ShareUploadWorker", "Rate limited during token refresh", refreshResult.exception)
                return 0
            }
            
            is ApiResult.ClientError -> {
                android.util.Log.e("ShareUploadWorker", "Client error during token refresh", refreshResult.exception)
                return 0
            }
            
            is ApiResult.ServerError -> {
                android.util.Log.e("ShareUploadWorker", "Server error during token refresh", refreshResult.exception)
                return 0
            }
        }
    }
    
    /**
     * Mark all pending items as needing authentication
     */
    private suspend fun markPendingItemsAsNeedsAuth() {
        val pendingItems = database.bookmarkQueueDao().getPendingBookmarks()
        pendingItems.forEach { item ->
            database.bookmarkQueueDao().updateBookmarkStatus(
                id = item.id,
                status = BookmarkQueueStatus.NEEDS_AUTH,
                error = "User not authenticated"
            )
        }
    }
    
    /**
     * Clean up old completed and failed items
     */
    private suspend fun cleanupOldItems() {
        try {
            val deletedCompleted = database.bookmarkQueueDao().deleteOldCompletedBookmarks()
            val deletedFailed = database.bookmarkQueueDao().deleteOldFailedBookmarks()
            
            if (deletedCompleted > 0 || deletedFailed > 0) {
                android.util.Log.d("ShareUploadWorker", "Cleaned up $deletedCompleted completed and $deletedFailed failed items")
            }
        } catch (e: Exception) {
            android.util.Log.e("ShareUploadWorker", "Error cleaning up old items", e)
        }
    }
}