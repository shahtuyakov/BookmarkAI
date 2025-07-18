# iOS Build Setup

## Important: Info.plist Management

The `BookmarkAI/Info.plist` file is **gitignored** because it contains the Google Sign-In Client ID that is injected from environment variables.

### First-Time Setup

1. The `Info.plist.template` file is the source template
2. When you run `npm run ios`, it automatically:
   - Copies `Info.plist.template` to `Info.plist` (if missing)
   - Injects the Google Client ID from your `.env` file

### Environment Configuration

Make sure your `.env` file contains:
```bash
GOOGLE_IOS_CLIENT_ID=your-client-id-here
```

### Manual Setup

If needed, you can manually run the setup:
```bash
npm run setup:google-signin
```

### Why This Approach?

- **Security**: Client IDs are not hardcoded in version control
- **Flexibility**: Different environments can use different Client IDs
- **CI/CD**: Build servers can inject their own Client IDs

### Troubleshooting

If you get build errors about missing URL schemes:
1. Check that `GOOGLE_IOS_CLIENT_ID` is set in `.env`
2. Run `npm run setup:google-signin`
3. Clean and rebuild the project