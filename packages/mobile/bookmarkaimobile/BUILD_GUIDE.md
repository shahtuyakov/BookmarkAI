# BookmarkAI iOS Build Guide

## Prerequisites Completed ✅

1. **npm dependencies installed** with `--legacy-peer-deps`
2. **CocoaPods dependencies installed** (82 dependencies)
3. **iOS build folder cleaned**
4. **Test certificates created** for development

## Building the App

### Option 1: Using React Native CLI (Recommended)

```bash
# Run on iOS Simulator
npx react-native run-ios

# Run on specific simulator
npx react-native run-ios --simulator="iPhone 15 Pro"

# Run on physical device
npx react-native run-ios --device
```

### Option 2: Using Xcode

1. Open the workspace (NOT the project):
   ```bash
   open ios/BookmarkAI.xcworkspace
   ```

2. Select your target device/simulator
3. Press Cmd+R to build and run

## What's New in This Build

### URLSession Native Network Adapter
- **Automatic platform detection**: Uses URLSession on iOS, fetch on Android
- **Certificate pinning**: Enabled in production builds
- **Better performance**: Native networking is faster than JavaScript
- **Request cancellation**: Full support for cancelling requests

### Files Added
- `ios/URLSessionNetworkAdapter.swift` - Native Swift implementation
- `ios/URLSessionNetworkAdapter.m` - Objective-C bridge
- `src/adapters/ios-urlsession.adapter.ts` - TypeScript adapter
- `src/adapters/platform-network.adapter.ts` - Platform selector
- `src/utils/keychain-wrapper.ts` - Keychain compatibility wrapper

## Testing the URLSession Adapter

The app will automatically use the URLSession adapter on iOS. To verify:

1. **Check console logs** during app startup:
   ```
   [SDK] Using platform network adapter: ios-urlsession
   ```

2. **Monitor network requests**:
   - Open Xcode console during runtime
   - Look for `[Certificate Pinning]` logs
   - Network requests will show URLSession activity

3. **Test certificate pinning** (Production only):
   ```bash
   npx react-native run-ios --configuration Release
   ```

## Troubleshooting

### Module Not Found Error
If you see "Native module URLSessionNetworkAdapter not found":
1. Clean build: `cd ios && rm -rf build`
2. Reinstall pods: `pod install`
3. Rebuild the app

### Certificate Pinning Issues
- Certificates are only validated in Release builds
- Debug builds accept all certificates for development
- Add real certificates before App Store submission

### Build Errors
1. Ensure Xcode 15+ is installed
2. iOS deployment target is 15.1
3. Swift version is 5.0

## Environment Variables

Create `.env` file if needed:
```env
API_URL=http://localhost:3001/api/v1
# Or use ngrok URL for device testing
# API_URL=https://your-ngrok-url.ngrok.io/api/v1
```

## Next Steps

1. **For Simulator Testing**: Just run `npx react-native run-ios`
2. **For Device Testing**: 
   - Connect device via USB
   - Trust computer on device
   - Run `npx react-native run-ios --device`
3. **For Production Testing**: Add real SSL certificates (see ios/Certificates/README.md)