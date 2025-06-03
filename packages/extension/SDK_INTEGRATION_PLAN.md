# WebExtension SDK Integration Plan

## Overview
This document outlines the plan to integrate the @bookmarkai/sdk into the WebExtension, replacing direct API calls with the unified SDK approach as specified in ADR-011.

## Current State Analysis

### What We Have
1. **AuthService**: Direct JWT authentication with browser.storage.local
2. **Service Worker**: All API calls routed through background script
3. **Direct Fetch**: Using fetch() with manual token management
4. **Custom Retry Logic**: Exponential backoff implemented manually
5. **Browser Storage**: Direct usage of browser.storage.local API

### What Needs to Change
1. Replace AuthService with SDK's auth module
2. Create browser-specific adapters for SDK
3. Migrate all API calls to use SDK methods
4. Leverage SDK's built-in retry and error handling
5. Maintain compatibility with existing storage keys

## Implementation Plan

### Phase 1: Create Browser Adapters (Priority: High)

#### 1.1 Browser Storage Adapter
```typescript
// packages/extension/src/adapters/browser-storage.adapter.ts
import { StorageAdapter } from '@bookmarkai/sdk';
import browser from 'webextension-polyfill';

export class BrowserExtensionStorageAdapter implements StorageAdapter {
  async get(key: string): Promise<any> {
    const result = await browser.storage.local.get(key);
    return result[key];
  }
  
  async set(key: string, value: any): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  }
  
  async remove(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  }
  
  async clear(): Promise<void> {
    await browser.storage.local.clear();
  }
}
```

#### 1.2 Browser Network Adapter
```typescript
// packages/extension/src/adapters/browser-network.adapter.ts
import { NetworkAdapter, RequestConfig } from '@bookmarkai/sdk';

export class BrowserExtensionNetworkAdapter implements NetworkAdapter {
  async request<T>(config: RequestConfig): Promise<T> {
    // Use browser's fetch API with extension-specific handling
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: config.body,
      signal: config.signal,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  }
}
```

### Phase 2: SDK Client Setup (Priority: High)

#### 2.1 Initialize SDK Client
```typescript
// packages/extension/src/sdk/client.ts
import { BookmarkAIClient } from '@bookmarkai/sdk';
import { BrowserExtensionStorageAdapter } from '../adapters/browser-storage.adapter';
import { BrowserExtensionNetworkAdapter } from '../adapters/browser-network.adapter';

export function createExtensionClient() {
  return new BookmarkAIClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001',
    environment: import.meta.env.MODE as 'development' | 'production',
    adapters: {
      storage: new BrowserExtensionStorageAdapter(),
      network: new BrowserExtensionNetworkAdapter(),
    },
    // Maintain compatibility with existing storage keys
    storagePrefix: 'bookmarkai_',
  });
}

export const sdkClient = createExtensionClient();
```

### Phase 3: Migrate Authentication (Priority: High)

#### 3.1 Replace AuthService
```typescript
// packages/extension/src/services/auth-sdk.ts
import { sdkClient } from '../sdk/client';

export class AuthSDKService {
  static async login(email: string, password: string) {
    const response = await sdkClient.auth.login({ email, password });
    // SDK handles token storage automatically
    return response;
  }
  
  static async logout() {
    await sdkClient.auth.logout();
  }
  
  static async getCurrentUser() {
    return sdkClient.auth.getCurrentUser();
  }
  
  static async isAuthenticated() {
    return sdkClient.isAuthenticated();
  }
}
```

### Phase 4: Update Service Worker (Priority: High)

#### 4.1 Migrate API Calls
```typescript
// packages/extension/src/background/service-worker.ts
import { sdkClient } from '../sdk/client';

// Replace direct API calls with SDK methods
browser.runtime.onMessage.addListener(async (request, sender) => {
  switch (request.action) {
    case 'CREATE_BOOKMARK':
      try {
        const share = await sdkClient.shares.create({
          url: request.url,
          title: request.title,
        });
        return { success: true, data: share };
      } catch (error) {
        return { success: false, error: error.message };
      }
      
    case 'GET_RECENT_BOOKMARKS':
      try {
        const shares = await sdkClient.shares.list({ limit: 10 });
        return { success: true, data: shares };
      } catch (error) {
        return { success: false, error: error.message };
      }
  }
});
```

### Phase 5: Update UI Components (Priority: Medium)

#### 5.1 Update Popup Component
```typescript
// packages/extension/src/popup/popup.tsx
import { useEffect, useState } from 'react';
import { sdkClient } from '../sdk/client';

function Popup() {
  const [user, setUser] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  
  useEffect(() => {
    async function loadData() {
      const isAuth = await sdkClient.isAuthenticated();
      if (isAuth) {
        const currentUser = await sdkClient.auth.getCurrentUser();
        setUser(currentUser);
        
        const recentShares = await sdkClient.shares.list({ limit: 10 });
        setBookmarks(recentShares.data);
      }
    }
    loadData();
  }, []);
  
  // Rest of component...
}
```

### Phase 6: Migration Steps

1. **Install SDK Package**
   ```bash
   cd packages/extension
   pnpm add @bookmarkai/sdk
   ```

2. **Create Adapters** (Week 1, Day 1)
   - Browser storage adapter
   - Browser network adapter
   - Test adapters in isolation

3. **Set Up SDK Client** (Week 1, Day 2)
   - Initialize client with adapters
   - Configure for extension environment
   - Test basic SDK operations

4. **Migrate Authentication** (Week 1, Day 3)
   - Replace AuthService gradually
   - Maintain backward compatibility
   - Test login/logout flows

5. **Update Service Worker** (Week 1, Day 4)
   - Replace API calls one by one
   - Test each endpoint migration
   - Ensure message passing works

6. **Update UI Components** (Week 1, Day 5)
   - Update popup components
   - Update content script
   - Test end-to-end flows

### Phase 7: Testing Strategy

1. **Unit Tests**
   - Test adapters with mock browser APIs
   - Test SDK client initialization
   - Test auth migration

2. **Integration Tests**
   - Test SDK with real browser APIs
   - Test message passing with SDK
   - Test storage compatibility

3. **E2E Tests**
   - Test complete user flows
   - Test error scenarios
   - Test offline behavior

### Phase 8: Rollback Strategy

1. Keep existing AuthService as fallback
2. Feature flag for SDK vs direct API calls
3. Gradual rollout with monitoring
4. Quick revert capability

## Success Criteria

1. ✅ All API calls use SDK instead of direct fetch
2. ✅ Authentication works seamlessly with SDK
3. ✅ Existing storage keys remain compatible
4. ✅ Performance remains same or better
5. ✅ Error handling is improved
6. ✅ All existing features continue to work

## Timeline

- **Week 1**: Complete implementation
- **Week 2**: Testing and bug fixes
- **Week 3**: Performance optimization and monitoring

## Risks and Mitigations

1. **Risk**: Breaking existing user sessions
   - **Mitigation**: Maintain storage key compatibility

2. **Risk**: Performance degradation
   - **Mitigation**: Profile and optimize SDK usage

3. **Risk**: Extension size increase
   - **Mitigation**: Tree-shake unused SDK features

4. **Risk**: Browser API incompatibilities
   - **Mitigation**: Thorough testing across browsers