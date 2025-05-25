package com.bookmarkai.share.database

import androidx.room.*
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object (DAO) for bookmark queue operations.
 * Provides methods for CRUD operations on the bookmark queue.
 */
@Dao
interface BookmarkQueueDao {
    
    /**
     * Insert a new bookmark into the queue
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBookmark(bookmark: BookmarkQueueEntity)
    
    /**
     * Update an existing bookmark's status and metadata
     */
    @Update
    suspend fun updateBookmark(bookmark: BookmarkQueueEntity)
    
    /**
     * Get all pending bookmarks (PENDING status) ordered by creation time
     */
    @Query("SELECT * FROM bookmark_queue WHERE status = :status ORDER BY created_at ASC")
    suspend fun getPendingBookmarks(status: String = BookmarkQueueStatus.PENDING): List<BookmarkQueueEntity>
    
    /**
     * Get all bookmarks that need authentication refresh
     */
    @Query("SELECT * FROM bookmark_queue WHERE status = :status ORDER BY created_at ASC")
    suspend fun getBookmarksNeedingAuth(status: String = BookmarkQueueStatus.NEEDS_AUTH): List<BookmarkQueueEntity>
    
    /**
     * Get all failed bookmarks that haven't exceeded max retries
     */
    @Query("SELECT * FROM bookmark_queue WHERE status = :status AND retry_count < :maxRetries ORDER BY created_at ASC")
    suspend fun getFailedBookmarksForRetry(
        status: String = BookmarkQueueStatus.FAILED, 
        maxRetries: Int = 3
    ): List<BookmarkQueueEntity>
    
    /**
     * Get count of pending items (for UI badge)
     */
    @Query("SELECT COUNT(*) FROM bookmark_queue WHERE status IN (:statuses)")
    suspend fun getPendingCount(statuses: List<String> = listOf(
        BookmarkQueueStatus.PENDING, 
        BookmarkQueueStatus.UPLOADING, 
        BookmarkQueueStatus.NEEDS_AUTH,
        BookmarkQueueStatus.FAILED
    )): Int
    
    /**
     * Get count of pending items as Flow (for real-time UI updates)
     */
    @Query("SELECT COUNT(*) FROM bookmark_queue WHERE status IN (:statuses)")
    fun getPendingCountFlow(statuses: List<String> = listOf(
        BookmarkQueueStatus.PENDING, 
        BookmarkQueueStatus.UPLOADING, 
        BookmarkQueueStatus.NEEDS_AUTH,
        BookmarkQueueStatus.FAILED
    )): Flow<Int>
    
    /**
     * Delete completed bookmarks older than specified days
     */
    @Query("DELETE FROM bookmark_queue WHERE status = :status AND updated_at < :cutoffTime")
    suspend fun deleteOldCompletedBookmarks(
        status: String = BookmarkQueueStatus.UPLOADED,
        cutoffTime: Long = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000L) // 7 days
    ): Int
    
    /**
     * Delete old failed bookmarks older than specified days
     */
    @Query("DELETE FROM bookmark_queue WHERE status = :status AND updated_at < :cutoffTime")
    suspend fun deleteOldFailedBookmarks(
        status: String = BookmarkQueueStatus.FAILED,
        cutoffTime: Long = System.currentTimeMillis() - (30 * 24 * 60 * 60 * 1000L) // 30 days
    ): Int
    
    /**
     * Check if URL already exists in queue (prevent duplicates)
     */
    @Query("SELECT COUNT(*) FROM bookmark_queue WHERE url = :url AND status NOT IN (:excludeStatuses)")
    suspend fun isUrlAlreadyQueued(
        url: String, 
        excludeStatuses: List<String> = listOf(BookmarkQueueStatus.UPLOADED, BookmarkQueueStatus.FAILED)
    ): Int
    
    /**
     * Update bookmark status and retry count
     */
    @Query("UPDATE bookmark_queue SET status = :status, retry_count = :retryCount, last_error = :error, updated_at = :updatedAt WHERE id = :id")
    suspend fun updateBookmarkStatus(
        id: String, 
        status: String, 
        retryCount: Int = 0, 
        error: String? = null,
        updatedAt: Long = System.currentTimeMillis()
    )
    
    /**
     * Get all queue items for debugging/testing
     */
    @Query("SELECT * FROM bookmark_queue ORDER BY created_at DESC")
    suspend fun getAllBookmarks(): List<BookmarkQueueEntity>
    
    /**
     * Clear all items from queue (for testing)
     */
    @Query("DELETE FROM bookmark_queue")
    suspend fun clearAll()
    
    /**
     * Enforce queue size limit by deleting oldest completed items
     */
    @Query("""
        DELETE FROM bookmark_queue 
        WHERE id IN (
            SELECT id FROM bookmark_queue 
            WHERE status = 'UPLOADED' 
            ORDER BY updated_at ASC 
            LIMIT :deleteCount
        )
    """)
    suspend fun enforceQueueSizeLimit(deleteCount: Int)
}