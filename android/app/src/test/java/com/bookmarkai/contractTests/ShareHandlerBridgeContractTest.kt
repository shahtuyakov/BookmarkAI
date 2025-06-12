package com.bookmarkai.contractTests

import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.TimeZone

class ShareHandlerBridgeContractTest {
    
    @Test
    fun testShareQueueEntryContract() {
        // Contract: React Native expects share queue entries in specific format
        val mockEntry = JSONObject().apply {
            put("id", "01ARZ3NDEKTSV4RRFFQ69G5FAV")
            put("url", "https://example.com/article")
            put("createdAt", "2024-01-15T10:30:00.000Z")
            put("status", "pending")
            put("source", "android-share-intent")
            put("metadata", JSONObject().apply {
                put("title", "Example Page")
                put("description", "Example description")
            })
        }
        
        // Validate contract fields
        validateShareQueueEntry(mockEntry)
    }
    
    @Test
    fun testShareQueueEntryDataClass() {
        // Test that our Kotlin data class matches the contract
        data class ShareQueueEntry(
            val id: String,
            val url: String,
            val createdAt: String,
            val status: String,
            val source: String,
            val metadata: Metadata? = null
        ) {
            data class Metadata(
                val title: String? = null,
                val description: String? = null
            )
        }
        
        val entry = ShareQueueEntry(
            id = "01ARZ3NDEKTSV4RRFFQ69G5FAV",
            url = "https://example.com",
            createdAt = "2024-01-15T10:30:00.000Z",
            status = "pending",
            source = "android-share-intent",
            metadata = ShareQueueEntry.Metadata(
                title = "Test Page",
                description = "Test Description"
            )
        )
        
        // Verify fields match contract
        assertTrue("ID must be 26 characters ULID", entry.id.matches(Regex("^[0-9A-HJKMNP-TV-Z]{26}$")))
        assertTrue("URL must start with http(s)://", entry.url.matches(Regex("^https?://.+")))
        assertTrue("CreatedAt must be ISO 8601", isValidISO8601(entry.createdAt))
        assertTrue("Status must be valid enum", listOf("pending", "processing", "completed", "failed").contains(entry.status))
        assertTrue("Source must be valid enum", listOf("ios-share-extension", "android-share-intent", "webextension", "react-native").contains(entry.source))
    }
    
    @Test
    fun testBatchShareQueueEntries() {
        // Test batch processing contract
        val mockEntries = JSONArray().apply {
            put(JSONObject().apply {
                put("id", "01ARZ3NDEKTSV4RRFFQ69G5FAV")
                put("url", "https://example.com/article1")
                put("createdAt", "2024-01-15T10:30:00.000Z")
                put("status", "pending")
                put("source", "android-share-intent")
            })
            put(JSONObject().apply {
                put("id", "01ARZ3NDEKTSV4RRFFQ69G5FAW")
                put("url", "https://example.com/article2")
                put("createdAt", "2024-01-15T10:31:00.000Z")
                put("status", "processing")
                put("source", "android-share-intent")
            })
        }
        
        // Validate each entry in the batch
        for (i in 0 until mockEntries.length()) {
            validateShareQueueEntry(mockEntries.getJSONObject(i))
        }
        
        assertTrue("Batch should contain entries", mockEntries.length() > 0)
    }
    
    private fun validateShareQueueEntry(entry: JSONObject) {
        // ULID format validation
        val id = entry.getString("id")
        assertTrue(
            "ID must be in ULID format (26 chars, specific alphabet)",
            id.matches(Regex("^[0-9A-HJKMNP-TV-Z]{26}$"))
        )
        
        // URL format validation
        val url = entry.getString("url")
        assertTrue(
            "URL must start with http:// or https://",
            url.matches(Regex("^https?://.+"))
        )
        
        // ISO 8601 date format validation
        val createdAt = entry.getString("createdAt")
        assertTrue(
            "createdAt must be in ISO 8601 format",
            isValidISO8601(createdAt)
        )
        
        // Status enum validation
        val status = entry.getString("status")
        val validStatuses = listOf("pending", "processing", "completed", "failed")
        assertTrue(
            "Status must be one of: ${validStatuses.joinToString(", ")}",
            validStatuses.contains(status)
        )
        
        // Source enum validation
        val source = entry.getString("source")
        val validSources = listOf("ios-share-extension", "android-share-intent", "webextension", "react-native")
        assertTrue(
            "Source must be one of: ${validSources.joinToString(", ")}",
            validSources.contains(source)
        )
        
        // Optional metadata validation
        if (entry.has("metadata") && !entry.isNull("metadata")) {
            val metadata = entry.getJSONObject("metadata")
            // Metadata can have title and description as optional strings
            if (metadata.has("title")) {
                assertTrue("Title must be a string", metadata.get("title") is String)
            }
            if (metadata.has("description")) {
                assertTrue("Description must be a string", metadata.get("description") is String)
            }
        }
    }
    
    private fun isValidISO8601(dateString: String): Boolean {
        return try {
            val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
            format.timeZone = TimeZone.getTimeZone("UTC")
            format.isLenient = false
            format.parse(dateString)
            true
        } catch (e: Exception) {
            false
        }
    }
}