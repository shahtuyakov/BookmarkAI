# Environment Configuration Setup for iOS

## Overview
This guide explains how to configure environment-specific settings (like API URLs) for different build configurations in Xcode.

## Setup Instructions

### 1. Open Xcode Project
Open `BookmarkAI.xcworkspace` in Xcode.

### 2. Add Configuration Files to Project

1. In Xcode, right-click on the `BookmarkAI` folder in the navigator
2. Select "Add Files to BookmarkAI..."
3. Select both:
   - `BookmarkAI.xcconfig`
   - `BookmarkAIShare.xcconfig`
4. Make sure "Add to targets" is unchecked
5. Click "Add"

### 3. Link Configuration Files to Build Configurations

1. Select the project (top-level `BookmarkAI` in navigator)
2. Select the `BookmarkAI` project (not target) in the editor
3. Go to the "Info" tab
4. Under "Configurations", you'll see Debug and Release
5. For each configuration:
   - Click the arrow to expand
   - For `BookmarkAI` target, set "Based on Configuration File" to `BookmarkAI`
   - For `BookmarkAIShare` target, set "Based on Configuration File" to `BookmarkAIShare`

### 4. Add Build Settings (Alternative Method)

If the xcconfig files don't work, you can add the settings manually:

1. Select the `BookmarkAI` target
2. Go to "Build Settings" tab
3. Click the "+" button at the bottom
4. Select "Add User-Defined Setting"
5. Name it `API_BASE_URL`
6. Set values:
   - Debug: `https://bookmarkai-dev.ngrok.io`
   - Release: `https://api.bookmarkai.com`
7. Repeat for `BookmarkAIShare` target

### 5. Verify Configuration

1. Build and run in Debug mode
2. Check that the app uses the development URL
3. Create an Archive (Product → Archive)
4. Check that the archive uses the production URL

## How It Works

1. **Info.plist** contains `$(API_BASE_URL)` which is replaced at build time
2. **Build configurations** define different values for Debug vs Release
3. **ShareViewController** reads the value using:
   ```swift
   Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL")
   ```
4. **React Native** uses `__DEV__` to automatically switch between environments

## Testing

### Debug Build (Development)
```bash
# Run on simulator
pnpm -w run mobile:ios

# The app will use: https://bookmarkai-dev.ngrok.io
```

### Release Build (Production)
```bash
# Create a release build
cd ios && xcodebuild -workspace BookmarkAI.xcworkspace -scheme BookmarkAI -configuration Release

# The app will use: https://api.bookmarkai.com
```

## Troubleshooting

1. **URL not changing**: Clean build folder (Cmd+Shift+K) and rebuild
2. **Build errors**: Make sure xcconfig files are added to project but NOT to any target
3. **Share extension using wrong URL**: Ensure BookmarkAIShare.xcconfig includes BookmarkAI.xcconfig