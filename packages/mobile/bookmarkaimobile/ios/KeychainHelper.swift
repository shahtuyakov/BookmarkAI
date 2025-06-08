import Foundation

class KeychainHelper {
    static let shared = KeychainHelper()
    private let service = "com.bookmarkai.auth" // Match React Native Keychain service
    private let accessGroup = "$(AppIdentifierPrefix)com.bookmarkai"
    
    func getAuthTokens() -> (accessToken: String?, refreshToken: String?) {
        guard let data = getGenericPasswordData(account: "auth_tokens") else {
            return (nil, nil)
        }
        
        do {
            if let tokenDict = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return (tokenDict["accessToken"] as? String,
                        tokenDict["refreshToken"] as? String)
            }
        } catch {
            // Silent error handling for production
        }
        return (nil, nil)
    }
    
    func isUserLoggedIn() -> Bool {
        let (accessToken, _) = getAuthTokens()
        return accessToken != nil
    }
    
    private func getGenericPasswordData(account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
            kSecReturnData as String: true
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        return status == errSecSuccess ? result as? Data : nil
    }
}
