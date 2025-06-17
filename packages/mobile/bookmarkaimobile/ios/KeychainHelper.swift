import Foundation
import Security

class KeychainHelper {
    static let shared = KeychainHelper()
    
    // Use shared configuration
    private let service = "com.bookmarkai.auth"
    private let account = "auth_tokens"
    private let accessGroup = "org.reactjs.native.example.BookmarkAI" // Updated to match bundle ID
    
    func getAuthTokens() -> (accessToken: String?, refreshToken: String?) {
        // Try without access group first (React Native default)
        if let tokens = getTokensWithoutAccessGroup() {
            return tokens
        }
        
        // Try with explicit access group
        if let tokens = getTokensWithAccessGroup(accessGroup) {
            return tokens
        }
        
        // Try with team prefix access group
        if let teamID = getTeamID() {
            let prefixedAccessGroup = "\(teamID).org.reactjs.native.example.BookmarkAI"
            if let tokens = getTokensWithAccessGroup(prefixedAccessGroup) {
                return tokens
            }
        }
        
        return (nil, nil)
    }
    
    private func getTokensWithoutAccessGroup() -> (accessToken: String?, refreshToken: String?)? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess, let data = result as? Data {
            return parseTokens(from: data)
        }
        
        return nil
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
        }
        
        return nil
    }
    
    private func getTeamID() -> String? {
        // Try to extract team ID from existing keychain items
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        if SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
           let attributes = result as? [String: Any],
           let accessGroup = attributes[kSecAttrAccessGroup as String] as? String {
            // Extract team ID from access group (format: TEAMID.bundleID)
            let components = accessGroup.components(separatedBy: ".")
            if components.count > 0 && components[0].count == 10 {
                return components[0]
            }
        }
        
        // Fallback to known team ID if extraction fails
        return "F34FLR2TKP" // Your actual team ID
    }
    
    private func parseTokens(from data: Data) -> (accessToken: String?, refreshToken: String?)? {
        do {
            if let tokenDict = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let accessToken = tokenDict["accessToken"] as? String
                let refreshToken = tokenDict["refreshToken"] as? String
                
                if let accessToken = accessToken, !accessToken.isEmpty {
                    return (accessToken, refreshToken)
                }
            }
        } catch {
            print("KeychainHelper: Error parsing tokens - \(error)")
        }
        return nil
    }
    
    func isUserLoggedIn() -> Bool {
        let (accessToken, _) = getAuthTokens()
        return accessToken != nil
    }
}