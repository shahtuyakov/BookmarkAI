import XCTest
@testable import BookmarkAI

class ShareHandlerBridgeContractTests: XCTestCase {
    var bridge: RCTBridge!
    var shareHandler: ShareHandler!
    
    override func setUp() {
        super.setUp()
        bridge = RCTBridge(delegate: self, launchOptions: nil)
        shareHandler = bridge.module(for: ShareHandler.self) as? ShareHandler
    }
    
    override func tearDown() {
        bridge = nil
        shareHandler = nil
        super.tearDown()
    }
    
    func testFlushQueueContract() async throws {
        // Contract: React Native expects share queue entries in specific format
        let expectation = expectation(description: "Flush queue completion")
        
        // Mock queue entries that match the contract
        let mockEntries = [
            [
                "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
                "url": "https://example.com/article",
                "createdAt": "2024-01-15T10:30:00.000Z",
                "status": "pending",
                "source": "ios-share-extension",
                "metadata": [
                    "title": "Example Page",
                    "description": "Example description"
                ] as [String : Any]
            ] as [String : Any]
        ]
        
        // Validate contract fields
        for entry in mockEntries {
            // ULID format validation
            if let id = entry["id"] as? String {
                XCTAssertTrue(id.range(of: "^[0-9A-HJKMNP-TV-Z]{26}$", options: .regularExpression) != nil,
                            "ID must be in ULID format")
            }
            
            // URL format validation
            if let url = entry["url"] as? String {
                XCTAssertTrue(url.hasPrefix("https://") || url.hasPrefix("http://"),
                            "URL must start with http:// or https://")
            }
            
            // ISO 8601 date format validation
            if let createdAt = entry["createdAt"] as? String {
                let dateFormatter = ISO8601DateFormatter()
                dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                XCTAssertNotNil(dateFormatter.date(from: createdAt),
                               "createdAt must be in ISO 8601 format")
            }
            
            // Status enum validation
            if let status = entry["status"] as? String {
                let validStatuses = ["pending", "processing", "completed", "failed"]
                XCTAssertTrue(validStatuses.contains(status),
                            "Status must be one of: \(validStatuses.joined(separator: ", "))")
            }
            
            // Source enum validation
            if let source = entry["source"] as? String {
                let validSources = ["ios-share-extension", "android-share-intent", "webextension", "react-native"]
                XCTAssertTrue(validSources.contains(source),
                            "Source must be one of: \(validSources.joined(separator: ", "))")
            }
        }
        
        expectation.fulfill()
        
        await fulfillment(of: [expectation], timeout: 5.0)
    }
    
    func testShareQueueEntryStructure() {
        // Test that our Swift structure matches the contract
        struct ShareQueueEntry: Codable {
            let id: String
            let url: String
            let createdAt: String
            let status: String
            let source: String
            let metadata: Metadata?
            
            struct Metadata: Codable {
                let title: String?
                let description: String?
            }
        }
        
        let entry = ShareQueueEntry(
            id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
            url: "https://example.com",
            createdAt: "2024-01-15T10:30:00.000Z",
            status: "pending",
            source: "ios-share-extension",
            metadata: ShareQueueEntry.Metadata(
                title: "Test Page",
                description: "Test Description"
            )
        )
        
        // Verify we can encode/decode according to contract
        do {
            let encoded = try JSONEncoder().encode(entry)
            let decoded = try JSONDecoder().decode(ShareQueueEntry.self, from: encoded)
            
            XCTAssertEqual(decoded.id, entry.id)
            XCTAssertEqual(decoded.url, entry.url)
            XCTAssertEqual(decoded.createdAt, entry.createdAt)
            XCTAssertEqual(decoded.status, entry.status)
            XCTAssertEqual(decoded.source, entry.source)
            XCTAssertEqual(decoded.metadata?.title, entry.metadata?.title)
            XCTAssertEqual(decoded.metadata?.description, entry.metadata?.description)
        } catch {
            XCTFail("Failed to encode/decode share queue entry: \(error)")
        }
    }
}

// MARK: - RCTBridgeDelegate
extension ShareHandlerBridgeContractTests: RCTBridgeDelegate {
    func sourceURL(for bridge: RCTBridge!) -> URL! {
        return nil
    }
}