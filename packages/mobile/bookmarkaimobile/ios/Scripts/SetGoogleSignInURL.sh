#!/bin/bash

# Script to set Google Sign-In URL scheme from environment variable
# This runs as a build phase script in Xcode

# Get the Google iOS Client ID from environment
GOOGLE_IOS_CLIENT_ID="${GOOGLE_IOS_CLIENT_ID}"

# Check if the environment variable is set
if [ -z "$GOOGLE_IOS_CLIENT_ID" ]; then
    echo "warning: GOOGLE_IOS_CLIENT_ID environment variable is not set. Google Sign-In may not work properly."
    exit 0
fi

# Path to Info.plist
INFO_PLIST="${TARGET_BUILD_DIR}/${INFOPLIST_PATH}"

# Check if Info.plist exists
if [ ! -f "$INFO_PLIST" ]; then
    echo "error: Info.plist not found at $INFO_PLIST"
    exit 1
fi

# Replace the Google Sign-In URL scheme placeholder with actual value
# We'll use a placeholder in Info.plist and replace it during build
/usr/libexec/PlistBuddy -c "Set :CFBundleURLTypes:1:CFBundleURLSchemes:0 com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID}" "$INFO_PLIST"

echo "Google Sign-In URL scheme set to: com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID}"