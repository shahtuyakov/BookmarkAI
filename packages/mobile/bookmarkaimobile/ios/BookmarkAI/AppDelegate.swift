import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import GoogleSignIn

@main
class AppDelegate: RCTAppDelegate {
  override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
    self.moduleName = "BookmarkAI"
    self.dependencyProvider = RCTAppDependencyProvider()

    // You can add your custom initial props in the dictionary below.
    // They will be passed down to the ViewController used by React Native.
    self.initialProps = [:]

    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    
    // Check for pending shares after React Native is initialized
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
      NotificationCenter.default.post(name: NSNotification.Name("CheckPendingShares"), object: nil)
    }
    
    return result
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
  
  // Handle deep links and Google Sign-In
  override func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
    // Handle Google Sign-In
    if GIDSignIn.sharedInstance.handle(url) {
      return true
    }
    
    // Handle app deep links
    if url.scheme == "bookmarkai" {
      // Let React Navigation handle the deep link
      return super.application(app, open: url, options: options)
    }
    return false
  }
}