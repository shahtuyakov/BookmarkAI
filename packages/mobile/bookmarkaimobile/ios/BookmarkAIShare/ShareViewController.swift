import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: SLComposeServiceViewController {
    private var urlToShare: URL?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "BookmarkAI"
        placeholder = "Add a comment (optional)"
        extractURL()
    }
    
    override func didSelectPost() {
        guard let url = urlToShare, isURLSupported(url) else {
            showError("Unsupported URL. BookmarkAI supports TikTok, Reddit, Twitter, and X.")
            return
        }
        
        // Show immediate success feedback
        showSuccessAndClose(url: url)
    }
    
    private func showSuccessAndClose(url: URL) {
        // Create success alert
        let alert = UIAlertController(
            title: "Bookmark Saved! 🎉", 
            message: "Successfully saved to BookmarkAI:\n\(url.host ?? url.absoluteString)", 
            preferredStyle: .alert
        )
        
        // Add action that handles the background saving
        alert.addAction(UIAlertAction(title: "Great!", style: .default) { [weak self] _ in
            self?.addToQueueAndClose(url: url)
        })
        
        present(alert, animated: true)
    }
    
    private func addToQueueAndClose(url: URL) {
        // Add to pending shares queue instead of overwriting
        if let groupDefaults = UserDefaults(suiteName: "group.com.bookmarkai") {
            
            // Create new share entry
            let newShare: [String: Any] = [
                "url": url.absoluteString,
                "timestamp": Date().timeIntervalSince1970,
                "id": UUID().uuidString
            ]
            
            // Get existing queue or create new one
            var sharesQueue = groupDefaults.array(forKey: "pendingSharesQueue") as? [[String: Any]] ?? []
            
            // Add new share to queue
            sharesQueue.append(newShare)
            
            // Save updated queue
            groupDefaults.set(sharesQueue, forKey: "pendingSharesQueue")
            groupDefaults.set(true, forKey: "hasNewPendingShares") // Flag to trigger processing
            groupDefaults.synchronize()
            
            print("📤 Added share to queue. Queue size: \(sharesQueue.count)")
            print("🔗 Share URL: \(url.absoluteString)")
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
}