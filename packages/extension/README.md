# BookmarkAI Web Clip Extension

A Manifest V3 browser extension that provides one-click bookmarking for any website, integrating seamlessly with the BookmarkAI ecosystem.

## Features

- **One-click bookmarking** with floating star button (FAB)
- **Universal compatibility** - works on all websites
- **PKCE OAuth authentication** integration with BookmarkAI
- **React-based popup** interface with Chakra UI
- **Context menu** support for right-click bookmarking
- **Cross-browser support** (Chrome, Firefox, Edge, Safari planned)

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- BookmarkAI backend running locally (for API integration)

### Installation

From the project root:

```bash
pnpm install
```

### Development

1. **Environment Configuration**:
   This extension uses environment variables to manage API endpoints, OAuth credentials, and other configurable settings. Configuration is loaded based on the Vite mode (`development` or `production`).

   1. **Create Environment Files**:
      * For local development, create a file named `.env.development` in the `packages/extension` directory.
      * For production builds, create a file named `.env.production` in the `packages/extension` directory.

   2. **Populate Environment Variables**:
      You can use `packages/extension/dotenv.example` (or create one based on the structure below) as a template for the required variables.

      **Required Variables:**
      * `VITE_OAUTH_AUTH_URL`: URL for your OAuth provider's authorization endpoint.
      * `VITE_OAUTH_TOKEN_URL`: URL for your OAuth provider's token endpoint.
      * `VITE_OAUTH_USERINFO_URL`: URL for your OAuth provider's userinfo endpoint.
      * `VITE_OAUTH_CLIENT_ID`: The OAuth client ID registered for this extension.
      * `VITE_API_BASE_URL`: The base URL for the BookmarkAI API (e.g., for `/shares`).
      * `VITE_WEB_APP_URL`: The URL for your main BookmarkAI web application (for timeline links).

      **Example for `.env.development`:**
      ```env
      VITE_OAUTH_AUTH_URL=http://localhost:3000/oauth/authorize
      VITE_OAUTH_TOKEN_URL=http://localhost:3000/oauth/token
      VITE_OAUTH_USERINFO_URL=http://localhost:3000/oauth/userinfo
      VITE_OAUTH_CLIENT_ID=your-dev-client-id
      VITE_API_BASE_URL=http://localhost:3001/api/v1
      VITE_WEB_APP_URL=http://localhost:8080
      ```

      **Example for `.env.production`:**
      ```env
      VITE_OAUTH_AUTH_URL=https://api.bookmarkai.com/oauth/authorize
      VITE_OAUTH_TOKEN_URL=https://api.bookmarkai.com/oauth/token
      VITE_OAUTH_USERINFO_URL=https://api.bookmarkai.com/oauth/userinfo
      VITE_OAUTH_CLIENT_ID=your-production-client-id
      VITE_API_BASE_URL=https://api.bookmarkai.com/api/v1
      VITE_WEB_APP_URL=https://app.bookmarkai.com
      ```

   3. **Git Ignore**:
      Ensure that your `.env.development` and `.env.production` files (and any other `.env.*` files containing secrets) are listed in `packages/extension/.gitignore` to prevent them from being committed to the repository. The `.gitignore` in this package should already be configured for this.

2. **Run Development Server**:
   ```bash
   pnpm dev
   ```
   This will start the Vite development server. Load the extension as an unpacked extension from the `packages/extension/dist` directory in your browser.

### Building

Build for production:

```bash
pnpm build
```

This command compiles TypeScript, builds the extension using Vite, and places the output in the `packages/extension/dist` directory.

### Testing

Run unit tests:

```bash
pnpm test
```

Run tests with UI:

```bash
pnpm test --ui
```

### Packaging

Create extension packages for distribution:

```bash
pnpm package
```

This script (defined in `package.json`) typically uses `web-ext` to package the `dist` directory into a distributable ZIP file for browser stores.

## Extension Architecture

```
packages/extension/
├── src/
│   ├── manifest.json          # Manifest V3 configuration
│   ├── popup/
│   │   ├── popup.html         # Popup interface entry point
│   │   └── popup.tsx          # React popup component
│   ├── content/
│   │   └── content.ts         # Content script for FAB injection
│   ├── background/
│   │   └── service-worker.ts  # Service worker for API communication
│   ├── auth/
│   │   ├── callback.html      # OAuth callback page
│   │   └── callback.ts        # OAuth callback handler
│   └── test/
│       └── setup.ts           # Test environment setup
├── scripts/
│   └── copy-manifest.js       # Build script for manifest
├── package.json               # Extension dependencies & scripts
├── tsconfig.json              # TypeScript configuration
├── vite.config.ts             # Vite build configuration
├── vitest.config.ts           # Testing configuration
├── .eslintrc.js               # ESLint rules
├── .gitignore                 # Git ignore rules
└── README.md                  # Comprehensive documentation
```

## Browser Loading Instructions

### Chrome/Edge (Development)

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `packages/extension/dist` directory

### Firefox (Development)

1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select any file in `packages/extension/dist` directory

## Current Status

**Phase 1: Foundation & Architecture** ✅ **COMPLETED**

- [x] Project structure setup
- [x] Vite build configuration
- [x] TypeScript configuration
- [x] Manifest V3 setup
- [x] Development environment
- [x] Testing framework setup

**Phase 2: Authentication System** ✅ **COMPLETED**

- [x] PKCE OAuth flow implementation
- [x] Secure token storage with chrome.storage.local
- [x] Authentication state management
- [x] OAuth callback handling
- [x] Token refresh mechanism
- [x] Service worker auth integration
- [x] Unit tests for auth components

**Next Phases:**

- **Phase 3**: Core Content Script (FAB injection)
- **Phase 4**: Service Worker Background (API integration)
- **Phase 5**: Popup UI (React interface)
- **Phase 6**: Build & Deployment Pipeline

## Contributing

This extension follows the BookmarkAI coding standards:

- TypeScript strict mode
- ESLint + Prettier formatting
- React functional components
- Chakra UI design system
- Comprehensive testing

## Related Documentation

- [ADR-009: WebExtension Capture Channel](../../docs/architecture/decisions/adr-009-webExtension-capture-channel.md)
- [BookmarkAI API Gateway](../api-gateway/README.md)
- [Shared Components](../shared/README.md)
