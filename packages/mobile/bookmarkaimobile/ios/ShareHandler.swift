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
  
  @objc func checkPendingShares() {
    print("🔍 ShareHandler: checkPendingShares called")
    
    DispatchQueue.main.async {
      if let sharedDefaults = UserDefaults(suiteName: "group.com.bookmarkai") {
        print("✅ ShareHandler: Got shared UserDefaults")
        
        // Check for new pending shares in queue
        if sharedDefaults.bool(forKey: "hasNewPendingShares") {
          print("📦 ShareHandler: Found new pending shares in queue")
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
    guard let sharesQueue = sharedDefaults.array(forKey: "pendingSharesQueue") as? [[String: Any]] else {
      print("ℹ️ ShareHandler: No shares queue found")
      return
    }
    
    print("📦 ShareHandler: Processing \(sharesQueue.count) shares from queue")
    
    var validShares: [[String: Any]] = []
    let currentTime = Date().timeIntervalSince1970
    
    // Filter out shares older than 5 minutes
    for shareData in sharesQueue {
      if let timestamp = shareData["timestamp"] as? TimeInterval {
        let timeSinceShare = currentTime - timestamp
        if timeSinceShare < 300 { // 5 minutes
          validShares.append(shareData)
        } else {
          print("⏰ ShareHandler: Skipping old share (age: \(timeSinceShare)s)")
        }
      } else {
        // No timestamp, assume it's recent
        validShares.append(shareData)
      }
    }
    
    if !validShares.isEmpty {
      // Send all valid shares using the existing event type
      // Use a special format to indicate this is a queue
      self.sendEvent(withName: "ShareExtensionData", body: [
        "isQueue": true,
        "shares": validShares,
        "silent": true
      ])
      print("📨 ShareHandler: Sent \(validShares.count) shares to React Native as queue")
    }
    
    // Clear the queue and flag
    sharedDefaults.removeObject(forKey: "pendingSharesQueue")
    sharedDefaults.removeObject(forKey: "hasNewPendingShares")
    sharedDefaults.synchronize()
    print("🧹 ShareHandler: Cleared shares queue")
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
    print("📢 ShareHandler: Received CheckPendingShares notification")
    self.checkPendingShares()
  }
  
  override func invalidate() {
    super.invalidate()
    print("💥 ShareHandler: Invalidated")
    NotificationCenter.default.removeObserver(self)
  }
}