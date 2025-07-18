# Google Sign-In Setup for BookmarkAI Mobile

This document explains how the Google Sign-In URL scheme is configured for the iOS app.

## Environment-Based Configuration

Instead of hardcoding the Google Client ID in `Info.plist`, we use an environment-based approach:

### 1. Environment Variables

Add your Google Client ID to the `.env` file:

```bash
# packages/mobile/bookmarkaimobile/.env
GOOGLE_IOS_CLIENT_ID=your-client-id-here
```

The value can be in any of these formats:
- Just the client ID: `369367919034-ipf3ukfbihvmc2uak7cu9rhlo178r46c`
- Full OAuth format: `369367919034-ipf3ukfbihvmc2uak7cu9rhlo178r46c.apps.googleusercontent.com`
- Full URL scheme: `com.googleusercontent.apps.369367919034-ipf3ukfbihvmc2uak7cu9rhlo178r46c`

### 2. Automatic Setup

The Google Sign-In URL scheme is automatically configured when you run:

```bash
# This runs the setup script before building
npm run ios

# Or run the setup manually
npm run setup:google-signin
```

### 3. How It Works

1. The `scripts/setup-google-signin.js` script reads the `GOOGLE_IOS_CLIENT_ID` from `.env`
2. It formats it correctly as a URL scheme: `com.googleusercontent.apps.YOUR_CLIENT_ID`
3. It updates the `Info.plist` file using Apple's PlistBuddy tool

### 4. Benefits

- **Security**: Client ID is not hardcoded in version control
- **Flexibility**: Different environments can use different Client IDs
- **Automation**: No manual Info.plist editing required

### 5. Troubleshooting

If Google Sign-In is not working:

1. Check that `GOOGLE_IOS_CLIENT_ID` is set in `.env`
2. Run `npm run setup:google-signin` to verify the setup
3. Clean and rebuild the iOS app:
   ```bash
   cd ios && rm -rf build && cd ..
   npm run ios
   ```

### 6. For CI/CD

In your CI/CD pipeline, ensure:
1. The `GOOGLE_IOS_CLIENT_ID` environment variable is set
2. Run `npm run setup:google-signin` before building the iOS app