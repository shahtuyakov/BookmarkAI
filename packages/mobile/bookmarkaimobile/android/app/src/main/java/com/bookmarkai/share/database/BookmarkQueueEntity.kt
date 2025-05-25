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
    val id: String,  // UUID string
    
    @ColumnInfo(name = "url")
    val url: String,
    
    @ColumnInfo(name = "created_at")
    val createdAt: Long,  // Unix timestamp in milliseconds
    
    @ColumnInfo(name = "status")
    val status: String,  // PENDING, UPLOADING, UPLOADED, FAILED, NEEDS_AUTH
    
    @ColumnInfo(name = "retry_count")
    val retryCount: Int = 0,
    
    @ColumnInfo(name = "last_error")
    val lastError: String? = null,
    
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = System.currentTimeMillis()
)

/**
 * Status values for bookmark queue items
 */
object BookmarkQueueStatus {
    const val PENDING = "PENDING"           // Newly added, waiting to be processed
    const val UPLOADING = "UPLOADING"       // Currently being uploaded by WorkManager
    const val UPLOADED = "UPLOADED"         // Successfully uploaded to server
    const val FAILED = "FAILED"            // Failed after max retries
    const val NEEDS_AUTH = "NEEDS_AUTH"     // Failed due to authentication, needs token refresh
}