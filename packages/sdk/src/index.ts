// BookmarkAI SDK Core Exports

// Client
export { BookmarkAIClient } from './client';
export type { BookmarkAIClientConfig, BookmarkAIError } from './client';

// Configuration
export * from './config';

// Adapters
export * from './adapters/types';
export * from './adapters/fetch.adapter';
export * from './adapters/storage/memory.storage';
export * from './adapters/storage/browser.storage';
export * from './adapters/storage/secure.storage';

// Services
export * from './services/auth.service';

// Utilities
export * from './utils/singleflight';
export * from './utils/rate-limiter';
export * from './utils/retry';
export * from './utils/batch';

// Interceptors
export * from './interceptors/types';
export * from './interceptors/auth.interceptor';
export * from './interceptors/tracing.interceptor';

// Re-export generated types when available
// export * from './generated';