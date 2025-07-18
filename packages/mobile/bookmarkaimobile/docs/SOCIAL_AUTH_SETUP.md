# Social Authentication Setup Guide

## Prerequisites

Before testing social authentication, you need to:

1. **Google Sign-In**:
   - Create OAuth 2.0 credentials in Google Cloud Console
   - Get iOS Client ID and Web Client ID
   - Update the reversed client ID in Info.plist

2. **Apple Sign-In**:
   - Enable Sign in with Apple capability in Apple Developer Portal
   - Ensure your app ID has Sign in with Apple enabled

## Configuration Steps

### 1. Environment Variables

Create a `.env` file in the mobile app directory with:

```bash
# Copy from .env.example
cp .env.example .env

# Add your Google OAuth credentials
GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

### 2. Update Info.plist for Google Sign-In

Replace `YOUR_REVERSED_CLIENT_ID` in `ios/BookmarkAI/Info.plist`:

```xml
<string>com.googleusercontent.apps.YOUR_REVERSED_CLIENT_ID</string>
```

The reversed client ID is your iOS client ID reversed. For example:
- Client ID: `123456789-abcdef.apps.googleusercontent.com`
- Reversed: `com.googleusercontent.apps.123456789-abcdef`

### 3. iOS Configuration

The following has already been configured:
- ✅ Sign in with Apple capability added to entitlements
- ✅ Google Sign-In URL handling in AppDelegate
- ✅ Pod dependencies installed

### 4. Testing

#### Google Sign-In
- Works on both iOS Simulator and device
- Requires valid OAuth credentials
- Test accounts can be added in Google Cloud Console

#### Apple Sign-In
- **Requires real iOS device** (not available in Simulator)
- Requires iOS 13.0 or later
- Must be signed with valid provisioning profile

## Troubleshooting

### Google Sign-In Issues

1. **"DEVELOPER_ERROR" or Configuration Error**
   - Verify iOS client ID matches your bundle identifier
   - Ensure Web client ID is provided for ID token generation
   - Check reversed client ID in Info.plist

2. **Network/Server Errors**
   - Verify backend is running and accessible
   - Check API_BASE_URL configuration

### Apple Sign-In Issues

1. **"Not Supported" Error**
   - Ensure testing on real device (not simulator)
   - Verify iOS 13+ is being used
   - Check entitlements file includes Sign in with Apple

2. **Backend Integration Fails**
   - Verify backend Apple Sign-In configuration
   - Check that identity token is being sent correctly

## Backend Requirements

Ensure your backend has implemented:
- `POST /v1/auth/social/google` endpoint
- `POST /v1/auth/social/apple` endpoint
- Proper token validation for both providers

## Security Notes

- Never commit `.env` files with real credentials
- Use environment-specific OAuth clients for dev/staging/prod
- Implement proper nonce validation for enhanced security
- Consider implementing rate limiting on social auth endpoints