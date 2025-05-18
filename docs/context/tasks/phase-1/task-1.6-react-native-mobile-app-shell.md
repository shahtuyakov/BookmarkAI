# Task Context: Task 1.6 - React Native Mobile App Shell

## Basic Information
- **Phase**: 1 - Client-Side Experience
- **Owner**: @shokhzodjon-tuyokov, @bookmarkai-mobile
- **Status**: 100% Complete
- **Started**: 2025-05-17
- **Target Completion**: 2025-05-21
- **Dependencies**: Task 1.2 (JWT Auth service)
- **Dependent Tasks**: Task 1.7 (iOS Share Extension), Task 1.8 (Android Intent Filter)

## Requirements
- Create bare React Native TypeScript project for mobile app shell
- Implement authentication flows integrated with JWT service (Task 1.2)
- Build navigation infrastructure for current and future screens
- Ensure architecture supports future share extension integration
- Implement secure storage for auth tokens
- Create placeholder screens for Home, Search, and Profile
- Add ability to view, add, and manage bookmarks
- Support both light and dark themes
- Implement offline support for content viewing and operation queuing

## Implementation Approach
- Used bare React Native 0.77 with TypeScript
- Implemented React Navigation v6 with nested navigation structure
- Used React Context + custom hooks for auth/session management
- Integrated React Query with AsyncStorage persistence for offline support
- Implemented secure token storage with react-native-keychain
- Added biometric authentication with react-native-biometrics
- Used React Native Paper for Material Design UI components
- Added ability to create and queue shares when offline
- Implemented token refresh and error handling in Axios interceptors

## Current Implementation logic explanation
- Authentication managed through AuthContext with secure token storage
- Navigation structure consists of three layers:
  1. Root navigation (Auth/Main switching based on authentication state)
  2. Main tabs (Home, Search, Profile)
  3. Content stacks (nested navigation for details screens)
- API requests utilize interceptors for auth tokens and handle refresh logic
- All data fetching uses React Query for caching and offline support
- Interface is built with Material Design components for consistent UX
- Biometric authentication is conditionally offered based on device capabilities
- Core screens (Login, Register, Home, Detail, Profile) are fully implemented
- Search screen is a placeholder for future implementation

## Challenges & Decisions
- 2025-05-17: Decided on bare React Native over Expo to avoid ejection when implementing share extensions
- 2025-05-18: Implemented biometric authentication with secure enclave/keystore integration
- 2025-05-19: Added offline mode with optimistic UI updates and background synchronization
- 2025-05-20: Resolved issues with token refresh cycle by implementing proper queuing of failed requests
- 2025-05-21: Enhanced error handling with specific error codes and user-friendly messages

## Important commands
- `cd packages/mobile/bookmarkaimobile && npm install` - Install dependencies
- `cd packages/mobile/bookmarkaimobile/ios && pod install` - Install iOS dependencies after installing the new dependencies
- `cd packages/mobile/bookmarkaimobile && npx react-native run-ios` - Run iOS app
- `cd packages/mobile/bookmarkaimobile && npx react-native run-android` - Run Android app
- `cd packages/api-gateway && npm run start:dev` - Run API server for development

## Questions & Notes
- We should add automated tests before proceeding to the share extensions
- We need to finalize the deep linking scheme for integration with share extensions
- Consider adding Sentry or similar for error tracking in production
- Biometric authentication might need additional permission handling on Android 13+

## Related Resources
- PR: Not yet created, pending review
- Documentation: [./docs/architecture/decisions/adr-006-react-native-mobile-app-shell.md](./docs/architecture/decisions/adr-006-react-native-mobile-app-shell.md)
- References: 
  - [React Navigation Docs](https://reactnavigation.org/)
  - [React Native Keychain](https://github.com/oblador/react-native-keychain)
  - [OWASP Mobile App Security](https://owasp.org/www-project-mobile-security-testing-guide/)