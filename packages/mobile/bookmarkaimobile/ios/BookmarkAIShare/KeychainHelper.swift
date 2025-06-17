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
        
        // Mirror the main app's fallback behavior
        // 1. Try WITHOUT access group first (main app is using fallback)
        if let tokens = getTokensWithoutAccessGroup() {
            return tokens
        }
        
        // 2. Try with access group (for future when it works)
        if let tokens = getTokensWithAccessGroup(accessGroup) {
            return tokens
        }
        
        // 3. Try with team prefix access group as another fallback
        if let teamID = getTeamID() {
            let prefixedAccessGroup = "\(teamID).org.reactjs.native.example.BookmarkAI"
            if let tokens = getTokensWithAccessGroup(prefixedAccessGroup) {
                return tokens
            }
        }
        
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
            return parseTokens(from: data)
        } else {
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
            return parseTokens(from: data)
        } else {
        }
        
        return nil
    }
    
    func getTeamID() -> String? {
        // Try to get team ID from bundle identifier or keychain
        if let bundleID = Bundle.main.bundleIdentifier {
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
                return components[0]
            }
        }
        
        // Fallback to known team ID if extraction fails
        return "F34FLR2TKP" // Your actual team ID from Xcode
    }
    
    private func parseTokens(from data: Data) -> (accessToken: String?, refreshToken: String?)? {
        do {
            
            // Try to parse as JSON
            if let tokenDict = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                
                let accessToken = tokenDict["accessToken"] as? String
                let refreshToken = tokenDict["refreshToken"] as? String
                let expiresAt = tokenDict["expiresAt"] as? TimeInterval
                
                if let accessToken = accessToken, !accessToken.isEmpty {
                    return (accessToken, refreshToken)
                } else {
                }
            } else {
            }
        } catch {
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
    
    
    func isUserLoggedIn() -> Bool {
        let (accessToken, _) = getAuthTokens()
        if let token = accessToken, !token.isEmpty {
            return true
        } else {
            return false
        }
    }
}