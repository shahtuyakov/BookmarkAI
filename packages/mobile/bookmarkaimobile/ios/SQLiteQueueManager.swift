import Foundation
import SQLite3

/// SQLite-based queue manager for offline bookmark storage
/// Matches Android Room schema for cross-platform consistency
class SQLiteQueueManager {
    private var db: OpaquePointer?
    private let dbPath: String
    private let dbQueue = DispatchQueue(label: "sqlite.queue.bookmarkai", qos: .default)
    
    static let shared = SQLiteQueueManager()
    
    private init() {
        // Use app group container for shared access between main app and extension
        let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.bookmarkai")
        let dbURL = containerURL?.appendingPathComponent("bookmark_queue.sqlite")
        self.dbPath = dbURL?.path ?? ""
        
        openDatabase()
        createTableIfNeeded()
    }
    
    deinit {
        closeDatabase()
    }
    
    // MARK: - Database Setup
    
    private func openDatabase() {
        if sqlite3_open(dbPath, &db) != SQLITE_OK {
            print("❌ SQLiteQueueManager: Unable to open database at \(dbPath)")
            if let errorMessage = sqlite3_errmsg(db) {
                print("❌ SQLiteQueueManager: Error: \(String(cString: errorMessage))")
            }
        } else {
            
            // Enable foreign key support
            sqlite3_exec(db, "PRAGMA foreign_keys = ON;", nil, nil, nil)
            // Enable WAL mode for better concurrent access
            sqlite3_exec(db, "PRAGMA journal_mode = WAL;", nil, nil, nil)
        }
    }
    
    private func closeDatabase() {
        if let db = db {
            sqlite3_close(db)
            self.db = nil
            print("🔒 SQLiteQueueManager: Database closed")
        }
    }
    
    private func createTableIfNeeded() {
        // Match Android Room schema exactly
        let createTableSQL = """
            CREATE TABLE IF NOT EXISTS bookmark_queue (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT,
                notes TEXT,
                created_at INTEGER NOT NULL,
                status TEXT NOT NULL,
                retry_count INTEGER NOT NULL,
                last_error TEXT,
                updated_at INTEGER NOT NULL
            );
        """
        
        if sqlite3_exec(db, createTableSQL, nil, nil, nil) != SQLITE_OK {
            print("❌ SQLiteQueueManager: Unable to create table")
            if let errorMessage = sqlite3_errmsg(db) {
                print("❌ SQLiteQueueManager: Error: \(String(cString: errorMessage))")
            }
        } else {
            }
    }
    
    // MARK: - Queue Operations
    
    /// Add item to queue
    func addToQueue(_ item: QueueItem) -> Bool {
        // Validate required fields before inserting
        guard !item.id.isEmpty && !item.url.isEmpty else {
            print("❌ SQLiteQueueManager: Cannot add item with empty id('\(item.id)') or url('\(item.url)')")
            return false
        }
        
        
        return dbQueue.sync {
            let insertSQL = """
                INSERT OR REPLACE INTO bookmark_queue 
                (id, url, title, notes, created_at, status, retry_count, last_error, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """
            
            var statement: OpaquePointer?
            
            if sqlite3_prepare_v2(db, insertSQL, -1, &statement, nil) == SQLITE_OK {
                // Use SQLITE_TRANSIENT to ensure strings are copied
                let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
                
                sqlite3_bind_text(statement, 1, item.id, -1, SQLITE_TRANSIENT)
                sqlite3_bind_text(statement, 2, item.url, -1, SQLITE_TRANSIENT)
                
                if let title = item.title {
                    sqlite3_bind_text(statement, 3, title, -1, SQLITE_TRANSIENT)
                } else {
                    sqlite3_bind_null(statement, 3)
                }
                
                if let notes = item.notes {
                    sqlite3_bind_text(statement, 4, notes, -1, SQLITE_TRANSIENT)
                } else {
                    sqlite3_bind_null(statement, 4)
                }
                
                sqlite3_bind_int64(statement, 5, item.createdAt)
                sqlite3_bind_text(statement, 6, item.status.rawValue, -1, SQLITE_TRANSIENT)
                sqlite3_bind_int(statement, 7, Int32(item.retryCount))
                
                if let lastError = item.lastError {
                    sqlite3_bind_text(statement, 8, lastError, -1, SQLITE_TRANSIENT)
                } else {
                    sqlite3_bind_null(statement, 8)
                }
                
                sqlite3_bind_int64(statement, 9, item.updatedAt)
                
                if sqlite3_step(statement) == SQLITE_DONE {
                    sqlite3_finalize(statement)
                    return true
                } else {
                    print("❌ SQLiteQueueManager: Failed to insert item")
                    if let errorMessage = sqlite3_errmsg(db) {
                        print("❌ SQLiteQueueManager: Error: \(String(cString: errorMessage))")
                    }
                }
            }
            
            sqlite3_finalize(statement)
            return false
        }
    }
    
    /// Get all pending items (status = 'pending')
    func getPendingItems() -> [QueueItem] {
        return dbQueue.sync {
            var items: [QueueItem] = []
            
            let querySQL = """
                SELECT id, url, title, notes, created_at, status, retry_count, last_error, updated_at 
                FROM bookmark_queue 
                WHERE status = ? 
                ORDER BY created_at ASC;
            """
            
            var statement: OpaquePointer?
            
            if sqlite3_prepare_v2(db, querySQL, -1, &statement, nil) == SQLITE_OK {
                let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
                sqlite3_bind_text(statement, 1, QueueItem.QueueStatus.pending.rawValue, -1, SQLITE_TRANSIENT)
                
                while sqlite3_step(statement) == SQLITE_ROW {
                    if let item = parseQueueItem(from: statement) {
                        items.append(item)
                    }
                }
            } else {
                print("❌ SQLiteQueueManager: Failed to prepare query")
                if let errorMessage = sqlite3_errmsg(db) {
                    print("❌ SQLiteQueueManager: Error: \(String(cString: errorMessage))")
                }
            }
            
            sqlite3_finalize(statement)
            
            // Debug: If we have items but they seem empty, inspect the database
            if items.count > 0 && items.first?.url.isEmpty == true {
                debugDatabaseContents()
            }
            
            return items
        }
    }
    
    /// Get all items (for debugging/admin)
    func getAllItems() -> [QueueItem] {
        return dbQueue.sync {
            var items: [QueueItem] = []
            
            let querySQL = """
                SELECT id, url, title, notes, created_at, status, retry_count, last_error, updated_at 
                FROM bookmark_queue 
                ORDER BY created_at DESC;
            """
            
            var statement: OpaquePointer?
            
            if sqlite3_prepare_v2(db, querySQL, -1, &statement, nil) == SQLITE_OK {
                while sqlite3_step(statement) == SQLITE_ROW {
                    if let item = parseQueueItem(from: statement) {
                        items.append(item)
                    }
                }
            }
            
            sqlite3_finalize(statement)
            return items
        }
    }
    
    /// Update item status
    func updateItem(_ item: QueueItem) -> Bool {
        return dbQueue.sync {
            let updateSQL = """
                UPDATE bookmark_queue 
                SET status = ?, retry_count = ?, last_error = ?, updated_at = ? 
                WHERE id = ?;
            """
            
            var statement: OpaquePointer?
            
            if sqlite3_prepare_v2(db, updateSQL, -1, &statement, nil) == SQLITE_OK {
                let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
                
                sqlite3_bind_text(statement, 1, item.status.rawValue, -1, SQLITE_TRANSIENT)
                sqlite3_bind_int(statement, 2, Int32(item.retryCount))
                
                if let lastError = item.lastError {
                    sqlite3_bind_text(statement, 3, lastError, -1, SQLITE_TRANSIENT)
                } else {
                    sqlite3_bind_null(statement, 3)
                }
                
                sqlite3_bind_int64(statement, 4, item.updatedAt)
                sqlite3_bind_text(statement, 5, item.id, -1, SQLITE_TRANSIENT)
                
                if sqlite3_step(statement) == SQLITE_DONE {
                    sqlite3_finalize(statement)
                    return true
                } else {
                    print("❌ SQLiteQueueManager: Failed to update item \(item.id)")
                }
            }
            
            sqlite3_finalize(statement)
            return false
        }
    }
    
    /// Remove item from queue
    func removeItem(id: String) -> Bool {
        return dbQueue.sync {
            let deleteSQL = "DELETE FROM bookmark_queue WHERE id = ?;"
            
            var statement: OpaquePointer?
            
            if sqlite3_prepare_v2(db, deleteSQL, -1, &statement, nil) == SQLITE_OK {
                let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
                sqlite3_bind_text(statement, 1, id, -1, SQLITE_TRANSIENT)
                
                if sqlite3_step(statement) == SQLITE_DONE {
                    sqlite3_finalize(statement)
                    return true
                } else {
                    print("❌ SQLiteQueueManager: Failed to remove item \(id)")
                }
            }
            
            sqlite3_finalize(statement)
            return false
        }
    }
    
    /// Clear all completed items older than specified hours
    func clearOldCompletedItems(olderThanHours hours: Int = 24) -> Int {
        return dbQueue.sync {
            let cutoffTime = Int64(Date().timeIntervalSince1970 * 1000) - Int64(hours * 60 * 60 * 1000)
            
            let deleteSQL = """
                DELETE FROM bookmark_queue 
                WHERE status = ? AND updated_at < ?;
            """
            
            var statement: OpaquePointer?
            var deletedCount = 0
            
            if sqlite3_prepare_v2(db, deleteSQL, -1, &statement, nil) == SQLITE_OK {
                let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
                sqlite3_bind_text(statement, 1, QueueItem.QueueStatus.completed.rawValue, -1, SQLITE_TRANSIENT)
                sqlite3_bind_int64(statement, 2, cutoffTime)
                
                if sqlite3_step(statement) == SQLITE_DONE {
                    deletedCount = Int(sqlite3_changes(db))
                }
            }
            
            sqlite3_finalize(statement)
            return deletedCount
        }
    }
    
    /// Add test data to verify database functionality
    func addTestItem() -> Bool {
        let testItem = QueueItem.create(
            url: "https://test.example.com/test-url",
            title: "Test Title",
            notes: "Test notes from manual creation"
        )
        
        return addToQueue(testItem)
    }
    
    /// Clear all items from queue (for debugging)
    func clearAllItems() -> Bool {
        return dbQueue.sync {
            let deleteSQL = "DELETE FROM bookmark_queue;"
            
            var statement: OpaquePointer?
            
            if sqlite3_prepare_v2(db, deleteSQL, -1, &statement, nil) == SQLITE_OK {
                if sqlite3_step(statement) == SQLITE_DONE {
                    let deletedCount = Int(sqlite3_changes(db))
                    sqlite3_finalize(statement)
                    return true
                }
            }
            
            sqlite3_finalize(statement)
            return false
        }
    }
    
    /// Clean up corrupted data (items with empty id or url)
    func cleanupCorruptedData() -> Int {
        return dbQueue.sync {
            let deleteSQL = """
                DELETE FROM bookmark_queue 
                WHERE id IS NULL OR id = '' OR url IS NULL OR url = '';
            """
            
            var statement: OpaquePointer?
            var deletedCount = 0
            
            if sqlite3_prepare_v2(db, deleteSQL, -1, &statement, nil) == SQLITE_OK {
                if sqlite3_step(statement) == SQLITE_DONE {
                    deletedCount = Int(sqlite3_changes(db))
                }
            }
            
            sqlite3_finalize(statement)
            return deletedCount
        }
    }
    
    /// Get queue statistics
    func getQueueStats() -> [String: Int] {
        return dbQueue.sync {
            var stats: [String: Int] = [:]
            
            let statsSQL = """
                SELECT status, COUNT(*) as count 
                FROM bookmark_queue 
                GROUP BY status;
            """
            
            var statement: OpaquePointer?
            
            if sqlite3_prepare_v2(db, statsSQL, -1, &statement, nil) == SQLITE_OK {
                while sqlite3_step(statement) == SQLITE_ROW {
                    let status: String = {
                        if sqlite3_column_type(statement, 0) != SQLITE_NULL,
                           let text = sqlite3_column_text(statement, 0) {
                            return String(cString: text)
                        }
                        return "unknown"
                    }()
                    let count = Int(sqlite3_column_int(statement, 1))
                    stats[status] = count
                }
            }
            
            sqlite3_finalize(statement)
            return stats
        }
    }
    
    // MARK: - Helper Methods
    
    
    private func parseQueueItem(from statement: OpaquePointer?) -> QueueItem? {
        guard let statement = statement else { return nil }
        
        // Safely read required fields
        let id: String = {
            if sqlite3_column_type(statement, 0) != SQLITE_NULL,
               let text = sqlite3_column_text(statement, 0) {
                return String(cString: text)
            }
            return ""
        }()
        
        let url: String = {
            if sqlite3_column_type(statement, 1) != SQLITE_NULL,
               let text = sqlite3_column_text(statement, 1) {
                return String(cString: text)
            }
            return ""
        }()
        
        // Check if required fields are empty
        if id.isEmpty || url.isEmpty {
            print("❌ SQLiteQueueManager: Found item with empty id('\(id)') or url('\(url)')")
            return nil
        }
        
        let title: String? = {
            if sqlite3_column_type(statement, 2) != SQLITE_NULL {
                return String(cString: sqlite3_column_text(statement, 2))
            }
            return nil
        }()
        
        let notes: String? = {
            if sqlite3_column_type(statement, 3) != SQLITE_NULL {
                return String(cString: sqlite3_column_text(statement, 3))
            }
            return nil
        }()
        
        let createdAt = sqlite3_column_int64(statement, 4)
        
        let statusString: String = {
            if sqlite3_column_type(statement, 5) != SQLITE_NULL {
                return String(cString: sqlite3_column_text(statement, 5))
            }
            return "pending"
        }()
        let status = QueueItem.QueueStatus(rawValue: statusString) ?? .pending
        let retryCount = Int(sqlite3_column_int(statement, 6))
        
        let lastError: String? = {
            if sqlite3_column_type(statement, 7) != SQLITE_NULL {
                return String(cString: sqlite3_column_text(statement, 7))
            }
            return nil
        }()
        
        let updatedAt = sqlite3_column_int64(statement, 8)
        
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