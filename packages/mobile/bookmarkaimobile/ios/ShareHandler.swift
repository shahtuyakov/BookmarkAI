import Foundation
import React

@objc(ShareHandler)
class ShareHandler: RCTEventEmitter {
  
  override static func requiresMainQueueSetup() -> Bool {
    return true
  }
  
  override func supportedEvents() -> [String] {
    return ["ShareExtensionData"]
  }
  
  // MARK: - SQLite Queue Management Methods
  
  @objc func getSQLiteQueueItems(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let items = SQLiteQueueManager.shared.getAllItems()
    let itemDicts = items.map { item -> [String: Any] in
      return item.toDictionary()
    }
    resolve(itemDicts)
  }
  
  @objc func getPendingQueueItems(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let items = SQLiteQueueManager.shared.getPendingItems()
    let itemDicts = items.map { item -> [String: Any] in
      return item.toDictionary()
    }
    resolve(itemDicts)
  }
  
  @objc func updateQueueItemStatus(_ itemId: String, status: String, error: String?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    // Get current item
    let allItems = SQLiteQueueManager.shared.getAllItems()
    guard let currentItem = allItems.first(where: { $0.id == itemId }) else {
      reject("ITEM_NOT_FOUND", "Queue item \(itemId) not found", nil)
      return
    }
    
    // Create updated item
    var updatedItem: QueueItem
    
    if let queueStatus = QueueItem.QueueStatus(rawValue: status) {
      if let error = error {
        updatedItem = currentItem.withRetry(error: error)
      } else {
        updatedItem = currentItem.withStatus(queueStatus)
      }
    } else {
      reject("INVALID_STATUS", "Invalid status: \(status)", nil)
      return
    }
    
    // Update in database
    let success = SQLiteQueueManager.shared.updateItem(updatedItem)
    if success {
      resolve(true)
    } else {
      reject("UPDATE_FAILED", "Failed to update item status", nil)
    }
  }
  
  @objc func removeQueueItem(_ itemId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let success = SQLiteQueueManager.shared.removeItem(id: itemId)
    if success {
      resolve(true)
    } else {
      reject("REMOVE_FAILED", "Failed to remove item", nil)
    }
  }
  
  @objc func getQueueStats(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let stats = SQLiteQueueManager.shared.getQueueStats()
    resolve(stats)
  }
  
  @objc func cleanupOldItems(_ hours: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let deletedCount = SQLiteQueueManager.shared.clearOldCompletedItems(olderThanHours: hours.intValue)
    resolve(NSNumber(value: deletedCount))
  }
  
  @objc func clearAllQueueItems(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let success = SQLiteQueueManager.shared.clearAllItems()
    resolve(success)
  }
  
  @objc func addTestQueueItem(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let success = SQLiteQueueManager.shared.addTestItem()
    resolve(success)
  }
  
  @objc func cleanupCorruptedData(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let cleanedCount = SQLiteQueueManager.shared.cleanupCorruptedData()
    resolve(cleanedCount)
  }
  
  @objc func checkPendingShares() {
    // Clean up any corrupted data first
    let cleanedCount = SQLiteQueueManager.shared.cleanupCorruptedData()
    if cleanedCount > 0 {
      print("🧹 ShareHandler: Cleaned up \(cleanedCount) corrupted items")
    }
    
    DispatchQueue.main.async {
      if let sharedDefaults = UserDefaults(suiteName: "group.com.bookmarkai") {
        
        // Check for new pending shares in queue
        if sharedDefaults.bool(forKey: "hasNewPendingShares") {
          self.processSharesQueue(sharedDefaults: sharedDefaults)
        }
        
        // Also check for legacy single share (backward compatibility)
        self.checkLegacySingleShare(sharedDefaults: sharedDefaults)
      } else {
        print("❌ ShareHandler: Failed to get shared UserDefaults")
      }
    }
  }
  
  private func processSharesQueue(sharedDefaults: UserDefaults) {
    
    // Get pending items from SQLite queue
    let pendingItems = SQLiteQueueManager.shared.getPendingItems()
    
    if pendingItems.isEmpty {
      // Check for legacy UserDefaults queue for backward compatibility
      processLegacyUserDefaultsQueue(sharedDefaults: sharedDefaults)
      return
    }
    
    
    // Filter out shares older than 5 minutes and convert to React Native format
    let currentTime = Int64(Date().timeIntervalSince1970 * 1000)
    var validShares: [[String: Any]] = []
    
    for item in pendingItems {
      let timeSinceShare = currentTime - item.createdAt
      let timeSinceShareSeconds = Double(timeSinceShare) / 1000.0
      
      if timeSinceShareSeconds < 300 { // 5 minutes
        validShares.append(item.toDictionary())
      } else {
        // Mark old items as failed instead of processing them
        let failedItem = item.withStatus(.failed)
        SQLiteQueueManager.shared.updateItem(failedItem)
      }
    }
    
    if !validShares.isEmpty {
      // Send all valid shares using the existing event type
      self.sendEvent(withName: "ShareExtensionData", body: [
        "isQueue": true,
        "shares": validShares,
        "silent": true,
        "source": "sqlite"
      ])
    }
    
    // Clear the flag (queue items will be managed by React Native SyncService)
    sharedDefaults.removeObject(forKey: "hasNewPendingShares")
    sharedDefaults.synchronize()
  }
  
  /// Process legacy UserDefaults queue for backward compatibility
  private func processLegacyUserDefaultsQueue(sharedDefaults: UserDefaults) {
    guard let sharesQueue = sharedDefaults.array(forKey: "pendingSharesQueue") as? [[String: Any]] else {
      return
    }
    
    
    // Migrate legacy queue items to SQLite
    for shareData in sharesQueue {
      if let queueItem = QueueItem.fromDictionary(shareData) {
        SQLiteQueueManager.shared.addToQueue(queueItem)
      }
    }
    
    // Clear legacy queue
    sharedDefaults.removeObject(forKey: "pendingSharesQueue")
    sharedDefaults.synchronize()
    
    // Process the migrated items
    processSharesQueue(sharedDefaults: sharedDefaults)
  }
  
  private func checkLegacySingleShare(sharedDefaults: UserDefaults) {
    // Check for legacy single share format (backward compatibility)
    if let pendingURL = sharedDefaults.string(forKey: "pendingShareURL") {
      print("📤 ShareHandler: Found legacy single share: \(pendingURL)")
      
      let wasProcessedByExtension = sharedDefaults.bool(forKey: "shareProcessedByExtension")
      
      if let timestamp = sharedDefaults.object(forKey: "pendingShareTimestamp") as? Date {
        let timeSinceShare = Date().timeIntervalSince(timestamp)
        
        if timeSinceShare < 300 { // 5 minutes
          // Clear the stored data first
          sharedDefaults.removeObject(forKey: "pendingShareURL")
          sharedDefaults.removeObject(forKey: "pendingShareTimestamp")
          sharedDefaults.removeObject(forKey: "shareProcessedByExtension")
          sharedDefaults.synchronize()
          
          // Send legacy single share event
          let eventData: [String: Any] = [
            "url": pendingURL,
            "silent": wasProcessedByExtension,
            "isQueue": false
          ]
          
          self.sendEvent(withName: "ShareExtensionData", body: eventData)
          print("📨 ShareHandler: Sent legacy share to React Native")
        } else {
          print("⏰ ShareHandler: Legacy share too old, cleaning up")
          sharedDefaults.removeObject(forKey: "pendingShareURL")
          sharedDefaults.removeObject(forKey: "pendingShareTimestamp")
          sharedDefaults.removeObject(forKey: "shareProcessedByExtension")
          sharedDefaults.synchronize()
        }
      }
    }
  }
  
  override func startObserving() {
    super.startObserving()
    print("👁️ ShareHandler: Started observing")
    
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleCheckPendingShares(_:)),
      name: NSNotification.Name("CheckPendingShares"),
      object: nil
    )
  }
  
  override func stopObserving() {
    super.stopObserving()
    print("🛑 ShareHandler: Stopped observing")
    NotificationCenter.default.removeObserver(self)
  }
  
  @objc func handleCheckPendingShares(_ notification: Notification) {
    self.checkPendingShares()
  }
  
  override func invalidate() {
    super.invalidate()
    NotificationCenter.default.removeObserver(self)
  }
}