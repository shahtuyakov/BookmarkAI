package com.bookmarkai.share

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.bookmarkai.share.database.BookmarkDatabase
import com.bookmarkai.share.database.BookmarkQueueEntity
import com.bookmarkai.share.database.BookmarkQueueStatus
import com.bookmarkai.share.utils.UrlValidator
import com.bookmarkai.share.work.ShareUploadWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.*

/**
 * Transparent activity that handles share intents from other apps.
 * Must finish quickly (<150ms) to avoid ANR as per ADR-008.
 */
class ShareActivity : Activity() {
    
    private lateinit var database: BookmarkDatabase
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize database
        database = BookmarkDatabase.getDatabase(applicationContext)
        
        // Handle the share intent
        handleShareIntent()
    }
    
    private fun handleShareIntent() {
        lifecycleScope.launch {
            try {
                val result = processShareIntent()
                
                // Show user feedback
                when (result) {
                    is ShareResult.Success -> {
                        showToast("Saved to BookmarkAI! 🎉")
                        // Schedule background upload
                        ShareUploadWorker.scheduleWork(applicationContext)
                    }
                    is ShareResult.Duplicate -> {
                        showToast("Already saved to BookmarkAI")
                    }
                    is ShareResult.UnsupportedUrl -> {
                        showToast("Unsupported URL. BookmarkAI supports TikTok, Reddit, Twitter, and X.")
                    }
                    is ShareResult.InvalidUrl -> {
                        showToast("Invalid URL format")
                    }
                    is ShareResult.Error -> {
                        showToast("Failed to save bookmark. Please try again.")
                    }
                }
                
            } catch (e: Exception) {
                android.util.Log.e("ShareActivity", "Error processing share intent", e)
                showToast("Error saving bookmark")
            } finally {
                // Always finish quickly to avoid ANR
                finish()
            }
        }
    }
    
    private suspend fun processShareIntent(): ShareResult {
        return withContext(Dispatchers.IO) {
            // Extract URL from intent
            val sharedUrl = extractUrlFromIntent() ?: return@withContext ShareResult.InvalidUrl
            
            // Validate and normalize URL
            val validatedUrl = UrlValidator.validateAndNormalizeUrl(sharedUrl) 
                ?: return@withContext ShareResult.UnsupportedUrl
            
            // Check for duplicates
            val existingCount = database.bookmarkQueueDao().isUrlAlreadyQueued(validatedUrl)
            if (existingCount > 0) {
                return@withContext ShareResult.Duplicate
            }
            
            // Enforce queue size limit (100 items as per ADR-008)
            val currentCount = database.bookmarkQueueDao().getPendingCount()
            if (currentCount >= 100) {
                // Remove some old completed items to make room
                database.bookmarkQueueDao().enforceQueueSizeLimit(10)
            }
            
            // Create queue entity
            val queueItem = BookmarkQueueEntity(
                id = UUID.randomUUID().toString(),
                url = validatedUrl,
                createdAt = System.currentTimeMillis(),
                status = BookmarkQueueStatus.PENDING
            )
            
            // Insert into database
            database.bookmarkQueueDao().insertBookmark(queueItem)
            
            android.util.Log.d("ShareActivity", "Queued bookmark: ${queueItem.id} - $validatedUrl")
            
            ShareResult.Success
        }
    }
    
    private fun extractUrlFromIntent(): String? {
        return when (intent?.action) {
            Intent.ACTION_SEND -> {
                if (intent.type == "text/plain") {
                    val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                    sharedText?.let { UrlValidator.extractUrlFromText(it) }
                } else {
                    null
                }
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                // Handle multiple items if needed in the future
                val sharedTexts = intent.getStringArrayListExtra(Intent.EXTRA_TEXT)
                sharedTexts?.firstOrNull()?.let { UrlValidator.extractUrlFromText(it) }
            }
            else -> null
        }
    }
    
    private fun showToast(message: String) {
        runOnUiThread {
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        }
    }
    
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        // Handle new intent if activity is already running
        setIntent(intent)
        handleShareIntent()
    }
}

/**
 * Sealed class representing the result of processing a share intent
 */
sealed class ShareResult {
    object Success : ShareResult()
    object Duplicate : ShareResult()
    object UnsupportedUrl : ShareResult()
    object InvalidUrl : ShareResult()
    data class Error(val exception: Throwable) : ShareResult()
}