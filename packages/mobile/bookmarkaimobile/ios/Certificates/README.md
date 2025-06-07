# iOS Certificate Pinning Setup

This directory contains SSL certificates for certificate pinning in the BookmarkAI iOS app.

## Required Certificates

1. **bookmarkai-prod.cer** - Primary production certificate
2. **bookmarkai-backup.cer** - Backup certificate (intermediate or renewed cert)

## How to Add Certificates to iOS Bundle

### Step 1: Export Certificates from Server

Run the export script from the mobile app directory:

```bash
cd packages/mobile/bookmarkaimobile
./scripts/export-certificates.sh api.bookmarkai.com
```

This will create the `.cer` files in this directory.

### Step 2: Add to Xcode Project

1. Open the iOS project in Xcode:
   ```bash
   open ios/BookmarkAI.xcworkspace
   ```

2. In Xcode's project navigator (left sidebar):
   - Right-click on the `BookmarkAI` folder
   - Select "Add Files to BookmarkAI..."

3. Navigate to `ios/Certificates/` and select:
   - `bookmarkai-prod.cer`
   - `bookmarkai-backup.cer`

4. In the dialog that appears:
   - ✅ Check "Copy items if needed"
   - ✅ Check "Create folder references"
   - ✅ Ensure "BookmarkAI" target is selected
   - Click "Add"

### Step 3: Verify Bundle Resources

1. Select the BookmarkAI project in navigator
2. Select the BookmarkAI target
3. Go to "Build Phases" tab
4. Expand "Copy Bundle Resources"
5. Verify both `.cer` files are listed

### Step 4: Test Certificate Loading

The `URLSessionNetworkAdapter.swift` will automatically load these certificates:

```swift
if let certPath = Bundle.main.path(forResource: "bookmarkai-prod", ofType: "cer"),
   let certData = try? Data(contentsOf: URL(fileURLWithPath: certPath)) {
    // Certificate loaded successfully
}
```

## Certificate Renewal

When certificates need to be renewed:

1. Export new certificates using the script
2. Replace the old `.cer` files in Xcode
3. Increment the app version
4. Test thoroughly before release

## Security Notes

- Never commit actual production certificates to git
- Add `*.cer` to `.gitignore` in this directory
- Store certificate fingerprints securely
- Rotate certificates before expiration
- Always include a backup certificate

## Testing Certificate Pinning

### Development Mode
Certificate pinning is disabled in debug builds to allow:
- Local development with self-signed certs
- ngrok tunnel testing
- Simulator testing

### Production Mode
To test certificate pinning:

1. Create a release build:
   ```bash
   npx react-native run-ios --configuration Release
   ```

2. Test with correct certificates (should work)
3. Test with incorrect certificates (should fail)

## Troubleshooting

### Certificate Loading Fails
- Verify files are in Copy Bundle Resources
- Check file names match exactly
- Ensure certificates are in DER format

### Network Requests Fail in Production
- Check certificate expiration dates
- Verify certificate chain is complete
- Ensure backup certificate is valid
- Check server certificate hasn't changed

### Debug Certificate Issues
Add logging to `URLSessionNetworkAdapter.swift`:

```swift
#if DEBUG
print("Loading certificate from: \(certPath)")
print("Certificate data size: \(certData.count)")
#endif
```