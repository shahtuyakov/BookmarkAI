# Task Context: 1.10 - ngrok Local Testing Infrastructure Implementation

## Basic Information
- **Phase**: Phase 1 - Core Platform Development
- **Owner**: AI Development Team
- **Status**: 100% (Implementation Complete)
- **Started**: June 2, 2025
- **Target Completion**: June 2, 2025 (Completed)
- **Dependencies**: ADR-010, API Gateway (task-1.4), JWT Auth Middleware (task-1.2)
- **Dependent Tasks**: iOS Extension Testing (task-1.7), Android Intent Testing (task-1.8), WebExtension Testing (task-1.9)

## Requirements
- ngrok tunnel automation with reserved domain capability
- CORS configuration supporting all ngrok subdomain patterns
- JWT authentication with local RSA key fallback for development
- Upload strategy system with S3 bypass for large files (>10MB)
- Client-side retry logic with exponential backoff for tunnel reliability
- Automatic environment injection for all client applications
- Graceful tunnel shutdown and cleanup mechanisms

## Installed Dependencies
- **Tunneling**: ngrok 4.3.3 (root package.json)
- **Utilities**: chalk 4.1.2 (console styling)
- **AWS SDK**: @aws-sdk/client-s3 3.812.0, @aws-sdk/s3-request-presigner 3.812.0
- **Authentication**: Local RSA key support in existing JWT service
- **CORS**: Built-in NestJS CORS with custom patterns

## Implementation Approach
- Automated ngrok tunnel setup with reserved domain support
- Environment validation and error handling for missing auth tokens
- Automatic URL injection into client configurations (.env.local, manifest.json)
- CORS regex patterns supporting all ngrok subdomain variations
- Local RSA key JWT signing for development without KMS dependency
- Upload strategy pattern with file size-based routing (tunnel vs S3)
- Exponential backoff retry logic for ngrok-specific connection issues
- Graceful shutdown with proper tunnel cleanup and resource management

## Current Implementation Logic Explanation
The ngrok infrastructure operates with five main components:
1. **Setup Script** (`scripts/setup-ngrok.js`): Validates environment, connects tunnel, injects URLs into all client configs
2. **CORS Configuration** (`packages/api-gateway/src/config/cors.ts`): Regex patterns allowing all ngrok subdomains with development/production switching
3. **JWT Service** (`packages/api-gateway/src/modules/auth/services/kms-jwt.service.ts`): Local RSA key fallback when TOKEN_KEY_ID=local
4. **Upload Strategy** (`packages/api-gateway/src/common/services/upload-strategy.service.ts`): File size routing with S3 bypass for >10MB files
5. **Retry Logic** (`packages/api-gateway/src/common/utils/ngrok-retry.util.ts`): Exponential backoff for tunnel-specific errors (502, 504, 503)

Development flow: Run `npm run dev:tunnel` → Script validates NGROK_AUTH_TOKEN → Connects tunnel → Updates .env.local files → Starts local API → Mobile/extension clients use tunnel URL for testing.

## Challenges & Decisions
- **June 2, 2025**: Chose random subdomains over reserved domain for single-developer workflow
- **June 2, 2025**: Implemented local RSA key fallback to eliminate KMS dependency in development
- **June 2, 2025**: Added CORS regex patterns to handle all ngrok subdomain variations
- **June 2, 2025**: Created upload strategy service with S3 bypass for future large file handling
- **June 2, 2025**: Validated tunnel authentication with iOS Share Extension and Android Intent testing

## Important Commands
- `npm run dev:tunnel` - Start ngrok tunnel with automatic environment injection
- `export NGROK_AUTH_TOKEN=your_token` - Set authentication token (one-time setup)
- `curl https://tunnel.ngrok.app/api/health` - Test tunnel connectivity
- `curl https://tunnel.ngrok.app/api/auth/login` - Test authentication through tunnel
- `Ctrl+C` - Gracefully shutdown tunnel with cleanup

## Questions & Notes
- Random ngrok subdomains work perfectly for single developer - no need for paid reserved domains yet
- Local RSA keys eliminate KMS complexity while maintaining production JWT compatibility
- CORS regex patterns handle all ngrok subdomain variations automatically
- Environment injection reduces manual configuration errors across all client applications
- Upload strategy service ready for future large file bypass implementation (>10MB → S3)
- Tunnel stability excellent during extended development sessions
- iOS and Android clients successfully tested login/sharing through tunnel

## Related Resources
- ADR: [ADR-010 ngrok Local Testing Setup](../../architecture/decisions/adr-010-ngrok-local-testing-setup.md)
- Setup Script: [setup-ngrok.js](../../../scripts/setup-ngrok.js)
- CORS Config: [cors.ts](../../../packages/api-gateway/src/config/cors.ts)
- Upload Strategy: [upload-strategy.service.ts](../../../packages/api-gateway/src/common/services/upload-strategy.service.ts)

## Future Improvements
- Reserved domain setup documentation for team scaling (bookmarkai-dev.ngrok.app)
- Upload strategy API endpoints implementation when large file handling needed
- Cloudflare Tunnel migration path for bandwidth optimization
- Tunnel health monitoring and automatic reconnection logic
- Multi-developer subdomain allocation system for team environments