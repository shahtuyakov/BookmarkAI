# iOS SQLite Queue Testing Guide

## Overview

This guide explains how to test the iOS SQLite Queue Storage implementation in both the iOS Simulator and on physical devices.

## Testing Environment Setup

### Prerequisites

1. **Xcode** (latest stable version)
2. **iOS Simulator** (iOS 15.0+) or **Physical iOS Device**
3. **React Native Development Environment** set up
4. **Metro bundler** running

### Build Setup

1. **Navigate to iOS directory:**
   ```bash
   cd packages/mobile/bookmarkaimobile/ios
   ```

2. **Install CocoaPods dependencies:**
   ```bash
   pod install --repo-update
   ```

3. **Open workspace in Xcode:**
   ```bash
   open BookmarkAI.xcworkspace
   ```

4. **Verify target configuration:**
   - Main app target: `BookmarkAI`
   - Share extension target: `BookmarkAIShare`
   - Both should include the new Swift files:
     - `QueueItem.swift`
     - `SQLiteQueueManager.swift`

## Testing Capabilities

### ✅ What CAN be tested in Simulator

1. **SQLite Database Creation & Access**
   - Database file creation in app group container
   - Table schema validation
   - Basic CRUD operations

2. **Native Bridge Functionality**
   - React Native → Swift method calls
   - Return value handling
   - Error propagation

3. **Queue Management**
   - Queue statistics retrieval
   - Item status updates
   - Cleanup operations

4. **SyncService Integration**
   - Dual queue support (SQLite + MMKV)
   - Platform detection
   - Error handling

### ⚠️ What has LIMITED functionality in Simulator

1. **Share Extension Triggering**
   - Cannot easily test "Share" button from Safari/other apps
   - Share extension → main app communication is limited

2. **App Group Container Access**
   - May work differently than on device
   - File permissions could vary

3. **Background Processing**
   - Limited background app refresh simulation
   - Share extension lifecycle differences

### ❌ What CANNOT be tested in Simulator

1. **Real Share Extension Usage**
   - Actual sharing from Safari/social apps
   - Full share extension workflow

2. **Device-Specific Features**
   - True background app behavior
   - Real-world memory constraints

## Running Tests

### 1. Quick Test via React Native

**Start Metro and open app:**
```bash
cd packages/mobile/bookmarkaimobile
npx react-native start
npx react-native run-ios
```

**Access test interface:**
1. Open the app in simulator
2. Navigate to Home screen
3. Tap the "Tests" button (only visible in debug mode)
4. Select "iOS SQLite Queue Test" or "Detailed SQLite Test"

### 2. Direct Swift Testing

**Add breakpoints in Xcode:**
- `SQLiteQueueManager.swift` → `openDatabase()` method
- `ShareHandler.swift` → `getSQLiteQueueItems()` method

**Monitor console output:**
```
✅ SQLiteQueueManager: Database opened successfully
✅ SQLiteQueueManager: Table created or already exists
📋 ShareHandler: Getting all SQLite queue items
```

### 3. Manual Queue Population

**To test without share extension, add test data:**

```swift
// Add this temporarily to AppDelegate.swift for testing
func testSQLiteQueue() {
    let testItem = QueueItem.create(
        url: "https://example.com/test",
        title: "Test Bookmark",
        notes: "Added from simulator test"
    )
    
    let success = SQLiteQueueManager.shared.addToQueue(testItem)
    print("Test item added: \(success)")
}
```

## Test Scenarios

### Scenario 1: Basic Functionality
```typescript
// Via React Native test interface
1. Run "iOS SQLite Queue Test"
2. Check console for:
   - ✅ SQLite Queue Available: true/false
   - 📊 Queue Statistics: {...}
   - 📦 Total queue items: X
```

### Scenario 2: Database Location
```typescript
// Expected console output
📍 Expected database location: App Group Container
🔗 App Group ID: group.com.bookmarkai
📁 Database file: bookmark_queue.sqlite
✅ Database appears accessible
```

### Scenario 3: Error Handling
```typescript
// Test when SQLite is not available
🚧 IOSSQLiteQueueService: SQLite methods not available
📱 SyncService: iOS SQLite queue not available, using MMKV only
```

### Scenario 4: Integration Test
```typescript
// Run detailed test for full report
const report = await runDetailedIOSSQLiteQueueTests();
// Check report for all test results
```

## Expected Simulator Behavior

### ✅ Success Indicators

```
iOS SQLite Queue Test Results:
=====================================
✅ availability: PASSED
✅ databaseAccess: PASSED  
✅ stats: PASSED
✅ getItems: PASSED
✅ mockOps: PASSED

Summary: 5/5 tests passed
```

### ⚠️ Partial Success (Normal in Simulator)

```
iOS SQLite Queue Test Results:
=====================================
⚠️ availability: PASSED (with warnings)
✅ databaseAccess: PASSED
✅ stats: PASSED
✅ getItems: PASSED
✅ mockOps: PASSED

Summary: 4/5 tests passed
```

### ❌ Failure Indicators

```
❌ SQLiteQueueManager: Unable to open database
❌ ShareHandler: Failed to get SQLite queue items
📱 SyncService: SQLite queue not available, using MMKV only
```

## Debugging Tips

### 1. Check File Paths
```swift
// In SQLiteQueueManager.swift, add logging
print("📁 Database path: \(dbPath)")
print("📦 Container URL: \(containerURL?.absoluteString ?? "nil")")
```

### 2. Verify App Group Configuration
- Check `BookmarkAI.entitlements`
- Check `BookmarkAIShare.entitlements`
- Ensure both have `group.com.bookmarkai`

### 3. Monitor Native Bridge
```typescript
// Check if ShareHandler methods are available
console.log('ShareHandler methods:', Object.keys(ShareHandler || {}));
```

### 4. SQLite Command Line Testing
```bash
# If database is created, you can inspect it
sqlite3 ~/Library/Developer/CoreSimulator/Devices/[DEVICE_ID]/data/Containers/Shared/AppGroup/[GROUP_ID]/bookmark_queue.sqlite

# Check tables
.tables

# Check schema
.schema bookmark_queue
```

## Real Device Testing

### Additional Steps for Device Testing

1. **Provisioning Profile** with App Groups enabled
2. **Share Extension Testing:**
   - Open Safari
   - Navigate to supported site (TikTok, Reddit, Twitter/X)
   - Tap Share button
   - Select "BookmarkAI" from share sheet
   - Verify bookmark appears in queue

3. **Cross-App Verification:**
   - Add bookmark via share extension
   - Open main app
   - Check if bookmark appears in queue/timeline

## Troubleshooting Common Issues

### Issue 1: "SQLite methods not available"
**Cause:** Native bridge not properly linked
**Solution:** Clean build, check Xcode project file includes new Swift files

### Issue 2: "Database access failed"
**Cause:** App group not configured or permissions issue
**Solution:** Verify entitlements files, re-sign app

### Issue 3: "No items in queue"
**Cause:** Share extension not writing to SQLite
**Solution:** Test with manual queue population first

### Issue 4: TypeScript errors
**Cause:** Missing type definitions or import issues
**Solution:** Check import paths, rebuild TypeScript

## Success Criteria

The iOS SQLite Queue implementation is working correctly when:

1. ✅ Tests pass in React Native interface
2. ✅ Database file is created in app group container
3. ✅ Queue statistics return valid data
4. ✅ Native bridge methods respond without errors
5. ✅ SyncService recognizes SQLite queue availability
6. ✅ Console shows successful database operations

## Performance Expectations

- **Database Open Time:** < 100ms
- **Queue Item Retrieval:** < 50ms for 100 items
- **Memory Usage:** < 2MB for SQLite operations
- **File Size:** ~100KB for empty database, grows with items

This testing framework provides comprehensive validation of the iOS SQLite Queue Storage implementation across different environments and usage scenarios.