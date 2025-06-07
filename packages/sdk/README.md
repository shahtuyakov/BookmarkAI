# BookmarkAI SDK

Type-safe TypeScript SDK for the BookmarkAI API, automatically generated from OpenAPI specifications.

## Installation

```bash
npm install @bookmarkai/sdk
# or
yarn add @bookmarkai/sdk
# or
pnpm add @bookmarkai/sdk
```

## Features

- 🚀 **Type-safe** - Full TypeScript support with generated types
- 🔌 **Pluggable adapters** - Support for different network layers
- 🔄 **Automatic retries** - Built-in retry logic with exponential backoff
- 🔐 **Token management** - Automatic token refresh with singleflight mutex
- 📦 **Batch operations** - Automatic request batching for better performance
- 🏥 **Health checks** - Built-in circuit breaker for API health
- 📊 **Rate limiting** - Client-side token bucket implementation

## Usage

### Basic Setup

```typescript
import { BookmarkAIClient } from '@bookmarkai/sdk';

const client = new BookmarkAIClient({
  baseUrl: 'https://api.bookmarkai.com',
  adapter: 'fetch', // or 'axios', 'react-native'
});
```

### Authentication

```typescript
// Login
const { accessToken, refreshToken } = await client.auth.login({
  email: 'user@example.com',
  password: 'password'
});

// Set tokens
client.setTokens({ accessToken, refreshToken });

// Tokens are automatically refreshed when needed
```

### Creating Shares

```typescript
// Single share
const share = await client.shares.create({
  url: 'https://example.com/article',
  idempotencyKey: 'unique-key-123'
});

// Batch operation (automatically triggered when multiple shares are created within 2 seconds)
const shares = await Promise.all([
  client.shares.create({ url: 'https://example.com/1' }),
  client.shares.create({ url: 'https://example.com/2' }),
  client.shares.create({ url: 'https://example.com/3' })
]);
```

### Platform-Specific Adapters

#### React Native

```typescript
import { BookmarkAIClient, ReactNativeAdapter } from '@bookmarkai/sdk';

const client = new BookmarkAIClient({
  adapter: new ReactNativeAdapter({
    storage: AsyncStorage, // or react-native-keychain
  })
});
```

#### iOS Native Bridge

```typescript
import { BookmarkAIClient, IOSAdapter } from '@bookmarkai/sdk';

const client = new BookmarkAIClient({
  adapter: new IOSAdapter() // Uses URLSession under the hood
});
```

#### Android Native Bridge

```typescript
import { BookmarkAIClient, AndroidAdapter } from '@bookmarkai/sdk';

const client = new BookmarkAIClient({
  adapter: new AndroidAdapter() // Uses OkHttp under the hood
});
```

### Development Mode

```typescript
// Hot-reload configuration in development
if (__DEV__) {
  client.enableDevMode({
    configUrl: '/.well-known/dev-config.json',
    pollInterval: 1000 // Check for ngrok URL updates every second
  });
}
```

### Error Handling

```typescript
try {
  await client.shares.create({ url: 'https://example.com' });
} catch (error) {
  if (error.code === 'RATE_LIMITED') {
    console.log(`Retry after ${error.retryAfter} seconds`);
  } else if (error.code === 'NETWORK_ERROR') {
    console.log('Check your internet connection');
  }
}
```

## Configuration

### Environment Variables

- `BOOKMARKAI_API_URL` - Base URL for the API
- `BOOKMARKAI_API_VERSION` - API version (default: '1.0')

### Advanced Options

```typescript
const client = new BookmarkAIClient({
  baseUrl: 'https://api.bookmarkai.com',
  timeout: 30000, // 30 seconds
  retries: 3,
  retryDelay: 1000,
  headers: {
    'X-Custom-Header': 'value'
  },
  onTokenRefresh: (tokens) => {
    // Handle token updates
  }
});
```

## Development

### Regenerating the SDK

```bash
# Fetch latest OpenAPI spec and regenerate
npm run generate

# Build the SDK
npm run build

# Run tests
npm test
```

### Testing

The SDK includes comprehensive test fixtures for use with Mock Service Worker (MSW):

```typescript
import { setupServer } from 'msw/node';
import { handlers } from '@bookmarkai/sdk/test-fixtures';

const server = setupServer(...handlers);
```

## License

MIT