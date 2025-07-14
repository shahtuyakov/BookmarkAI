package com.bookmarkai.share.utils

import android.net.Uri
import java.util.regex.Pattern

/**
 * Utility class for validating URLs from supported platforms.
 * Matches the validation logic used in iOS share extension.
 */
object UrlValidator {
    
    /**
     * Supported platforms that BookmarkAI can process
     */
    enum class SupportedPlatform(val displayName: String) {
        TIKTOK("TikTok"),
        REDDIT("Reddit"), 
        TWITTER("Twitter"),
        X("X (Twitter)"),
        YOUTUBE("YouTube");
        
        companion object {
            fun fromUrl(url: String): SupportedPlatform? {
                return when {
                    isTikTokUrl(url) -> TIKTOK
                    isRedditUrl(url) -> REDDIT
                    isTwitterUrl(url) -> TWITTER
                    isXUrl(url) -> X
                    isYouTubeUrl(url) -> YOUTUBE
                    else -> null
                }
            }
        }
    }
    
    /**
     * Check if URL is from a supported platform
     */
    fun isUrlSupported(url: String): Boolean {
        return SupportedPlatform.fromUrl(url) != null
    }
    
    /**
     * Get the platform for a URL, or null if unsupported
     */
    fun getPlatform(url: String): SupportedPlatform? {
        return SupportedPlatform.fromUrl(url)
    }
    
    /**
     * Validate and normalize URL
     */
    fun validateAndNormalizeUrl(rawUrl: String): String? {
        return try {
            // Clean up the URL
            val cleanUrl = cleanUrl(rawUrl)
            
            // Parse with Android Uri to validate format
            val uri = Uri.parse(cleanUrl)
            
            // Must have valid scheme and host
            if (uri.scheme.isNullOrBlank() || uri.host.isNullOrBlank()) {
                return null
            }
            
            // Must be HTTP or HTTPS
            if (uri.scheme !in listOf("http", "https")) {
                return null
            }
            
            // Must be from supported platform
            if (!isUrlSupported(cleanUrl)) {
                return null
            }
            
            cleanUrl
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Extract URL from shared text (handles cases where text contains URL + other content)
     */
    fun extractUrlFromText(text: String): String? {
        // First try to use the text as-is if it's a valid URL
        validateAndNormalizeUrl(text)?.let { return it }
        
        // Look for URLs in the text using regex
        val urlPattern = Pattern.compile(
            "(?i)\\b(?:https?://)(?:[\\w-]+\\.)+[\\w-]+(?:/[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=]*)?",
            Pattern.CASE_INSENSITIVE
        )
        
        val matcher = urlPattern.matcher(text)
        while (matcher.find()) {
            val foundUrl = matcher.group()
            validateAndNormalizeUrl(foundUrl)?.let { return it }
        }
        
        return null
    }
    
    /**
     * Clean URL by removing tracking parameters and normalizing format
     */
    private fun cleanUrl(url: String): String {
        var cleaned = url.trim()
        
        // Add https:// if missing scheme
        if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
            cleaned = "https://$cleaned"
        }
        
        return cleaned
    }
    
    /**
     * Check if URL is from TikTok
     */
    private fun isTikTokUrl(url: String): Boolean {
        return try {
            val host = Uri.parse(url).host?.lowercase() ?: return false
            host.contains("tiktok.com") || host == "vm.tiktok.com"
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Check if URL is from Reddit
     */
    private fun isRedditUrl(url: String): Boolean {
        return try {
            val host = Uri.parse(url).host?.lowercase() ?: return false
            host.contains("reddit.com") || host == "redd.it"
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Check if URL is from Twitter
     */
    private fun isTwitterUrl(url: String): Boolean {
        return try {
            val host = Uri.parse(url).host?.lowercase() ?: return false
            host.contains("twitter.com") || host == "t.co"
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Check if URL is from X (formerly Twitter)
     */
    private fun isXUrl(url: String): Boolean {
        return try {
            val host = Uri.parse(url).host?.lowercase() ?: return false
            host.contains("x.com")
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Check if URL is from YouTube
     */
    private fun isYouTubeUrl(url: String): Boolean {
        return try {
            val host = Uri.parse(url).host?.lowercase() ?: return false
            host.contains("youtube.com") || host == "youtu.be" || host == "m.youtube.com"
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Get user-friendly error message for unsupported URLs
     */
    fun getUnsupportedUrlMessage(url: String): String {
        val supportedPlatforms = SupportedPlatform.values().joinToString(", ") { it.displayName }
        return "BookmarkAI currently supports $supportedPlatforms. This URL is not from a supported platform."
    }
}