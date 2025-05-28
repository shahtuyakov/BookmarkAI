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

Start the development server with hot reload:

```bash
pnpm dev:webext
```

This will:
- Build the extension in development mode
- Enable hot module replacement for popup components
- Watch for changes in content scripts and service worker

### Building

Build for production:

```bash
pnpm build:webext
```

Creates optimized extension in `dist/` directory.

### Testing

Run unit tests:

```bash
pnpm test:webext
```

Run tests with UI:

```bash
pnpm test:webext --ui
```

### Packaging

Create extension packages for distribution:

```bash
# Generic package
pnpm package

# Browser-specific packages
pnpm package:chrome
pnpm package:firefox
```

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
