import Foundation

class KeychainHelper {
    static let shared = KeychainHelper()
    private let service = "com.bookmarkai.auth"  // This must match KEYCHAIN_SERVICE
    private let account = "auth_tokens"          // This must match the account used
    private let accessGroup = "$(AppIdentifierPrefix)com.bookmarkai"
    
    func getAuthTokens() -> (accessToken: String?, refreshToken: String?) {
        guard let data = getGenericPasswordData(account: account) else {
            print("❌ No keychain data found for account: \(account), service: \(service)")
            return (nil, nil)
        }
        
        do {
            let jsonString = String(data: data, encoding: .utf8) ?? ""
            print("🔍 Raw keychain data: \(jsonString)")
            
            if let tokenDict = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let accessToken = tokenDict["accessToken"] as? String
                let refreshToken = tokenDict["refreshToken"] as? String
                print("✅ Parsed tokens - Access: \(accessToken?.prefix(20) ?? "nil")..., Refresh: \(refreshToken?.prefix(20) ?? "nil")...")
                return (accessToken, refreshToken)
            }
        } catch {
            print("❌ Failed to parse tokens: \(error)")
        }
        return (nil, nil)
    }
    
    func isUserLoggedIn() -> Bool {
        let (accessToken, _) = getAuthTokens()
        let isLoggedIn = accessToken != nil && !accessToken!.isEmpty
        print("🔐 User logged in check: \(isLoggedIn)")
        return isLoggedIn
    }
    
    private func getGenericPasswordData(account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        print("🔍 Keychain query: service=\(service), account=\(account), accessGroup=\(accessGroup)")
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess {
            print("✅ Keychain read successful")
            return result as? Data
        } else {
            print("❌ Keychain error: \(status) (\(SecCopyErrorMessageString(status, nil) ?? "unknown" as CFString))")
            return nil
        }
    }
}