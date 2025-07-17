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
            showError("Unsupported URL. BookmarkAI supports TikTok, Reddit, Twitter, X, YouTube, and Instagram.")
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
        let (accessToken, _) = KeychainHelper.shared.getAuthTokens()
        
        // Check if we have valid tokens
        guard let accessToken = accessToken, !accessToken.isEmpty else {
            self.fallbackToQueue(url: url, reason: "No authentication")
            return
        }
        
        // Show immediate processing feedback
        self.showProcessingAlert()
        
        // Start immediate posting with retry logic
        Task {
            let result = await self.postShareWithRetry(
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
        case .success(_):
            // Add small delay for smooth UX on success
            Task {
                try? await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
                await MainActor.run {
                    self.showSuccessAlert(url: url, immediate: true)
                }
            }
            
        case .failure(let error):
            // No delay on failure - show immediately
            showFallbackAlert(url: url, reason: error.description)
        }
    }
    
    private func fallbackToQueue(url: URL, reason: String) {
        addToQueueAndShowAlert(url: url, immediate: false)
    }
    
    private func showProcessingAlert() {
        let alert = UIAlertController(
            title: "Saving Bookmark...", 
            message: "Please wait a moment", 
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
            : "⚠️ Unsupported URL. BookmarkAI supports TikTok, Reddit, Twitter, X, YouTube, and Instagram."
    }
    
    private func isURLSupported(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host.contains("tiktok.com") ||
               host.contains("reddit.com") ||
               host.contains("twitter.com") ||
               host.contains("x.com") ||
               host.contains("youtube.com") ||
               host.contains("youtu.be") ||
               host.contains("instagram.com") ||
               host.contains("instagr.am")
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
    
    private func postShareWithRetry(
        url: String,
        title: String?,
        notes: String?,
        accessToken: String,
        userId: String
    ) async -> SharePostResult {
        // First attempt with 2 second timeout
        var result = await postShareImmediately(
            url: url,
            title: title,
            notes: notes,
            accessToken: accessToken,
            userId: userId,
            timeout: 2.0
        )
        
        // Check if we should retry
        if shouldRetry(result: result) {
            // Wait a brief moment before retry
            try? await Task.sleep(nanoseconds: 200_000_000) // 0.2 seconds
            
            // Retry with 1.5 second timeout
            result = await postShareImmediately(
                url: url,
                title: title,
                notes: notes,
                accessToken: accessToken,
                userId: userId,
                timeout: 1.5
            )
        }
        
        return result
    }
    
    private func shouldRetry(result: SharePostResult) -> Bool {
        switch result {
        case .success:
            return false
        case .failure(let error):
            switch error {
            // Retry on timeout
            case .timeout:
                return true
            // Retry on 5xx server errors
            case .serverError(let code):
                return code >= 500
            // Don't retry on auth failures or API validation errors
            case .authenticationFailed, .invalidURL, .jsonError, .invalidResponse, .apiError:
                return false
            // Retry on network errors (connection issues)
            case .networkError:
                return true
            }
        }
    }
    
    private func postShareImmediately(
        url: String,
        title: String?,
        notes: String?,
        accessToken: String,
        userId: String,
        timeout: TimeInterval = 5.0
    ) async -> SharePostResult {
        // Get API URL from shared configuration using App Groups
        guard let apiURL = SharedConfiguration.shared.sharesEndpointURL else {
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
        
        request.timeoutInterval = timeout // Dynamic timeout for retry logic
        
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
                // Try to parse error message from response
                if let responseData = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let error = responseData["error"] as? [String: Any],
                   let message = error["message"] as? String {
                    return .failure(.apiError(message))
                }
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
    case apiError(String) // New case for API validation errors
    
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
            let nsError = error as NSError
            if nsError.code == NSURLErrorNotConnectedToInternet {
                return "No internet connection"
            } else if nsError.code == NSURLErrorCannotConnectToHost {
                return "Cannot connect to server"
            }
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code):
            if code >= 500 {
                return "Server error (\(code)) - temporary issue"
            }
            return "Request error: \(code)"
        case .apiError(let message):
            return message
        }
    }
}