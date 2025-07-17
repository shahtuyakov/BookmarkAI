// SDK exports - using custom client with adapters instead of generated axios-based code
export { BookmarkAIClient, BookmarkAIClient as default } from './client';
export type { BookmarkAIClientConfig, BookmarkAIError } from './client';

// Export adapters for custom implementations
export { NetworkAdapter, StorageAdapter, RequestConfig, Response } from './adapters/types';
export { ReactNativeNetworkAdapter } from './adapters/react-native.adapter';
export { FetchAdapter } from './adapters/fetch.adapter';
export { ReactNativeStorageAdapter } from './adapters/storage/react-native.storage';

// Export services
export { SharesService } from './services/shares.service';
export type { Share, CreateShareRequest, ShareListResponse } from './services/shares.service';
export { AuthService } from './services/auth.service';
export type { TokenPair } from './services/auth.service';

// Export only the types from generated code (not the axios-based implementations)
export type { ShareDto, CreateShareDto, LoginDto, RegisterDto } from './generated';

