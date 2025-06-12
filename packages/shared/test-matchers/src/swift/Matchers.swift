import PactSwift

public struct BookmarkAIMatchers {
    
    public static func uuid(example: String = "550e8400-e29b-41d4-a716-446655440000") -> Matcher {
        return Matcher.SomethingLike(
            Matcher.RegexLike(
                value: example,
                pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
            )
        )
    }
    
    public static func ulid(example: String = "01ARZ3NDEKTSV4RRFFQ69G5FAV") -> Matcher {
        return Matcher.RegexLike(
            value: example,
            pattern: "^[0-9A-HJKMNP-TV-Z]{26}$"
        )
    }
    
    public static func iso8601DateTime(example: String = "2024-01-15T10:30:00.000Z") -> Matcher {
        return Matcher.RegexLike(
            value: example,
            pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$"
        )
    }
    
    public static func like(_ value: Any) -> Matcher {
        return Matcher.SomethingLike(value)
    }
    
    public static func eachLike(_ value: Any, min: Int = 1) -> Matcher {
        return Matcher.EachLike(value, min: min)
    }
    
    public static func term(matcher: String, generate: String) -> Matcher {
        return Matcher.RegexLike(value: generate, pattern: matcher)
    }
    
    public static func integer(example: Int = 1) -> Matcher {
        return Matcher.IntegerLike(example)
    }
    
    public static func decimal(example: Double = 1.23) -> Matcher {
        return Matcher.DecimalLike(example)
    }
    
    public static func boolean(example: Bool = true) -> Matcher {
        return Matcher.SomethingLike(example)
    }
    
    public static func string(example: String = "example") -> Matcher {
        return Matcher.SomethingLike(example)
    }
    
    public static func email(example: String = "user@example.com") -> Matcher {
        return Matcher.RegexLike(
            value: example,
            pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
        )
    }
    
    public static func url(example: String = "https://example.com") -> Matcher {
        return Matcher.RegexLike(
            value: example,
            pattern: "^https?://.+"
        )
    }
    
    public static func oneOf(_ values: Any...) -> Matcher {
        return Matcher.IncludesLike(values.first ?? "", values)
    }
    
    public static func jwt(example: String? = nil) -> Matcher {
        let defaultJWT = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        return Matcher.RegexLike(
            value: example ?? defaultJWT,
            pattern: "^[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]*$"
        )
    }
    
    public static func base64(example: String = "SGVsbG8gV29ybGQ=") -> Matcher {
        return Matcher.RegexLike(
            value: example,
            pattern: "^[A-Za-z0-9+/]*={0,2}$"
        )
    }
    
    public static func semver(example: String = "1.0.0") -> Matcher {
        return Matcher.RegexLike(
            value: example,
            pattern: "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$"
        )
    }
    
    public struct PaginationMatchers {
        public let page = integer(example: 1)
        public let pageSize = integer(example: 20)
        public let totalPages = integer(example: 5)
        public let totalItems = integer(example: 100)
        public let hasNextPage = boolean(example: true)
        public let hasPreviousPage = boolean(example: false)
    }
    
    public struct ErrorResponseMatchers {
        public let error: [String: Matcher]
        
        public init(code: String, message: String) {
            self.error = [
                "code": term(matcher: code, generate: code),
                "message": string(example: message),
                "timestamp": iso8601DateTime(),
                "path": string(example: "/v1/shares"),
                "requestId": uuid()
            ]
        }
    }
    
    public struct ShareQueueEntryMatchers {
        public let id = ulid()
        public let url = url()
        public let createdAt = iso8601DateTime()
        public let status = oneOf("pending", "processing", "completed", "failed")
        public let source = oneOf("ios-share-extension", "android-share-intent", "webextension", "react-native")
        public let metadata = like([
            "title": string(example: "Example Page"),
            "description": string(example: "Example description")
        ])
    }
}