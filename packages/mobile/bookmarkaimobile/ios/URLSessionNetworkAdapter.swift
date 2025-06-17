import Foundation
import React

@objc(URLSessionNetworkAdapter)
class URLSessionNetworkAdapter: RCTEventEmitter {
  
  private var session: URLSession!
  private var tasks: [String: URLSessionDataTask] = [:]
  private let queue = DispatchQueue(label: "com.bookmarkai.urlsession", attributes: .concurrent)
  
  override init() {
    super.init()
    
    // Configure URLSession with custom configuration
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 30.0
    config.timeoutIntervalForResource = 60.0
    config.waitsForConnectivity = true
    config.allowsCellularAccess = true
    
    // Enable certificate pinning in production
    #if !DEBUG
    config.urlCache = nil
    config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    #endif
    
    self.session = URLSession(configuration: config, delegate: nil, delegateQueue: nil)
  }
  
  // MARK: - React Native Bridge Setup
  
  @objc
  override static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  override func supportedEvents() -> [String]! {
    return ["URLSessionNetworkAdapterProgress"]
  }
  
  // MARK: - Public Methods
  
  @objc
  func request(_ config: NSDictionary,
               resolver resolve: @escaping RCTPromiseResolveBlock,
               rejecter reject: @escaping RCTPromiseRejectBlock) {
    
    guard let urlString = config["url"] as? String,
          let url = URL(string: urlString) else {
      reject("INVALID_URL", "Invalid URL provided", nil)
      return
    }
    
    let method = (config["method"] as? String ?? "GET").uppercased()
    let headers = config["headers"] as? [String: String] ?? [:]
    let body = config["data"]
    let timeout = config["timeout"] as? TimeInterval ?? 30.0
    
    queue.async { [weak self] in
      guard let self = self else { return }
      
        // Create request
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = timeout
        
        // Set headers
        headers.forEach { key, value in
          request.setValue(value, forHTTPHeaderField: key)
        }
        
        // Set body
        if let body = body {
          if let bodyData = try? JSONSerialization.data(withJSONObject: body) {
            request.httpBody = bodyData
            if request.value(forHTTPHeaderField: "Content-Type") == nil {
              request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }
          }
        }
        
        // Generate request ID for tracking
        let requestId = UUID().uuidString
        
        // Create data task
        let task = self.session.dataTask(with: request) { [weak self] data, response, error in
          self?.queue.async(flags: .barrier) {
            self?.tasks.removeValue(forKey: requestId)
          }
          
          if let error = error {
            // Handle network errors
            if (error as NSError).code == NSURLErrorCancelled {
              reject("REQUEST_CANCELLED", "Request was cancelled", error)
            } else if (error as NSError).code == NSURLErrorTimedOut {
              reject("REQUEST_TIMEOUT", "Request timed out", error)
            } else if (error as NSError).code == NSURLErrorNotConnectedToInternet {
              reject("NO_INTERNET", "No internet connection", error)
            } else {
              reject("NETWORK_ERROR", error.localizedDescription, error)
            }
            return
          }
          
          guard let httpResponse = response as? HTTPURLResponse else {
            reject("INVALID_RESPONSE", "Invalid response type", nil)
            return
          }
          
          // Parse response
          var responseDict: [String: Any] = [
            "status": httpResponse.statusCode,
            "headers": httpResponse.allHeaderFields
          ]
          
          if let data = data {
            // Try to parse as JSON
            if let json = try? JSONSerialization.jsonObject(with: data) {
              responseDict["data"] = json
            } else if let text = String(data: data, encoding: .utf8) {
              responseDict["data"] = text
            } else {
              // Return base64 encoded data for binary responses
              responseDict["data"] = data.base64EncodedString()
              responseDict["isBase64"] = true
            }
          }
          
          resolve(responseDict)
        }
        
        // Store task for potential cancellation
        self.queue.async(flags: .barrier) {
          self.tasks[requestId] = task
        }
        
        // Start the task
        task.resume()
        
    }
  }
  
  @objc
  func cancelRequest(_ requestId: String) {
    queue.async(flags: .barrier) { [weak self] in
      if let task = self?.tasks[requestId] {
        task.cancel()
        self?.tasks.removeValue(forKey: requestId)
      }
    }
  }
  
  @objc
  func cancelAllRequests() {
    queue.async(flags: .barrier) { [weak self] in
      self?.tasks.values.forEach { $0.cancel() }
      self?.tasks.removeAll()
    }
  }
  
  // MARK: - Certificate Pinning (Production Only)
  
  #if !DEBUG
  private func validateCertificate(for challenge: URLAuthenticationChallenge) -> Bool {
    guard let serverTrust = challenge.protectionSpace.serverTrust,
          let certificate = SecTrustGetCertificateAtIndex(serverTrust, 0) else {
      return false
    }
    
    // Add your certificate pinning logic here
    // Compare against known certificate fingerprints
    let pinnedCertificates = getPinnedCertificates()
    let serverCertData = SecCertificateCopyData(certificate) as Data
    
    return pinnedCertificates.contains { pinnedCert in
      return pinnedCert == serverCertData
    }
  }
  
  private func getPinnedCertificates() -> [Data] {
    // Load pinned certificates from bundle
    var certificates: [Data] = []
    
    if let certPath = Bundle.main.path(forResource: "bookmarkai-prod", ofType: "cer"),
       let certData = try? Data(contentsOf: URL(fileURLWithPath: certPath)) {
      certificates.append(certData)
      print("[Certificate Pinning] Loaded primary certificate (\(certData.count) bytes)")
    } else {
      print("[Certificate Pinning] Warning: Primary certificate not found")
    }
    
    if let backupCertPath = Bundle.main.path(forResource: "bookmarkai-backup", ofType: "cer"),
       let backupCertData = try? Data(contentsOf: URL(fileURLWithPath: backupCertPath)) {
      certificates.append(backupCertData)
      print("[Certificate Pinning] Loaded backup certificate (\(backupCertData.count) bytes)")
    } else {
      print("[Certificate Pinning] Warning: Backup certificate not found")
    }
    
    if certificates.isEmpty {
      print("[Certificate Pinning] ERROR: No certificates found! Add bookmarkai-prod.cer and bookmarkai-backup.cer to the iOS bundle.")
    }
    
    return certificates
  }
  #endif
  
  // MARK: - Cleanup
  
  deinit {
    session.invalidateAndCancel()
  }
}

// MARK: - URLSession Delegate Extension

extension URLSessionNetworkAdapter: URLSessionDelegate {
  func urlSession(_ session: URLSession,
                  didReceive challenge: URLAuthenticationChallenge,
                  completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    #if DEBUG
    // Allow all certificates in debug mode
    if let serverTrust = challenge.protectionSpace.serverTrust {
      completionHandler(.useCredential, URLCredential(trust: serverTrust))
    } else {
      completionHandler(.performDefaultHandling, nil)
    }
    #else
    // Validate certificate in production
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
      if validateCertificate(for: challenge),
         let serverTrust = challenge.protectionSpace.serverTrust {
        completionHandler(.useCredential, URLCredential(trust: serverTrust))
      } else {
        completionHandler(.cancelAuthenticationChallenge, nil)
      }
    } else {
      completionHandler(.performDefaultHandling, nil)
    }
    #endif
  }
}