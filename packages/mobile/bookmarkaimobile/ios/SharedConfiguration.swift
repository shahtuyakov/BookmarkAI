//
//  SharedConfiguration.swift
//  BookmarkAI
//
//  Shared configuration between main app and extensions using App Groups
//

import Foundation

class SharedConfiguration {
    static let shared = SharedConfiguration()
    
    // App Group identifier - must match entitlements
    private let appGroupIdentifier = "group.org.reactjs.native.example.BookmarkAI"
    
    // Keys for stored values
    private let apiBaseURLKey = "com.bookmarkai.apiBaseURL"
    
    private var sharedDefaults: UserDefaults? {
        return UserDefaults(suiteName: appGroupIdentifier)
    }
    
    private init() {}
    
    // MARK: - API Configuration
    
    /// Get the API base URL, with fallback to environment-specific defaults
    var apiBaseURL: String {
        // For now, use hardcoded values based on build configuration
        // TODO: Implement proper sharing via App Groups
        #if DEBUG
        return "https://bookmarkai-dev.ngrok.io"
        #else
        return "https://api.bookmarkai.com"
        #endif
    }
    
    /// Set the API base URL (should be called by main app on launch)
    func setAPIBaseURL(_ url: String) {
        sharedDefaults?.set(url, forKey: apiBaseURLKey)
        sharedDefaults?.synchronize()
    }
    
    /// Get the full shares endpoint URL
    var sharesEndpointURL: URL? {
        return URL(string: "\(apiBaseURL)/api/v1/shares")
    }
    
    /// Clear all shared configuration (useful for testing)
    func clearConfiguration() {
        sharedDefaults?.removeObject(forKey: apiBaseURLKey)
        sharedDefaults?.synchronize()
    }
}