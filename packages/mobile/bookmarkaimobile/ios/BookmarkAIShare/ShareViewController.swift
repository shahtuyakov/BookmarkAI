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
        title = "BookmarkAI"
        placeholder = "Add a comment (optional)"
        extractURL()
    }
    
    override func didSelectPost() {
        
        guard let url = urlToShare, !isProcessing else {
            if urlToShare == nil {
                showError("No URL found to share.")
            }
            return
        }
        
        guard isURLSupported(url) else {
            showError("Unsupported URL. BookmarkAI supports TikTok, Reddit, Twitter, and X.")
            return
        }
        
        isProcessing = true
        
        // Try immediate posting first, fallback to queue if it fails
        attemptImmediatePostingThenFallback(url: url)
    }
    
    /**
     * Attempt immediate API posting with fallback to queue system
     * This provides Android-like immediate posting while maintaining reliability
     */
    private func attemptImmediatePostingThenFallback(url: URL) {
        
        // Get authentication tokens
        let (accessToken, refreshToken) = KeychainHelper.shared.getAuthTokens()
        
        // Check if we have valid tokens
        guard let accessToken = accessToken, !accessToken.isEmpty else {
            self.fallbackToQueue(url: url, reason: "No authentication")
            return
        }
        
        // Show immediate processing feedback
        self.showProcessingAlert()
        
        // Start immediate posting with timeout
        Task {
            let result = await self.postShareImmediately(
                url: url.absoluteString,
                title: self.extractTitleFromURL(url),
                notes: self.contentText,
                accessToken: accessToken,
                userId: self.extractUserIdFromToken(accessToken)
            )
            
            await MainActor.run {
                self.handleImmediatePostResult(result: result, url: url)
            }
        }
    }
    
    private func handleImmediatePostResult(result: SharePostResult, url: URL) {
        switch result {
        case .success(let shareId):
            showSuccessAlert(url: url, immediate: true)
            
        case .failure(let error):
            
            // Show queue fallback feedback
            showFallbackAlert(url: url, reason: error.description)
        }
    }
    
    private func fallbackToQueue(url: URL, reason: String) {
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
                message: "Saved to queue (will sync when app opens):\n\(url.host ?? url.absoluteString)\n\nReason: \(reason)", 
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
        
        // Prepare request - use the same API URL as the main app
        let apiBaseURL = "https://bookmarkai-dev.ngrok.io" // Development URL
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
        
        request.timeoutInterval = 5.0 // Essential for share extension
        
        // Prepare request body
        let requestBody: [String: Any] = [
            "url": url
        ]
        
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
        } catch {
            return .failure(.jsonError(error))
        }
        
        // Make the request with timeout
        do {
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                return .failure(.invalidResponse)
            }
            
            
            
            if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 || httpResponse.statusCode == 202 {
                // Parse response to get share ID from envelope format
                if let responseData = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let dataObject = responseData["data"] as? [String: Any],
                   let shareId = dataObject["id"] as? String {
                    return .success(shareId)
                } else {
                    return .success(nil)
                }
            } else if httpResponse.statusCode == 401 {
                return .failure(.authenticationFailed)
            } else if httpResponse.statusCode == 409 {
                return .success(nil) // Treat duplicates as success
            } else {
                return .failure(.serverError(httpResponse.statusCode))
            }
            
        } catch let error as NSError where error.code == NSURLErrorTimedOut {
            return .failure(.timeout)
        } catch let error as NSError {
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