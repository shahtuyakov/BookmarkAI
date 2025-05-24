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
        
        // Check for pending URL
        if let pendingURL = sharedDefaults.string(forKey: "pendingShareURL") {
          print("📤 ShareHandler: Found pending URL: \(pendingURL)")
          
          // Check timestamp to avoid processing very old shares
          if let timestamp = sharedDefaults.object(forKey: "pendingShareTimestamp") as? Date {
            let timeSinceShare = Date().timeIntervalSince(timestamp)
            print("⏰ ShareHandler: Time since share: \(timeSinceShare) seconds")
            
            // Only process shares from the last 5 minutes
            if timeSinceShare < 300 {
              // Clear the stored data first
              sharedDefaults.removeObject(forKey: "pendingShareURL")
              sharedDefaults.removeObject(forKey: "pendingShareTimestamp")
              sharedDefaults.synchronize()
              print("🧹 ShareHandler: Cleared stored data")
              
              // Send event to React Native
              self.sendEvent(withName: "ShareExtensionData", body: ["url": pendingURL])
              print("📨 ShareHandler: Sent event to React Native")
            } else {
              print("⏰ ShareHandler: Share too old, ignoring")
              // Clean up old data
              sharedDefaults.removeObject(forKey: "pendingShareURL")
              sharedDefaults.removeObject(forKey: "pendingShareTimestamp")
              sharedDefaults.synchronize()
            }
          } else {
            print("⚠️ ShareHandler: No timestamp found, processing anyway")
            // No timestamp, process it anyway but clear it
            sharedDefaults.removeObject(forKey: "pendingShareURL")
            sharedDefaults.removeObject(forKey: "pendingShareTimestamp")
            sharedDefaults.synchronize()
            
            self.sendEvent(withName: "ShareExtensionData", body: ["url": pendingURL])
            print("📨 ShareHandler: Sent event to React Native (no timestamp)")
          }
        } else {
          print("ℹ️ ShareHandler: No pending URL found")
        }
        
        // Debug: Print all keys in UserDefaults
        let allKeys = sharedDefaults.dictionaryRepresentation().keys
        print("🔍 ShareHandler: All UserDefaults keys: \(allKeys)")
      } else {
        print("❌ ShareHandler: Failed to get shared UserDefaults")
      }
    }
  }
  
  override func startObserving() {
    super.startObserving()
    print("👁️ ShareHandler: Started observing")
    
    // Register to receive the notification
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
    // Remove the observer
    NotificationCenter.default.removeObserver(self)
  }
  
  @objc func handleCheckPendingShares(_ notification: Notification) {
    print("📢 ShareHandler: Received CheckPendingShares notification")
    self.checkPendingShares()
  }
  
  // Required for RCTEventEmitter subclasses
  override func invalidate() {
    super.invalidate()
    print("💥 ShareHandler: Invalidated")
    NotificationCenter.default.removeObserver(self)
  }
}