package com.bookmarkai.share.database

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Room entity representing a queued bookmark share.
 * Mirrors the iOS queue schema for consistency across platforms.
 */
@Entity(tableName = "bookmark_queue")
data class BookmarkQueueEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,  // ULID string for consistent cross-platform sorting
    
    @ColumnInfo(name = "url")
    val url: String,
    
    @ColumnInfo(name = "title")
    val title: String? = null,  // Optional title extracted from URL/content
    
    @ColumnInfo(name = "notes")
    val notes: String? = null,  // Optional user notes from share extension
    
    @ColumnInfo(name = "created_at")
    val createdAt: Long,  // Unix timestamp in milliseconds
    
    @ColumnInfo(name = "status")
    val status: String,  // pending, processing, completed, failed (matching iOS)
    
    @ColumnInfo(name = "retry_count")
    val retryCount: Int = 0,
    
    @ColumnInfo(name = "last_error")
    val lastError: String? = null,
    
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = System.currentTimeMillis()
)

/**
 * Status values for bookmark queue items (matching iOS SQLite schema)
 */
object BookmarkQueueStatus {
    const val PENDING = "pending"           // Newly added, waiting to be processed
    const val PROCESSING = "processing"     // Currently being uploaded by WorkManager
    const val COMPLETED = "completed"       // Successfully uploaded to server
    const val FAILED = "failed"            // Failed after max retries
    
    // Legacy Android-specific statuses (maintain for migration compatibility)
    const val UPLOADING = "processing"      // Alias for legacy compatibility
    const val UPLOADED = "completed"        // Alias for legacy compatibility
    const val NEEDS_AUTH = "failed"         // Convert to failed status for simplicity
}