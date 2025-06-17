# iOS Share Extension Authentication Fix - Memory Document

## Issue Summary
The iOS share extension was unable to access authentication tokens stored by the main app, causing all bookmark attempts to fall back to the queue system instead of immediate posting. Users would see "Bookmark Queued!" instead of "Bookmark Saved Instantly!" even when they were logged in.

## Root Causes
1. **Bundle ID Mismatch**: The app used React Native's default bundle IDs (`org.reactjs.native.example.*`) but the keychain configuration expected `com.bookmarkai`
2. **Keychain Access Group Mismatch**: The share extension and main app were looking for tokens in different keychain access groups
3. **Storage Method Discrepancy**: The main app was storing tokens without an access group (due to simulator limitations), but the share extension was searching with an access group first
4. **API Response Handling**: The share extension only checked for status codes 200/201 but the API returns 202 Accepted
5. **Response Parsing Error**: The extension expected share ID at root level, but the API uses an envelope format with data nested under a `data` key

## Solution Implementation

### 1. Fixed Keychain Configuration
Updated keychain access groups to match the actual bundle identifier:

**File: `packages/mobile/bookmarkaimobile/src/utils/keychain-config.ts`**
```typescript
export const SHARED_ACCESS_GROUP = 'org.reactjs.native.example.BookmarkAI';
```

**Files: `BookmarkAI.entitlements` and `BookmarkAIShare.entitlements`**
```xml
<key>keychain-access-groups</key>
<array>
    <string>$(AppIdentifierPrefix)org.reactjs.native.example.BookmarkAI</string>
</array>
```

### 2. Fixed Token Retrieval Order in iOS Extension
Modified `KeychainHelper.swift` to check WITHOUT access group first (matching how the main app saves tokens in fallback mode):

```swift
// Try without access group first (simulator/fallback mode)
let query1: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: keychainService,
    kSecAttrAccount as String: account,
    kSecReturnData as String: true
]

if let data = try? executeKeychainQuery(query1) {
    return String(data: data, encoding: .utf8)
}

// Then try with access group (device mode)
let query2: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: keychainService,
    kSecAttrAccount as String: account,
    kSecAttrAccessGroup as String: accessGroup,
    kSecReturnData as String: true
]
```

### 3. Fixed API Response Handling
Updated `ShareViewController.swift` to handle the correct status codes and response format:

```swift
// Added support for 202 status code
if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 || httpResponse.statusCode == 202 {
    // Parse response from envelope format
    if let responseData = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let dataObject = responseData["data"] as? [String: Any],
       let shareId = dataObject["id"] as? String {
        return .success(shareId)
    }
}
```

### 4. Essential Configuration Settings
- **Request Timeout**: Set to 5.0 seconds (critical for share extension time limits)
- **API URL**: For development, use `https://bookmarkai-dev.ngrok.io`
- **Idempotency Key**: Added UUID-based idempotency key header for ADR-014 compliance

## Testing and Verification

### Visual Indicators Added (Later Removed)
During debugging, we added visual alerts to show the authentication state:
- " Immediate Mode" - Tokens found, attempting direct upload
- "=� Queue Mode" - No tokens found, using offline queue

### Debug Logging
Added NSLog statements throughout the token retrieval process to trace the flow in Xcode console.

## Key Learnings

1. **Bundle ID Consistency**: When working with iOS app extensions and keychain sharing, ensure all components use exactly the same identifiers and access groups.

2. **Simulator vs Device**: Keychain access groups behave differently on simulator vs physical devices. The fallback approach (try without access group first) ensures compatibility with both.

3. **API Contract**: Always verify the exact API response format and status codes. The share creation endpoint returns 202 Accepted with an envelope format.

4. **Share Extension Constraints**: iOS share extensions have strict memory and time limits. Always set appropriate timeouts (5 seconds recommended).

5. **Debug in Xcode Console**: Share extension logs don't appear in Metro console. Use Xcode console for debugging.

## Current Status
 Share extension successfully finds authentication tokens
 Immediate posting works when online and authenticated
 Falls back to queue system when offline or unauthenticated
 Handles API responses correctly with 202 status code

## Environment-Specific Configuration

### Development
```swift
let apiBaseURL = "https://bookmarkai-dev.ngrok.io"
```

### Production
```swift
let apiBaseURL = ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "https://api.bookmarkai.com"
```

## Files Modified
1. `packages/mobile/bookmarkaimobile/ios/BookmarkAIShare/ShareViewController.swift`
2. `packages/mobile/bookmarkaimobile/ios/BookmarkAIShare/KeychainHelper.swift`
3. `packages/mobile/bookmarkaimobile/ios/BookmarkAI/BookmarkAI.entitlements`
4. `packages/mobile/bookmarkaimobile/ios/BookmarkAIShare/BookmarkAIShare.entitlements`
5. `packages/mobile/bookmarkaimobile/src/utils/keychain-config.ts`

## Future Considerations
1. Consider migrating from React Native's default bundle IDs to proper `com.bookmarkai` identifiers
2. ~~Implement environment-based configuration for API URLs~~ ✅ COMPLETED
3. ~~Add retry logic for failed immediate posts before falling back to queue~~ ✅ COMPLETED
4. ~~Consider adding a small delay before showing the success/failure alert to ensure better UX~~ ✅ COMPLETED

## Implemented Improvements

### Environment-Based Configuration (Completed)
- Added `API_BASE_URL` to both Info.plist files
- Created `.xcconfig` files for build configurations
- Updated ShareViewController to read from Info.plist
- React Native automatically switches based on `__DEV__`
- Debug builds use development URL, Release builds use production URL

### Retry Logic for Failed Posts (Completed)
- Implemented intelligent retry mechanism with time budget:
  - First attempt: 2.0 second timeout
  - Retry (if needed): 1.5 second timeout
  - Total time budget stays within 5 seconds
- Smart retry conditions:
  - Retries on: timeout, 5xx errors, network connection issues
  - No retry on: 4xx client errors, authentication failures
- Added 200ms delay between attempts
- Enhanced error messages for better user feedback

### Success Alert Delay (Completed)
- Added 0.5 second delay before showing success alert
- Provides smoother transition from "Saving..." to "Success!"
- No delay on failures to maintain responsiveness
- Improved processing alert messaging for clarity