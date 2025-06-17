import Foundation
import Security

class KeychainHelper {
    static let shared = KeychainHelper()
    
    // Match main app's service and account exactly
    private let service = "com.bookmarkai.auth"
    private let account = "auth_tokens"
    
    // Match the access group from the updated entitlements
    private let accessGroup = "org.reactjs.native.example.BookmarkAI" // Matches bundle ID prefix
    
    func getAuthTokens() -> (accessToken: String?, refreshToken: String?) {
        NSLog("🔐 ShareExtension KeychainHelper: Starting token retrieval...")
        NSLog("🔑 Service: \(service), Account: \(account)")
        
        // Mirror the main app's fallback behavior
        // 1. Try WITHOUT access group first (main app is using fallback)
        NSLog("🔍 Step 1: Trying WITHOUT access group (main app fallback mode)...")
        if let tokens = getTokensWithoutAccessGroup() {
            NSLog("✅ Found tokens without access group!")
            return tokens
        }
        
        // 2. Try with access group (for future when it works)
        NSLog("🔍 Step 2: Trying WITH access group '\(accessGroup)'...")
        if let tokens = getTokensWithAccessGroup(accessGroup) {
            NSLog("✅ Found tokens with access group!")
            return tokens
        }
        
        // 3. Try with team prefix access group as another fallback
        if let teamID = getTeamID() {
            let prefixedAccessGroup = "\(teamID).org.reactjs.native.example.BookmarkAI"
            NSLog("🔍 Step 3: Trying with team prefix access group '\(prefixedAccessGroup)'...")
            if let tokens = getTokensWithAccessGroup(prefixedAccessGroup) {
                NSLog("✅ Found tokens with team prefix access group!")
                return tokens
            }
        }
        
        // Debug: List all available keychain items
        #if DEBUG
        debugListKeychainItems()
        #endif
        
        NSLog("❌ No tokens found in any configuration")
        return (nil, nil)
    }
    
    private func getTokensWithAccessGroup(_ accessGroup: String) -> (accessToken: String?, refreshToken: String?)? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
            kSecReturnData as String: true
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess, let data = result as? Data {
            NSLog("📦 Found data with access group '\(accessGroup)', size: \(data.count) bytes")
            return parseTokens(from: data)
        } else {
            NSLog("⚠️ Query with access group '\(accessGroup)' failed: \(describeStatus(status))")
        }
        
        return nil
    }
    
    private func getTokensWithoutAccessGroup() -> (accessToken: String?, refreshToken: String?)? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true
            // Note: NO kSecAttrAccessGroup
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess, let data = result as? Data {
            NSLog("📦 Found data without access group, size: \(data.count) bytes")
            return parseTokens(from: data)
        } else {
            NSLog("⚠️ Query without access group failed: \(describeStatus(status))")
        }
        
        return nil
    }
    
    func getTeamID() -> String? {
        // Try to get team ID from bundle identifier or keychain
        if let bundleID = Bundle.main.bundleIdentifier {
            NSLog("📦 Share Extension Bundle ID: \(bundleID)")
        }
        
        // Query a keychain item to extract team ID from access group
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        if SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
           let item = result as? [String: Any],
           let accessGroup = item[kSecAttrAccessGroup as String] as? String {
            // Extract team ID from access group (e.g., "F34FLR2TKP.com.bookmarkai")
            let components = accessGroup.components(separatedBy: ".")
            if components.count > 0 && components[0].count == 10 {
                NSLog("🔑 Extracted Team ID: \(components[0])")
                return components[0]
            }
        }
        
        // Fallback to known team ID if extraction fails
        return "F34FLR2TKP" // Your actual team ID from Xcode
    }
    
    private func parseTokens(from data: Data) -> (accessToken: String?, refreshToken: String?)? {
        do {
            NSLog("📝 Attempting to parse token data...")
            
            // Try to parse as JSON
            if let tokenDict = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                NSLog("📋 Token data structure: \(tokenDict.keys.joined(separator: ", "))")
                
                let accessToken = tokenDict["accessToken"] as? String
                let refreshToken = tokenDict["refreshToken"] as? String
                let expiresAt = tokenDict["expiresAt"] as? TimeInterval
                
                if let accessToken = accessToken, !accessToken.isEmpty {
                    NSLog("✅ Successfully parsed tokens")
                    NSLog("🔑 Access token preview: \(String(accessToken.prefix(20)))...")
                    if let expiresAt = expiresAt {
                        let expirationDate = Date(timeIntervalSince1970: expiresAt / 1000) // Convert from milliseconds
                        NSLog("⏰ Token expires at: \(expirationDate)")
                        
                        // Check if token is expired
                        if expirationDate < Date() {
                            NSLog("⚠️ WARNING: Token is expired!")
                        }
                    }
                    return (accessToken, refreshToken)
                } else {
                    NSLog("❌ Token data missing accessToken field")
                }
            } else {
                NSLog("❌ Failed to parse data as JSON dictionary")
            }
        } catch {
            NSLog("❌ Error parsing tokens: \(error)")
            
            // Try to print raw string for debugging
            if let rawString = String(data: data, encoding: .utf8) {
                NSLog("📄 Raw data (first 100 chars): \(String(rawString.prefix(100)))")
            }
        }
        return nil
    }
    
    private func describeStatus(_ status: OSStatus) -> String {
        switch status {
        case errSecSuccess:
            return "Success"
        case errSecItemNotFound:
            return "Item not found"
        case errSecAuthFailed:
            return "Authentication failed"
        case errSecInteractionNotAllowed:
            return "Interaction not allowed"
        case errSecMissingEntitlement:
            return "Missing entitlement"
        case -25291:
            return "No keychain is available"
        case -34018:
            return "Missing application-identifier entitlement"
        default:
            return "Error code: \(status)"
        }
    }
    
    #if DEBUG
    private func debugListKeychainItems() {
        NSLog("🔍 DEBUG: Listing all keychain items...")
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess, let items = result as? [[String: Any]] {
            NSLog("📦 Found \(items.count) keychain items")
            
            for (index, item) in items.enumerated() {
                if let service = item[kSecAttrService as String] as? String,
                   let account = item[kSecAttrAccount as String] as? String {
                    let accessGroup = item[kSecAttrAccessGroup as String] as? String ?? "none"
                    
                    // Look for our specific service
                    if service == self.service {
                        NSLog("  🎯 [\(index)] OUR SERVICE: Service: \(service), Account: \(account), AccessGroup: \(accessGroup)")
                    }
                    // Also log other auth-related items
                    else if service.contains("auth") || service.contains("bookmarkai") ||
                       account.contains("auth") || account.contains("token") {
                        NSLog("  [\(index)] Service: \(service), Account: \(account), AccessGroup: \(accessGroup)")
                    }
                }
            }
        } else {
            NSLog("❌ Could not list keychain items: \(describeStatus(status))")
        }
    }
    #endif
    
    func isUserLoggedIn() -> Bool {
        let (accessToken, _) = getAuthTokens()
        if let token = accessToken, !token.isEmpty {
            NSLog("🔐 User logged in check: true")
            return true
        } else {
            NSLog("🔐 User logged in check: false")
            return false
        }
    }
}