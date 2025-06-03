# iOS URLSession Native Network Adapter

This document describes the native iOS URLSession adapter implementation for the BookmarkAI SDK.

## Overview

The iOS URLSession adapter provides a native networking implementation that offers:
- Better performance than JavaScript-based networking
- Native certificate pinning support
- Proper background session handling
- Integration with iOS system networking features

## Architecture

### Components

1. **URLSessionNetworkAdapter.swift** - Native Swift implementation
   - Uses URLSession for all network requests
   - Implements certificate pinning in production builds
   - Provides request cancellation support
   - Handles all HTTP methods and response types

2. **URLSessionNetworkAdapter.m** - Objective-C bridge
   - Exposes Swift module to React Native
   - Defines JavaScript-callable methods

3. **IOSURLSessionAdapter.ts** - TypeScript adapter
   - Implements the SDK's NetworkAdapter interface
   - Translates between JavaScript and native module
   - Provides error handling and response transformation

4. **PlatformNetworkAdapter.ts** - Platform selector
   - Automatically uses URLSession on iOS
   - Falls back to React Native adapter on Android
   - Provides seamless cross-platform support

## Features

### Certificate Pinning

In production builds, the adapter validates SSL certificates against pinned certificates:

```swift
#if !DEBUG
private func validateCertificate(for challenge: URLAuthenticationChallenge) -> Bool {
    // Certificate validation logic
}
#endif
```

To add your certificates:
1. Export your SSL certificates as .cer files
2. Add them to the iOS bundle:
   - `bookmarkai-prod.cer` - Primary certificate
   - `bookmarkai-backup.cer` - Backup certificate
3. Include them in the Xcode project

### Request Configuration

The adapter supports all standard HTTP request configurations:

```typescript
const response = await client.request({
  url: 'https://api.bookmarkai.com/v1/shares',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Custom-Header': 'value'
  },
  data: {
    url: 'https://example.com',
    title: 'Example'
  },
  timeout: 30000 // 30 seconds
});
```

### Error Handling

The adapter provides detailed error information:

- `REQUEST_TIMEOUT` - Request exceeded timeout
- `NO_INTERNET` - No network connection
- `REQUEST_CANCELLED` - Request was cancelled
- `INVALID_URL` - Malformed URL
- `NETWORK_ERROR` - General network failure

## Usage

### Automatic Usage

The adapter is automatically used when you initialize the SDK in the React Native app:

```typescript
// In SDKContext.tsx
const networkAdapter = new PlatformNetworkAdapter();
// Automatically uses URLSession on iOS
```

### Manual Usage

You can explicitly use the URLSession adapter:

```typescript
import { IOSURLSessionAdapter } from '../adapters';

const client = new BookmarkAIClient({
  adapter: {
    network: new IOSURLSessionAdapter(),
    // ... other adapters
  }
});
```

### Request Cancellation

The adapter supports cancelling requests:

```typescript
const adapter = new IOSURLSessionAdapter();

// Cancel a specific request
await adapter.cancelRequest(requestId);

// Cancel all pending requests
await adapter.cancelAllRequests();
```

## Development vs Production

### Development Mode
- Certificate pinning is disabled
- All SSL certificates are accepted
- Useful for testing with local servers or ngrok

### Production Mode
- Certificate pinning is enabled
- Only pinned certificates are accepted
- Provides protection against MITM attacks

## Performance Benefits

1. **Native Performance**: Direct URLSession usage is faster than JavaScript networking
2. **System Integration**: Leverages iOS system caching and connection pooling
3. **Background Support**: Can continue requests when app is backgrounded
4. **Memory Efficiency**: Native memory management for large responses

## Testing

To test the URLSession adapter:

1. **Unit Tests**: Run iOS unit tests in Xcode
2. **Integration Tests**: Use the React Native test suite
3. **Certificate Pinning**: Test with production certificates
4. **Error Scenarios**: Test timeout, no internet, and cancellation

## Troubleshooting

### Module Not Found

If you see "Native module not available" warning:
1. Run `cd ios && pod install`
2. Clean build folder in Xcode
3. Rebuild the app

### Certificate Pinning Issues

If requests fail in production:
1. Verify certificates are included in bundle
2. Check certificate expiration dates
3. Ensure backup certificate is valid
4. Review URLSession delegate logs

### Build Errors

If you encounter Swift compilation errors:
1. Ensure Swift version is 5.0+
2. Check React Native bridge imports
3. Verify Objective-C bridging header

## Future Enhancements

1. **Request Priorities**: Support for URLSession task priorities
2. **Download Progress**: Progress callbacks for large downloads
3. **Upload Progress**: Progress callbacks for file uploads
4. **Background Sessions**: Support for background URL sessions
5. **Metrics Collection**: Network performance metrics