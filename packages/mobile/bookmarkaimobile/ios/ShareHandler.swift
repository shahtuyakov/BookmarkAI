// File: ShareHandler.swift - Place this in your iOS project folder
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
    if let sharedDefaults = UserDefaults(suiteName: "group.com.bookmarkai") {
      if let pendingURL = sharedDefaults.string(forKey: "pendingShareURL") {
        // Clear the stored data
        sharedDefaults.removeObject(forKey: "pendingShareURL")
        sharedDefaults.removeObject(forKey: "pendingShareTimestamp")
        sharedDefaults.synchronize()
        
        // Send event to React Native
        self.sendEvent(withName: "ShareExtensionData", body: ["url": pendingURL])
      }
    }
  }
  
  override func startObserving() {
    super.startObserving()
    
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
    // Remove the observer
    NotificationCenter.default.removeObserver(self)
  }
  
  @objc func handleCheckPendingShares(_ notification: Notification) {
    self.checkPendingShares()
  }
}