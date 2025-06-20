import Foundation

struct KeychainConfig {
    // IMPORTANT: React Native Keychain automatically prepends the team ID
    // So we need to use the same format it expects
    static let service = "com.bookmarkai.auth"
    static let account = "auth_tokens"
    
    // React Native Keychain passes "com.bookmarkai" and it gets prefixed automatically
    // We need to match this behavior
    static var accessGroup: String {
        // Get the app identifier prefix (team ID) from the keychain
        if let appIdentifierPrefix = getAppIdentifierPrefix() {
            return "\(appIdentifierPrefix).com.bookmarkai"
        }
        // Fallback with actual team ID
        return "F34FLR2TKP.com.bookmarkai"
    }
    
    private static func getAppIdentifierPrefix() -> String? {
        // Try to get the app identifier prefix from the bundle
        if let appIdentifierPrefix = Bundle.main.object(forInfoDictionaryKey: "AppIdentifierPrefix") as? String {
            return appIdentifierPrefix.trimmingCharacters(in: CharacterSet(charactersIn: "."))
        }
        
        // Try to extract from the app's access groups
        if let entitlements = Bundle.main.infoDictionary?["Entitlements"] as? [String: Any],
           let accessGroups = entitlements["keychain-access-groups"] as? [String],
           let firstGroup = accessGroups.first {
            // Extract team ID from "TEAMID.bundleID" format
            let components = firstGroup.components(separatedBy: ".")
            if components.count > 0 {
                return components[0]
            }
        }
        
        return nil
    }
}