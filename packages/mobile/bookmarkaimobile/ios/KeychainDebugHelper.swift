import Foundation
import Security

@objc(KeychainDebugHelper)
class KeychainDebugHelper: NSObject {
    
    @objc
    static func debugKeychainStorage() {
        print("\n🔍 ===== KEYCHAIN DEBUG INFO =====")
        
        // List all keychain items
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess, let items = result as? [[String: Any]] {
            print("📦 Total keychain items: \(items.count)")
            
            for item in items {
                if let service = item[kSecAttrService as String] as? String,
                   let account = item[kSecAttrAccount as String] as? String {
                    
                    // Only show auth-related items
                    if service.contains("auth") || service.contains("bookmarkai") ||
                       account.contains("auth") || account.contains("token") {
                        
                        let accessGroup = item[kSecAttrAccessGroup as String] as? String ?? "NO ACCESS GROUP"
                        let creationDate = item[kSecAttrCreationDate as String] as? Date
                        let modificationDate = item[kSecAttrModificationDate as String] as? Date
                        
                        print("\n📌 Keychain Item:")
                        print("   Service: \(service)")
                        print("   Account: \(account)")
                        print("   Access Group: \(accessGroup)")
                        
                        if let creation = creationDate {
                            print("   Created: \(creation)")
                        }
                        if let modification = modificationDate {
                            print("   Modified: \(modification)")
                        }
                        
                        // Try to read the data
                        let dataQuery: [String: Any] = [
                            kSecClass as String: kSecClassGenericPassword,
                            kSecAttrService as String: service,
                            kSecAttrAccount as String: account,
                            kSecReturnData as String: true
                        ]
                        
                        var dataResult: AnyObject?
                        if SecItemCopyMatching(dataQuery as CFDictionary, &dataResult) == errSecSuccess,
                           let data = dataResult as? Data {
                            print("   Data Size: \(data.count) bytes")
                            
                            // Try to parse as JSON
                            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                                if json["accessToken"] != nil {
                                    print("   ✅ Contains valid auth tokens")
                                }
                            }
                        }
                    }
                }
            }
        } else {
            print("❌ Could not access keychain items. Status: \(status)")
        }
        
        print("\n🔑 ===== TEAM ID INFO =====")
        
        // Try to get team ID
        if let bundleID = Bundle.main.bundleIdentifier {
            print("Bundle ID: \(bundleID)")
        }
        
        // Check entitlements
        if let entitlements = Bundle.main.infoDictionary?["Entitlements"] as? [String: Any] {
            print("Entitlements found:")
            if let keychainGroups = entitlements["keychain-access-groups"] as? [String] {
                print("  Keychain Access Groups: \(keychainGroups)")
            }
            if let appGroups = entitlements["com.apple.security.application-groups"] as? [String] {
                print("  App Groups: \(appGroups)")
            }
        }
        
        print("===== END DEBUG INFO =====\n")
    }
}

// Bridge header for React Native
@objc(KeychainDebugModule)
class KeychainDebugModule: NSObject {
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc
    func debugKeychain() {
        KeychainDebugHelper.debugKeychainStorage()
    }
}