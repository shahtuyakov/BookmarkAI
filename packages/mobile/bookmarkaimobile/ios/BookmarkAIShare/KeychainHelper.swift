import Foundation

class KeychainHelper {
    static let shared = KeychainHelper()
    private let accessGroup = "$(AppIdentifierPrefix)com.bookmarkai"
    
    func getAuthTokens() -> (accessToken: String?, refreshToken: String?) {
        // Try multiple possible service/account combinations
        let combinations = [
            ("com.bookmarkai.auth", "auth_tokens"),
            ("com.bookmarkai", "auth_tokens"),
            ("RNCKeychain", "auth_tokens"),
            ("com.bookmarkai.auth", "RNCKeychain"),
            (Bundle.main.bundleIdentifier ?? "com.bookmarkai", "auth_tokens")
        ]
        
        for (service, account) in combinations {
            print("🔍 Trying service: \(service), account: \(account)")
            if let data = getGenericPasswordData(service: service, account: account) {
                print("✅ Found data with service: \(service), account: \(account)")
                if let tokens = parseTokens(from: data) {
                    return tokens
                }
            }
        }
        
        print("❌ No tokens found in any combination")
        return (nil, nil)
    }
    
    func isUserLoggedIn() -> Bool {
        let (accessToken, _) = getAuthTokens()
        let isLoggedIn = accessToken != nil && !accessToken!.isEmpty
        print("🔐 User logged in check: \(isLoggedIn)")
        return isLoggedIn
    }
    
    private func getGenericPasswordData(service: String, account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess {
            return result as? Data
        }
        return nil
    }
    
    private func parseTokens(from data: Data) -> (accessToken: String?, refreshToken: String?)? {
        do {
            let jsonString = String(data: data, encoding: .utf8) ?? ""
            print("📝 Raw data: \(jsonString)")
            
            if let tokenDict = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let accessToken = tokenDict["accessToken"] as? String
                let refreshToken = tokenDict["refreshToken"] as? String
                print("✅ Parsed tokens - Access: \(accessToken?.prefix(20) ?? "nil")..., Refresh: \(refreshToken?.prefix(20) ?? "nil")...")
                return (accessToken, refreshToken)
            }
        } catch {
            print("❌ JSON parse error: \(error)")
        }
        return nil
    }
}