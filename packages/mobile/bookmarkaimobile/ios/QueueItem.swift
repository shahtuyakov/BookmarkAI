import Foundation

/// Queue item model matching Android Room schema and React Native SyncService interface
struct QueueItem {
    let id: String
    let url: String
    let title: String?
    let notes: String?
    let createdAt: Int64      // Unix timestamp in milliseconds
    let status: QueueStatus
    let retryCount: Int
    let lastError: String?
    let updatedAt: Int64      // Unix timestamp in milliseconds
    
    enum QueueStatus: String, CaseIterable {
        case pending = "pending"
        case processing = "processing"
        case completed = "completed"
        case failed = "failed"
    }
}

/// Extension for creating new queue items
extension QueueItem {
    static func create(url: String, title: String? = nil, notes: String? = nil) -> QueueItem {
        let now = Int64(Date().timeIntervalSince1970 * 1000) // Convert to milliseconds
        return QueueItem(
            id: generateULID(),
            url: url,
            title: title,
            notes: notes,
            createdAt: now,
            status: .pending,
            retryCount: 0,
            lastError: nil,
            updatedAt: now
        )
    }
    
    /// Generate ULID-like identifier (timestamp + random)
    private static func generateULID() -> String {
        let timestamp = String(Int64(Date().timeIntervalSince1970 * 1000), radix: 36)
        let random = String(Int.random(in: 100000...999999))
        return "\(timestamp)_\(random)".uppercased()
    }
    
    /// Create updated copy with new retry count and error
    func withRetry(error: String) -> QueueItem {
        return QueueItem(
            id: self.id,
            url: self.url,
            title: self.title,
            notes: self.notes,
            createdAt: self.createdAt,
            status: self.retryCount + 1 >= 3 ? .failed : .pending,
            retryCount: self.retryCount + 1,
            lastError: error,
            updatedAt: Int64(Date().timeIntervalSince1970 * 1000)
        )
    }
    
    /// Create updated copy with new status
    func withStatus(_ newStatus: QueueStatus) -> QueueItem {
        return QueueItem(
            id: self.id,
            url: self.url,
            title: self.title,
            notes: self.notes,
            createdAt: self.createdAt,
            status: newStatus,
            retryCount: self.retryCount,
            lastError: self.lastError,
            updatedAt: Int64(Date().timeIntervalSince1970 * 1000)
        )
    }
}

/// Extension for React Native bridge compatibility
extension QueueItem {
    /// Convert to dictionary for React Native bridge
    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = [
            "id": id,
            "url": url,
            "timestamp": createdAt,  // React Native expects 'timestamp' field
            "retryCount": retryCount,
            "createdAt": createdAt,
            "status": status.rawValue,
            "updatedAt": updatedAt
        ]
        
        // Always include title and notes, even if nil (as empty strings)
        dict["title"] = title ?? ""
        dict["notes"] = notes ?? ""
        
        if let lastError = lastError {
            dict["lastError"] = lastError
        }
        
        return dict
    }
    
    /// Create from React Native dictionary
    static func fromDictionary(_ dict: [String: Any]) -> QueueItem? {
        guard let id = dict["id"] as? String,
              let url = dict["url"] as? String else {
            return nil
        }
        
        let title = dict["title"] as? String
        let notes = dict["notes"] as? String
        let createdAt = dict["createdAt"] as? Int64 ?? dict["timestamp"] as? Int64 ?? Int64(Date().timeIntervalSince1970 * 1000)
        let statusString = dict["status"] as? String ?? "pending"
        let status = QueueStatus(rawValue: statusString) ?? .pending
        let retryCount = dict["retryCount"] as? Int ?? 0
        let lastError = dict["lastError"] as? String
        let updatedAt = dict["updatedAt"] as? Int64 ?? createdAt
        
        return QueueItem(
            id: id,
            url: url,
            title: title,
            notes: notes,
            createdAt: createdAt,
            status: status,
            retryCount: retryCount,
            lastError: lastError,
            updatedAt: updatedAt
        )
    }
}