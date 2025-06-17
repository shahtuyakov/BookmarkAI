import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers
import Foundation

class ShareViewController: SLComposeServiceViewController {
    private var urlToShare: URL?
    private var isProcessing = false
    
    override func viewDidLoad() {
        super.viewDidLoad()
        NSLog("🎯🎯🎯 ShareViewController: viewDidLoad called!")
        NSLog("📱 Bundle ID: %@", Bundle.main.bundleIdentifier ?? "unknown")
        NSLog("📱 Extension context: %@", extensionContext != nil ? "available" : "nil")
        title = "BookmarkAI"
        placeholder = "Add a comment (optional)"
        extractURL()
    }
    
    override func didSelectPost() {
        print("🎯🎯🎯 ShareViewController: didSelectPost called!")
        print("📝 URL to share: \(urlToShare?.absoluteString ?? "nil")")
        print("📝 Is processing: \(isProcessing)")
        print("📝 Content text: \(contentText)")
        
        guard let url = urlToShare, !isProcessing else {
            if urlToShare == nil {
                showError("No URL found to share.")
                print("❌ ShareViewController: No URL found")
            }
            print("❌ ShareViewController: Guard failed - url: \(urlToShare != nil), processing: \(isProcessing)")
            return
        }
        
        guard isURLSupported(url) else {
            showError("Unsupported URL. BookmarkAI supports TikTok, Reddit, Twitter, and X.")
            print("❌ ShareViewController: URL not supported: \(url)")
            return
        }
        
        print("✅ ShareViewController: All checks passed, starting immediate posting")
        isProcessing = true
        
        // Try immediate posting first, fallback to queue if it fails
        attemptImmediatePostingThenFallback(url: url)
    }
    
    /**
     * Attempt immediate API posting with fallback to queue system
     * This provides Android-like immediate posting while maintaining reliability
     */
    private func attemptImmediatePostingThenFallback(url: URL) {
        print("🚀 ShareViewController: Starting immediate posting attempt for \(url)")
        
        // Debug: Check if we're in the share extension context
        print("📱 Bundle ID: \(Bundle.main.bundleIdentifier ?? "unknown")")
        
        // Get authentication tokens
        NSLog("🔐🔐🔐 ShareViewController: About to check keychain for auth tokens...")
        let (accessToken, refreshToken) = KeychainHelper.shared.getAuthTokens()
        
        NSLog("🔐 Auth check - Access token: %@", accessToken != nil ? "Found (\(accessToken!.prefix(20))...)" : "Not found")
        NSLog("🔐 Auth check - Refresh token: %@", refreshToken != nil ? "Found" : "Not found")
        
        // DEBUG: Show what we found
        if accessToken != nil {
            let alert = UIAlertController(
                title: "✅ Tokens Found!",
                message: "Found auth tokens! Token preview: \(accessToken!.prefix(20))...",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in
                self.showProcessingAlert()
                Task {
                    let result = await self.postShareImmediately(
                        url: url.absoluteString,
                        title: self.extractTitleFromURL(url),
                        notes: self.contentText,
                        accessToken: accessToken!,
                        userId: self.extractUserIdFromToken(accessToken!)
                    )
                    
                    await MainActor.run {
                        self.handleImmediatePostResult(result: result, url: url)
                    }
                }
            })
            present(alert, animated: true)
            return
        }
        
        // If we didn't find tokens, show debug info and fall back to queue
        NSLog("🔐❌ ShareViewController: No auth tokens found, falling back to queue")
        
        // Debug: Show alert about missing auth
        let bundleID = Bundle.main.bundleIdentifier ?? "unknown"
        let debugMessage = """
        No auth tokens found.
        Bundle ID: \(bundleID)
        Service: com.bookmarkai.auth
        Account: auth_tokens
        Access Groups tried:
        - org.reactjs.native.example.BookmarkAI
        - (no access group)
        - \(KeychainHelper.shared.getTeamID() ?? "?").org.reactjs.native.example.BookmarkAI
        """
        
        let debugAlert = UIAlertController(
            title: "Debug: Auth Missing",
            message: debugMessage,
            preferredStyle: .alert
        )
        debugAlert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            self.fallbackToQueue(url: url, reason: "No authentication")
        })
        present(debugAlert, animated: true)
    }
    
    private func handleImmediatePostResult(result: SharePostResult, url: URL) {
        switch result {
        case .success(let shareId):
            print("✅ ShareViewController: Immediate posting succeeded! Share ID: \(shareId ?? "unknown")")
            showSuccessAlert(url: url, immediate: true)
            
        case .failure(let error):
            print("❌ ShareViewController: Immediate posting failed: \(error.description)")
            
            // Show queue fallback feedback
            showFallbackAlert(url: url, reason: error.description)
        }
    }
    
    private func fallbackToQueue(url: URL, reason: String) {
        print("♻️ ShareViewController: Falling back to queue - \(reason)")
        addToQueueAndShowAlert(url: url, immediate: false)
    }
    
    private func showProcessingAlert() {
        let alert = UIAlertController(
            title: "Saving Bookmark... ⚡", 
            message: "Attempting immediate upload", 
            preferredStyle: .alert
        )
        present(alert, animated: true)
    }
    
    private func showSuccessAlert(url: URL, immediate: Bool) {
        dismiss(animated: false) {
            let alert = UIAlertController(
                title: immediate ? "Bookmark Saved Instantly! 🚀" : "Bookmark Queued! 📋", 
                message: immediate 
                    ? "Successfully uploaded to BookmarkAI:\n\(url.host ?? url.absoluteString)"
                    : "Saved to queue. Will sync when app opens:\n\(url.host ?? url.absoluteString)", 
                preferredStyle: .alert
            )
            
            alert.addAction(UIAlertAction(title: "Great!", style: .default) { [weak self] _ in
                self?.closeExtension()
            })
            
            self.present(alert, animated: true)
        }
    }
    
    private func showFallbackAlert(url: URL, reason: String) {
        dismiss(animated: false) {
            let alert = UIAlertController(
                title: "Bookmark Queued! 📋", 
                message: "Saved to queue (will sync when app opens):\n\(url.host ?? url.absoluteString)", 
                preferredStyle: .alert
            )
            
            alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
                self?.addToQueueAndClose(url: url)
            })
            
            self.present(alert, animated: true)
        }
    }
    
    private func addToQueueAndShowAlert(url: URL, immediate: Bool) {
        addToQueueAndClose(url: url)
    }
    
    private func closeExtension() {
        isProcessing = false
        self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
    
    private func addToQueueAndClose(url: URL) {
        
        // Create queue item with extracted title
        let urlString = url.absoluteString
        let title = extractTitleFromURL(url)
        let notes = contentText
        
        
        let queueItem = QueueItem.create(
            url: urlString,
            title: title,
            notes: notes
        )
        
        
        // Add to SQLite queue
        let success = SQLiteQueueManager.shared.addToQueue(queueItem)
        
        if success {
            
            // Set flag in UserDefaults for backward compatibility with existing ShareHandler
            if let groupDefaults = UserDefaults(suiteName: "group.com.bookmarkai") {
                groupDefaults.set(true, forKey: "hasNewPendingShares")
                groupDefaults.synchronize()
            }
        }
        
        // Create deep link URL and open main app silently (in background)
        if let encodedURL = url.absoluteString.addingPercentEncoding(withAllowedCharacters: .urlHostAllowed),
           let deepLink = URL(string: "bookmarkai://share?url=\(encodedURL)&source=extension&silent=true&queued=true") {
            
            var responder: UIResponder? = self as UIResponder
            let selector = #selector(openURL(_:))
            
            while responder != nil {
                if responder!.responds(to: selector) && responder != self {
                    responder!.perform(selector, with: deepLink)
                    break
                }
                responder = responder?.next
            }
        }
        
        // Close the extension
        self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
    
    private func extractURL() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return }
        
        for item in items {
            guard let attachments = item.attachments else { continue }
            
            for attachment in attachments {
                if attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    attachment.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] (item, error) in
                        if let url = item as? URL {
                            DispatchQueue.main.async {
                                self?.urlToShare = url
                                self?.validateURL(url)
                            }
                        }
                    }
                    return
                } else if attachment.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    attachment.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] (item, error) in
                        if let text = item as? String, let url = self?.extractURLFromText(text) {
                            DispatchQueue.main.async {
                                self?.urlToShare = url
                                self?.validateURL(url)
                            }
                        }
                    }
                    return
                }
            }
        }
    }
    
    private func extractURLFromText(_ text: String) -> URL? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let matches = detector?.matches(in: text, options: [], range: NSRange(location: 0, length: text.utf16.count))
        
        if let match = matches?.first, let range = Range(match.range, in: text) {
            return URL(string: String(text[range]))
        }
        return nil
    }
    
    private func validateURL(_ url: URL) {
        let isSupported = isURLSupported(url)
        placeholder = isSupported
            ? "Share \(url.host ?? "content") to BookmarkAI"
            : "⚠️ Unsupported URL. BookmarkAI supports TikTok, Reddit, Twitter, and X."
    }
    
    private func isURLSupported(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host.contains("tiktok.com") ||
               host.contains("reddit.com") ||
               host.contains("twitter.com") ||
               host.contains("x.com")
    }
    
    override func didSelectCancel() {
        self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
    
    private func showError(_ message: String) {
        let alert = UIAlertController(title: "Error", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        })
        present(alert, animated: true)
    }
    
    @objc private func openURL(_ url: URL) {
        // This is handled by the system
    }
    
    // MARK: - Helper Methods
    
    /// Extract user ID from JWT token (simple base64 decode)
    private func extractUserIdFromToken(_ token: String) -> String {
        let components = token.components(separatedBy: ".")
        guard components.count > 1 else { return "unknown" }
        
        let payload = components[1]
        // Add padding if needed for base64 decoding
        let paddedPayload = payload + String(repeating: "=", count: (4 - payload.count % 4) % 4)
        
        guard let data = Data(base64Encoded: paddedPayload),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let userId = json["sub"] as? String ?? json["userId"] as? String else {
            return "unknown"
        }
        
        return userId
    }
    
    /// Extract title from URL for better bookmark organization
    private func extractTitleFromURL(_ url: URL) -> String? {
        guard let host = url.host else { return nil }
        
        // Platform-specific title extraction
        if host.contains("tiktok.com") {
            return "TikTok: \(url.pathComponents.last ?? "Video")"
        } else if host.contains("reddit.com") {
            // Extract subreddit and post info from Reddit URLs
            let components = url.pathComponents
            if components.count >= 3 && components[1] == "r" {
                return "Reddit: r/\(components[2])"
            }
            return "Reddit Post"
        } else if host.contains("twitter.com") || host.contains("x.com") {
            // Extract username from Twitter/X URLs
            let components = url.pathComponents
            if components.count >= 2 {
                return "\(host.contains("x.com") ? "X" : "Twitter"): @\(components[1])"
            }
            return host.contains("x.com") ? "X Post" : "Twitter Post"
        }
        
        // Fallback to domain name
        return host.replacingOccurrences(of: "www.", with: "").capitalized
    }
    
    // MARK: - Immediate Posting Implementation
    
    private func postShareImmediately(
        url: String,
        title: String?,
        notes: String?,
        accessToken: String,
        userId: String
    ) async -> SharePostResult {
        
        let startTime = Date()
        print("🚀 ShareViewController: Attempting immediate post for: \(url)")
        
        // Prepare request - use actual API URL
        // For development with ngrok or production
        let apiBaseURL = ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "https://bookmarkai-dev.ngrok.io" // Update this to your actual API URL
        guard let apiURL = URL(string: "\(apiBaseURL)/api/v1/shares") else {
            return .failure(.invalidURL)
        }
        
        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("ios-share-extension", forHTTPHeaderField: "User-Agent")
        
        // Add idempotency key for enhanced idempotency system (ADR-014)
        let idempotencyKey = UUID().uuidString
        request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
        
        request.timeoutInterval = 2.5 // Must complete within 2.5 seconds
        
        // Prepare request body
        let requestBody: [String: Any] = [
            "url": url,
            "title": title ?? "",
            "notes": notes ?? "",
            "source": "ios-share-extension",
            "immediate": true
        ]
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
        } catch {
            print("❌ ShareViewController: JSON serialization failed: \(error)")
            return .failure(.jsonError(error))
        }
        
        // Make the request with timeout
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            
            let elapsed = Date().timeIntervalSince(startTime)
            print("⏱️ ShareViewController: Request completed in \(elapsed)s")
            
            guard let httpResponse = response as? HTTPURLResponse else {
                return .failure(.invalidResponse)
            }
            
            print("📡 ShareViewController: Status code: \(httpResponse.statusCode)")
            
            if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                // Parse response to get share ID
                if let shareData = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let shareId = shareData["id"] as? String {
                    print("✅ ShareViewController: Share created successfully with ID: \(shareId)")
                    return .success(shareId)
                } else {
                    print("✅ ShareViewController: Share created successfully (no ID parsed)")
                    return .success(nil)
                }
            } else if httpResponse.statusCode == 401 {
                print("🔐 ShareViewController: Authentication failed")
                return .failure(.authenticationFailed)
            } else if httpResponse.statusCode == 409 {
                print("♻️ ShareViewController: Duplicate share (idempotency)")
                return .success(nil) // Treat duplicates as success
            } else {
                print("❌ ShareViewController: Server error: \(httpResponse.statusCode)")
                return .failure(.serverError(httpResponse.statusCode))
            }
            
        } catch let error as NSError where error.code == NSURLErrorTimedOut {
            print("⏰ ShareViewController: Request timed out")
            return .failure(.timeout)
        } catch {
            print("❌ ShareViewController: Network error: \(error)")
            return .failure(.networkError(error))
        }
    }
}

// MARK: - Result Types

enum SharePostResult {
    case success(String?) // Optional share ID
    case failure(SharePostError)
}

enum SharePostError {
    case invalidURL
    case jsonError(Error)
    case invalidResponse
    case authenticationFailed
    case timeout
    case networkError(Error)
    case serverError(Int)
    
    var description: String {
        switch self {
        case .invalidURL:
            return "Invalid API URL"
        case .jsonError(let error):
            return "JSON error: \(error.localizedDescription)"
        case .invalidResponse:
            return "Invalid server response"
        case .authenticationFailed:
            return "Authentication failed"
        case .timeout:
            return "Request timed out"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code):
            return "Server error: \(code)"
        }
    }
}