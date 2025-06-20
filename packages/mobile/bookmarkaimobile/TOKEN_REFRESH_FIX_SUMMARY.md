# Token Refresh Fix - Summary of Changes

## Problem
The app was making API calls with expired tokens, causing "Token has expired" errors in the backend logs.

## Real Root Causes (Found During Investigation)

### 1. SDK Dev Mode Polling (Primary Cause)
The BookmarkAI SDK's `enableDevMode` was polling `/.well-known/dev-config.json` every 5 seconds to check for API URL changes. This polling:
- Used `networkAdapter.request` directly, bypassing all authentication interceptors
- Continued indefinitely, even with expired tokens
- Was the main source of repeated 401 errors in backend logs

### 2. Token Storage Mismatch
The token validation utilities were checking AsyncStorage, but the app stores tokens in iOS Keychain. This caused all token validation checks to return false, making the app think tokens were always expired.

### 3. Hardcoded Token Expiry Times
Multiple places in the code had hardcoded 15-minute token expiry, but the backend was configured for 3 minutes. This mismatch caused the SDK to think tokens were still valid when they had already expired.

### 4. Missing Token Validation in Query Hooks
Several React Query hooks were making API calls without checking token validity first:
- `useSharesList` and `useInfiniteSharesList` (fixed early)
- `useShare` and `useShareById` (found later - caused errors when opening specific shares)
- `useProcessShare` (also missing validation)

## Solution Implemented

### 1. Disabled SDK Dev Mode Polling
**File**: `src/contexts/SDKContext.tsx`
- Commented out `bookmarkClient.enableDevMode()` to stop unauthorized polling
- Added TODO to fix SDK polling to check auth before requests

### 2. Fixed Token Utility Functions
**File**: `src/utils/token-utils.ts`
- Fixed to use `getAccessToken()` from Keychain instead of AsyncStorage
- `isTokenValid()` - Check if token is valid by decoding JWT
- `getTokenExpiryInfo()` - Get detailed token expiry information
- `checkLocalTokenExpiry()` - Check token expiry from local storage

### 3. Fixed Token Expiry Time Mismatch
**Files**: `src/contexts/SDKContext.tsx`, `src/services/api/client.ts`
- Changed hardcoded 15-minute expiry to 3 minutes to match backend
- Updated SDK token sync to use actual JWT expiry time instead of hardcoded values
- Now properly decodes JWT to get real expiration time

### 4. Updated All Query Hooks
**File**: `src/hooks/useShares.ts`
- Added token validation to ALL hooks that make API calls:
  - `useSharesList` - Check token before listing shares
  - `useInfiniteSharesList` - Check token before infinite scroll
  - `useShare` - Check token before fetching single share
  - `useShareById` - Check token before fetching by ID
  - `useProcessShare` - Check token before processing
  - `useQueuedShares` - Check token before getting queue stats
- Added `retry: false` to prevent retrying on 401 errors
- Returns empty data or throws error when token is expired

### 5. Updated Sync Service
**File**: `src/services/SyncService.ts`
- Modified `processQueue` to check token validity locally using `isTokenValid()`
- Prevents queue processing when tokens are expired

### 6. Fixed AuthContext Token Check
**File**: `src/contexts/AuthContext.tsx`
- Fixed token expiry check to use JWT decoding with `isTokenValid()` instead of timestamp comparison

### 7. Updated Enhanced Token Sync
**File**: `src/services/enhanced-token-sync.ts`
- Modified periodic sync to check token expiry using `isTokenValid()` before attempting sync

### 8. Added Debug Tools
**File**: `src/components/TokenDebugOverlay.tsx`
- Visual overlay showing token status in real-time (dev only)
- Shows expiry countdown and token validation status

### 9. Added Comprehensive Logging
**Files**: `src/services/api/client.ts`, `src/contexts/SDKContext.tsx`
- Added request/response interceptors with detailed logging
- Logs all API calls with [API] prefix for axios requests
- Logs all SDK calls with [SDK] prefix
- Helps identify which component is making unauthorized requests

### 10. Integrated Debug Overlay
**File**: `src/App.tsx`
- Added TokenDebugOverlay to show token status during development

## How It Works Now

1. **SDK Dev Mode Disabled**: No more unauthorized polling every 5 seconds
2. **Before Making API Calls**: Every hook checks if the token is expired locally by decoding the JWT
3. **If Token Is Valid**: Proceed with the API call
4. **If Token Is Expired**: Skip the API call and return empty data or throw error
5. **Token Storage**: Properly reads from iOS Keychain instead of AsyncStorage
6. **Token Expiry**: Uses actual JWT expiry time instead of hardcoded values
7. **No Retries**: Disabled automatic retries on 401 errors to prevent multiple failed attempts

## Testing

To verify the fix works:

1. Add the debug overlay to see token status:
   ```typescript
   {__DEV__ && <TokenDebugOverlay />}
   ```

2. Log in and watch the token countdown
3. After 15 minutes, the token will expire
4. Background polling will stop making API calls
5. No more "Token has expired" errors in backend logs
6. When user interacts with the app, token will refresh automatically

## Key Insights from Investigation

1. **The initial hypothesis was wrong**: The problem wasn't just `useQueuedShares` polling - it was much broader
2. **SDK Dev Mode was the main culprit**: A feature meant for development was causing most of the errors
3. **Token storage location mismatch**: A simple AsyncStorage vs Keychain issue broke all token validation
4. **Hardcoded values are dangerous**: Having token expiry times hardcoded in multiple places caused sync issues
5. **Incomplete implementation**: Not all API hooks had token validation, causing errors in specific flows

## Remaining Issues

1. **SDK Token Caching**: The SDK appears to cache old tokens even after new tokens are synced. When opening specific shares, the SDK may use a stale token despite our validation showing the token is valid. This suggests the SDK's auth interceptor might be caching tokens or there's a timing issue with token updates.
2. **SDK Token Refresh**: The SDK's internal auth service still needs better token refresh handling
3. **Error Handling in UI**: The app needs to gracefully handle token expiry errors in the UI
4. **SDK Dev Mode**: Need to fix the SDK to check auth before polling config endpoint
5. **SDK Default Token Expiry**: The SDK's auth service still has a hardcoded 15-minute default expiry (should use actual token expiry)

## Recommended Next Steps

1. **Fix SDK Token Caching**: Investigate why SDK uses stale tokens even after sync. Possible solutions:
   - Add a delay after token sync before making requests
   - Force SDK to clear token cache on sync
   - Ensure SDK's auth interceptor always gets fresh tokens
2. **Fix SDK Dev Mode**: Modify the SDK's `enableDevMode` to check token validity before polling
3. **Fix SDK Hardcoded Expiry**: Update SDK's auth service to remove 15-minute default
4. **Implement Proactive Token Refresh**: Refresh tokens when they have less than 1 minute remaining
5. **Add Global Error Handler**: Handle token expiry errors globally and trigger re-authentication
6. **Consider Token Expiry Events**: Emit events when tokens expire to pause all queries
7. **Remove Hardcoded Values**: Get token expiry from auth response instead of hardcoding

## Workaround for SDK Token Caching

Until the SDK is fixed, the app now:
- Logs when it gets a 401 despite having a valid token (indicates SDK stale token)
- Returns a user-friendly error message instead of retrying
- Users can pull-to-refresh or navigate away and back to retry with fresh tokens

## Root Architecture Problem (Discovered During Deep Analysis)

The fundamental issue is that **the app has two parallel authentication systems competing with each other**:

1. **App's Auth System** (in `client.ts`):
   - Stores tokens in iOS Keychain
   - Has its own axios interceptors
   - Implements its own token refresh logic
   - Manages its own token expiry

2. **SDK's Auth System**:
   - Also stores tokens (via ReactNativeStorageAdapter which uses Keychain)
   - Has its own interceptors
   - Has its own automatic token refresh
   - Has proactive refresh with configurable margin

This creates:
- **Double Storage**: Both systems store tokens in Keychain
- **Double Interceptors**: Both add auth headers independently
- **Race Conditions**: Both try to refresh tokens simultaneously
- **Sync Issues**: Tokens updated in one system aren't immediately reflected in the other
- **Maintenance Nightmare**: Any auth change needs to be made in two places

## The Real Solution: SDK as Single Source of Truth

### Implementation Plan

#### Phase 1: Fix Immediate SDK Issues
**Goal**: Stop the bleeding - fix polling and token expiry

1. ✅ **Disable Dev Mode** (Already done)
   - Commented out `bookmarkClient.enableDevMode()`

2. **Fix SDK Token Expiry Reading**
   - SDK should decode JWT to get actual expiry from `exp` claim
   - Remove hardcoded 15-minute default

3. **Fix Dev Mode Polling** (SDK change)
   - Make config polling respect auth state
   - Skip polling if no valid token

#### Phase 2: Create SDK-Based API Service
**Goal**: Create thin wrapper around SDK to replace axios gradually

```typescript
// services/api/sdk-client.ts
export const sdkAPI = {
  shares: {
    list: () => bookmarkClient.shares.list(),
    get: (id: string) => bookmarkClient.shares.get(id),
    create: (data: any) => bookmarkClient.shares.create(data),
  },
  auth: {
    login: (credentials) => bookmarkClient.auth.login(credentials),
    logout: () => bookmarkClient.auth.logout(),
    getProfile: () => bookmarkClient.auth.getProfile(),
  }
};
```

#### Phase 3: Migrate All API Calls
**Goal**: Replace axios with SDK calls incrementally

1. Start with auth APIs (most critical)
2. Then shares/bookmarks APIs  
3. Finally, remaining endpoints

For each migration:
- Find axios call
- Replace with SDK call
- Remove token validation checks
- Test the flow

#### Phase 4: Simplify AuthContext
**Goal**: Remove all token management from AuthContext

AuthContext should only:
- Store user profile state
- Call SDK auth methods
- Listen to SDK auth events
- NO token storage/validation/refresh

#### Phase 5: Clean Up Duplicate Code
**Goal**: Remove all parallel auth infrastructure

Delete:
- `client.ts` (entire axios setup)
- `token-utils.ts` (token validation)
- `enhanced-token-sync.ts` (token syncing)
- Android token sync code
- All manual token checks in hooks

#### Phase 6: Comprehensive Testing
**Goal**: Ensure everything works correctly

Test scenarios:
- Login flow
- Token refresh (wait 13+ minutes)
- Logout
- App restart with valid session
- App restart with expired session
- Network errors
- Concurrent requests

### Benefits of This Approach

1. **Single Source of Truth**: Only SDK manages auth
2. **No Synchronization**: No token sync needed between systems
3. **Automatic Token Refresh**: SDK's proactive refresh with margin
4. **Less Code**: Remove ~500+ lines of duplicate auth code
5. **Future Proof**: SDK improvements automatically benefit the app
6. **Maintainable**: One auth system instead of two

### Key Insights

1. **Backend Truth**: The backend actually uses 15-minute tokens (not 3 minutes as initially thought), so the SDK default is correct
2. **Duplicate Systems**: Having two auth systems is the root cause of all sync issues
3. **SDK Completeness**: The SDK already has everything needed - the app just needs to use it
4. **Incremental Migration**: Can be done safely without breaking existing functionality

### Risks & Mitigations

1. **Risk**: SDK might not support all current API endpoints
   - **Mitigation**: Audit all API calls first, add missing ones to SDK

2. **Risk**: SDK auth might behave differently  
   - **Mitigation**: Thorough testing of each auth scenario

3. **Risk**: Performance differences
   - **Mitigation**: SDK uses same storage, should be similar or better

### Timeline Estimate

- Phase 1: 1-2 hours (SDK fixes)
- Phase 2: 2-3 hours (API wrapper)
- Phase 3: 4-6 hours (migration)
- Phase 4: 2-3 hours (simplify AuthContext)
- Phase 5: 1-2 hours (cleanup)
- Phase 6: 2-3 hours (testing)

**Total**: 2-3 days for complete migration

## Implementation Progress (Updated)

### Completed:
1. ✅ **Phase 1: SDK Fixes**
   - Fixed JWT token expiry to use actual `exp` claim from token
   - Added `skipAuth` option to prevent unauthorized polling
   - Disabled dev mode polling temporarily

2. ✅ **Phase 2: SDK Wrapper Created**
   - Created `sdk-client.ts` to wrap SDK for gradual migration
   - Maps SDK responses to match existing app format

3. ✅ **Phase 3: Auth Migration Started**
   - Updated AuthContext with `USE_SDK_AUTH = true` flag
   - Migrated all auth methods to use SDK wrapper
   - Added debug utilities to troubleshoot token storage

### Current Blocker:

**iOS Keychain Entitlements Issue**
- **Problem**: SDK cannot store tokens in iOS Keychain due to missing entitlements
- **Error**: "Internal error when a required entitlement isn't present"
- **Root Cause**: SDK uses `setInternetCredentials` which requires special iOS entitlements that are not configured in the app
- **Impact**: Tokens are not being stored, causing authentication to fail

**Attempted Solutions**:
1. Modified keychain wrapper to handle entitlement errors gracefully ✅
2. Updated SDK storage adapter to fall back to MMKV when Keychain fails ✅
3. Added fallback logic to read from MMKV if Keychain read fails ✅

**Current Status**: 
- Login request succeeds (tokens returned from server)
- SDK receives tokens with correct `expiresIn: 900`
- SDK attempts to store tokens but fails due to Keychain entitlements
- Fallback to MMKV is implemented but tokens still not accessible
- User cannot proceed past login screen

### Next Steps to Resolve Blocker:

1. **Option A: Fix iOS Entitlements** (Recommended for production)
   - Add Keychain Access Groups entitlement to iOS app
   - Configure proper bundle identifier and access groups
   - Update provisioning profiles

2. **Option B: Use Different Storage Method** (Quick fix)
   - Temporarily disable secure storage for tokens in SDK
   - Store all tokens in MMKV until entitlements are fixed
   - Add TODO to re-enable secure storage later

3. **Option C: Use SDK Without Token Persistence** (Not recommended)
   - Pass tokens directly to SDK for each request
   - Defeats purpose of SDK being single source of truth

### Technical Details of Current Issue:

```
// What's happening:
1. SDK login() -> Returns tokens successfully
2. SDK setTokens() -> Tries to store in Keychain
3. Keychain.setInternetCredentials() -> Fails with entitlement error
4. Fallback to MMKV -> Code is in place but tokens still not retrievable
5. SDK getAccessToken() -> Returns null
6. Profile fetch fails with 401
```

The core issue is that while we've added fallback logic, the SDK's token retrieval might be happening before the fallback storage completes, or there's an issue with how MMKV is being used as the fallback.