# ADR-215: Social Authentication Implementation

- **Status**: In Progress (Phase 1 & 2 Complete)
- **Date**: 2025-01-18
- **Updated**: 2025-01-18
- **Authors**: @engineering-team
- **Supersedes**: —
- **Superseded by**: —
- **Related**: ADR-002 (JWT Authentication Strategy)

---

## 1 — Context

BookmarkAI currently supports only email/password authentication for user registration and login. This creates friction in the user onboarding process and may deter potential users who prefer social sign-in options. Industry standards show that offering social authentication can significantly improve conversion rates and user retention.

### Current State
- Email/password authentication via JWT tokens
- Supabase auth integration for user management
- SDK handles token refresh and storage
- Mobile apps and web interface support traditional auth flow

### Problems
1. **User Friction**: Manual registration process with email verification
2. **Password Fatigue**: Users must remember another password
3. **Mobile Experience**: Typing email/password on mobile is cumbersome
4. **Market Expectation**: Users expect social sign-in options in modern apps

## 2 — Decision

Implement OAuth2-based social authentication for Google and Apple Sign-In across all platforms (API, mobile, web) while maintaining the existing JWT-based session management.

### 2.1 Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Mobile    │────▶│  API Gateway │────▶│  Supabase   │
│   App       │     │   /v1/auth   │     │    Auth     │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │                     │
       │                    │                     │
       ▼                    ▼                     ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Google    │     │     JWT      │     │  PostgreSQL │
│   OAuth2    │     │   Service    │     │   (users)   │
└─────────────┘     └──────────────┘     └─────────────┘
       │                                          │
       │                                          │
       ▼                                          ▼
┌─────────────┐                          ┌─────────────┐
│    Apple    │                          │   Profile   │
│   Sign-In   │                          │   Service   │
└─────────────┘                          └─────────────┘
```

### 2.2 Authentication Flow

1. **Client Initiation**
   - Mobile/Web app initiates OAuth flow with provider
   - Receives authorization code or ID token

2. **Token Exchange**
   - Client sends provider token to `/v1/auth/social`
   - API validates token with provider
   - Creates or links user account

3. **Session Creation**
   - API generates JWT tokens (access + refresh)
   - Returns tokens and user profile
   - Client stores tokens as usual

### 2.3 API Endpoints

```typescript
// New endpoints
POST /v1/auth/social/google
POST /v1/auth/social/apple

// Request payload
{
  "idToken": string,        // From provider
  "authorizationCode"?: string,  // For Apple
  "nonce"?: string,         // For security
  "deviceInfo"?: {          // Optional tracking
    "platform": string,
    "version": string
  }
}

// Response (same as login)
{
  "accessToken": string,
  "refreshToken": string,
  "expiresIn": number,
  "user": {
    "id": string,
    "email": string,
    "name": string,
    "avatar": string,
    "provider": string
  }
}
```

## 3 — Implementation Details

### 3.1 Backend Implementation (Task 1.2.1) ✅ COMPLETE

**Package Structure**:
```
packages/api-gateway/src/modules/auth/
├── controllers/
│   └── social-auth.controller.ts
├── services/
│   ├── google-auth.service.ts
│   ├── apple-auth.service.ts
│   └── social-auth.service.ts
├── dto/
│   └── social-auth.dto.ts
└── guards/
    └── social-auth.guard.ts
```

**Key Dependencies**:
- `google-auth-library`: Official Google OAuth2 client
- `apple-signin-auth`: Apple Sign-In validation
- Existing Supabase auth integration

**Implementation Steps**:
1. Create social auth DTOs with validation
2. Implement provider-specific services
3. Add controller endpoints with proper error handling
4. Integrate with existing user service
5. Handle account linking scenarios
6. Add rate limiting per provider

### 3.2 Mobile Implementation ✅ COMPLETE

#### Google Sign-In (Task 1.6.1)
**Package**: `@react-native-google-signin/google-signin`

**Key Features**:
- Native UI for better UX
- Automatic token refresh
- Support for multiple accounts
- Silent sign-in capability

**Configuration**:
```javascript
// iOS: Info.plist
CFBundleURLSchemes: com.googleusercontent.apps.YOUR_CLIENT_ID

// Android: google-services.json from Firebase Console
```

#### Apple Sign-In (Task 1.6.2)
**Package**: `@invertase/react-native-apple-authentication`

**Requirements**:
- iOS 13.0+ only
- Sign in with Apple capability
- App Store Connect configuration

**Implementation**:
```javascript
// Shared auth hook
const useSocialAuth = () => {
  const googleSignIn = async () => { /* ... */ };
  const appleSignIn = async () => { /* ... */ };
  return { googleSignIn, appleSignIn };
};
```

### 3.3 SDK Updates ✅ COMPLETE

```typescript
// New methods in auth-api.service.ts
async googleSignIn(params: GoogleSignInRequest): Promise<LoginResponse>
async appleSignIn(params: AppleSignInRequest): Promise<LoginResponse>

// Request interfaces
interface GoogleSignInRequest {
  idToken: string;
  nonce?: string;
  deviceInfo?: DeviceInfoDto;
}

interface AppleSignInRequest {
  idToken: string;
  authorizationCode?: string;
  nonce?: string;
  firstName?: string;
  lastName?: string;
  deviceInfo?: DeviceInfoDto;
}

// Updates to support social profiles
interface User {
  // ... existing fields
  provider?: 'email' | 'google' | 'apple';
  avatar?: string;
  emailVerified?: boolean;
}
```

## 4 — Database Schema

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'email';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Index for provider lookups
CREATE INDEX idx_users_provider_id ON users(provider, provider_id);

-- Track social auth metadata
CREATE TABLE IF NOT EXISTS social_auth_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255),
  avatar_url TEXT,
  raw_data JSONB,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider, provider_user_id)
);
```

## 5 — Security & Compliance

### 5.1 Security Measures
- **Token Validation**: Always verify tokens with provider APIs
- **Nonce Verification**: Prevent replay attacks
- **HTTPS Only**: Enforce secure connections
- **State Parameter**: Prevent CSRF in web flows
- **Account Linking**: Require email verification for linking

### 5.2 Privacy Considerations
- Request minimal scopes (email, profile only)
- Store minimal user data
- Comply with provider policies
- Handle account deletion properly
- Respect user consent choices

### 5.3 Compliance
- **GDPR**: Handle social profile data as PII
- **App Store**: Follow Apple's guidelines for Sign in with Apple
- **Google Play**: Comply with Google Sign-In policies

## 6 — Metrics & SLOs

### 6.1 Performance Targets
- Social auth latency: < 2s (p95)
- Token validation: < 500ms
- Account creation: < 1s
- SDK integration overhead: < 100ms

### 6.2 Monitoring
- Track auth success/failure rates by provider
- Monitor token validation errors
- Alert on provider API failures
- Track conversion rates (social vs email)

## 7 — Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider API downtime | Users cannot sign in | Fallback to email auth, show appropriate messaging |
| Token validation failures | Authentication errors | Implement retry logic, proper error handling |
| Account linking conflicts | Data integrity issues | Email verification for linking, manual resolution flow |
| Rate limiting by providers | Service degradation | Implement caching, respect provider limits |
| Privacy/data breaches | Compliance violations | Minimal data storage, encryption at rest |
| Free Apple Developer account | Cannot test Apple Sign-In | Hide feature in dev, require paid account for production |
| Missing database migrations | Auth failures in production | Include migration checks in deployment scripts |
| OAuth credential mismatch | Authentication errors | Document required env variables, validation on startup |

## 8 — Migration Strategy

### Phase 1: Backend (Week 1) ✅ COMPLETE
1. ✅ Implement social auth endpoints
2. ✅ Add database migrations
3. ✅ Deploy to staging
4. ✅ Test with Postman/SDK

**Completed Tasks:**
- ✅ Phase 1: Backend Social Auth - Create DTOs and validation
- ✅ Phase 1: Backend Social Auth - Implement Google auth service
- ✅ Phase 1: Backend Social Auth - Implement Apple auth service
- ✅ Phase 1: Backend Social Auth - Create controller endpoints
- ✅ Phase 1: Backend Social Auth - Database migrations
- ✅ Phase 1: Backend Social Auth - Environment variables setup
- ✅ Update OpenAPI spec with social auth endpoints
- ✅ Update SDK with social auth methods

**Implementation Notes:**
- Google and Apple auth services use stub implementations for development
- Production requires installing and configuring actual OAuth libraries
- Database migration 0014_add_social_auth.sql adds provider fields to users table
- New endpoints: POST /v1/auth/social/google and POST /v1/auth/social/apple
- SDK methods: `client.auth.googleSignIn()` and `client.auth.appleSignIn()`

### Phase 2: Mobile (Week 2) ✅ COMPLETE
1. ✅ Integrate Google Sign-In
2. ✅ Add Apple Sign-In (iOS)
3. ✅ Update auth UI components
4. ✅ Test on physical devices

**Completed Tasks:**
- ✅ Install native SDK dependencies (@react-native-google-signin/google-signin@15.0.0)
- ✅ Install Apple Authentication (@invertase/react-native-apple-authentication@2.4.1)
- ✅ Configure iOS project (Info.plist, AppDelegate.swift)
- ✅ Create social auth UI components (GoogleSignInButton, AppleSignInButton)
- ✅ Implement useSocialAuth hook for authentication logic
- ✅ Update LoginScreen and RegisterScreen with social buttons
- ✅ Handle authentication state with event-based updates
- ✅ Fix navigation after successful authentication
- ✅ Test Google Sign-In on iPhone 16 (iOS 18.2)

**Implementation Details:**
- Google Sign-In fully functional with ngrok tunnel for development
- Apple Sign-In UI implemented but hidden in dev mode due to free account limitations
- Event-driven auth state management using DeviceEventEmitter
- Automatic navigation to home screen after successful authentication
- Backend logging enhanced to show multi-line format with device info

**Known Limitations:**
1. **Apple Developer Account**: Free accounts cannot use Apple Sign-In capability
   - Workaround: Hide Apple Sign-In button in development mode
   - Production requires paid Apple Developer account ($99/year)
2. **Database Migration**: Initial deployment missing social auth columns
   - Manual migration required: provider, provider_id, avatar_url
   - Future deployments should include migration in deployment script
3. **Backend Configuration**: Google Client ID must match between frontend and backend
   - Ensure GOOGLE_CLIENT_ID in backend .env matches OAuth credentials

### Phase 3: Production (Week 3)
1. Feature flag rollout (5% → 50% → 100%)
2. Monitor metrics and errors
3. Handle edge cases
4. Update documentation

### Phase 4: Enhancement
1. Add account linking UI
2. Implement social profile sync
3. Add more providers (Facebook, GitHub)

## 9 — Future Enhancements

1. **Additional Providers**: Facebook, GitHub, Twitter/X
2. **Account Linking**: UI for connecting multiple social accounts
3. **Social Features**: Import contacts, share to social
4. **Enterprise SSO**: SAML/OIDC for business accounts
5. **Passwordless**: Magic links, WebAuthn support

## References

- [Google Sign-In for iOS](https://developers.google.com/identity/sign-in/ios)
- [Sign in with Apple](https://developer.apple.com/sign-in-with-apple/)
- [React Native Google Sign-In](https://github.com/react-native-google-signin/google-signin)
- [React Native Apple Authentication](https://github.com/invertase/react-native-apple-authentication)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)