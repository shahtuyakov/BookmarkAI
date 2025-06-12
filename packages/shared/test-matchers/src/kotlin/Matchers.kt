package com.bookmarkai.testmatchers

import au.com.dius.pact.consumer.dsl.PactDslJsonBody
import au.com.dius.pact.consumer.dsl.PactDslJsonRootValue

object BookmarkAIMatchers {
    
    fun uuid(example: String = "550e8400-e29b-41d4-a716-446655440000") = 
        PactDslJsonRootValue.uuid(example)
    
    fun ulid(example: String = "01ARZ3NDEKTSV4RRFFQ69G5FAV") =
        PactDslJsonRootValue.stringMatcher(
            "^[0-9A-HJKMNP-TV-Z]{26}$",
            example
        )
    
    fun iso8601DateTime(example: String = "2024-01-15T10:30:00.000Z") =
        PactDslJsonRootValue.datetime(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            example
        )
    
    fun like(value: Any) = when (value) {
        is String -> PactDslJsonRootValue.stringType(value)
        is Int -> PactDslJsonRootValue.integerType(value)
        is Long -> PactDslJsonRootValue.integerType(value)
        is Double -> PactDslJsonRootValue.decimalType(value)
        is Float -> PactDslJsonRootValue.decimalType(value)
        is Boolean -> PactDslJsonRootValue.booleanType(value)
        else -> throw IllegalArgumentException("Unsupported type: ${value::class}")
    }
    
    fun eachLike(value: Any, min: Int = 1) = 
        PactDslJsonBody().minArrayLike("", min).`object`(value)
    
    fun term(matcher: String, generate: String) =
        PactDslJsonRootValue.stringMatcher(matcher, generate)
    
    fun integer(example: Int = 1) =
        PactDslJsonRootValue.integerType(example)
    
    fun decimal(example: Double = 1.23) =
        PactDslJsonRootValue.decimalType(example)
    
    fun boolean(example: Boolean = true) =
        PactDslJsonRootValue.booleanType(example)
    
    fun string(example: String = "example") =
        PactDslJsonRootValue.stringType(example)
    
    fun email(example: String = "user@example.com") =
        PactDslJsonRootValue.stringMatcher(
            "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
            example
        )
    
    fun url(example: String = "https://example.com") =
        PactDslJsonRootValue.stringMatcher(
            "^https?://.+",
            example
        )
    
    fun oneOf(vararg values: String) =
        PactDslJsonRootValue.stringMatcher(
            values.joinToString("|") { "($it)" },
            values.first()
        )
    
    fun jwt(example: String? = null): PactDslJsonRootValue {
        val defaultJWT = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        return PactDslJsonRootValue.stringMatcher(
            "^[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]*$",
            example ?: defaultJWT
        )
    }
    
    fun base64(example: String = "SGVsbG8gV29ybGQ=") =
        PactDslJsonRootValue.stringMatcher(
            "^[A-Za-z0-9+/]*={0,2}$",
            example
        )
    
    fun semver(example: String = "1.0.0") =
        PactDslJsonRootValue.stringMatcher(
            "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$",
            example
        )
    
    fun paginationMatchers() = PactDslJsonBody()
        .integerType("page", 1)
        .integerType("pageSize", 20)
        .integerType("totalPages", 5)
        .integerType("totalItems", 100)
        .booleanType("hasNextPage", true)
        .booleanType("hasPreviousPage", false)
    
    fun errorResponseMatchers(code: String, message: String) = PactDslJsonBody()
        .`object`("error")
            .stringMatcher("code", code, code)
            .stringType("message", message)
            .datetime("timestamp", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
            .stringType("path", "/v1/shares")
            .uuid("requestId")
        .closeObject()
    
    fun shareQueueEntryMatchers() = PactDslJsonBody()
        .stringMatcher("id", "^[0-9A-HJKMNP-TV-Z]{26}$", "01ARZ3NDEKTSV4RRFFQ69G5FAV")
        .stringMatcher("url", "^https?://.+", "https://example.com")
        .datetime("createdAt", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
        .stringMatcher("status", "(pending|processing|completed|failed)", "pending")
        .stringMatcher("source", "(ios-share-extension|android-share-intent|webextension|react-native)", "ios-share-extension")
        .`object`("metadata")
            .stringType("title", "Example Page")
            .stringType("description", "Example description")
        .closeObject()
}