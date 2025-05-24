import { NativeEventEmitter, NativeModules, Linking, Platform, AppState, AppStateStatus } from 'react-native';
import { useEffect, useCallback, useRef } from 'react';

console.log('📦 Available NativeModules:', Object.keys(NativeModules));
console.log('🔍 ShareHandler module:', NativeModules.ShareHandler);

const { ShareHandler } = NativeModules;

interface ShareExtensionHandlerProps {
  onShareReceived: (url: string) => void;
}

export function useShareExtension({ onShareReceived }: ShareExtensionHandlerProps) {
  const appState = useRef(AppState.currentState);

  // Handle deep links
  const handleDeepLink = useCallback((event: { url: string }) => {
    console.log('🔗 Deep link received:', event.url);
    
    if (event.url.startsWith('bookmarkai://share')) {
      console.log('✅ BookmarkAI share link detected');
      const urlObj = new URL(event.url);
      const sharedUrl = urlObj.searchParams.get('url');
      
      if (sharedUrl) {
        console.log('📤 Processing shared URL:', sharedUrl);
        onShareReceived(decodeURIComponent(sharedUrl));
      } else {
        console.log('❌ No URL parameter found in deep link');
      }
    } else {
      console.log('ℹ️ Non-share deep link:', event.url);
    }
  }, [onShareReceived]);

  // Check for pending shares from the share extension
  const checkPendingShares = useCallback(() => {
    console.log('🔍 Checking for pending shares...');
    if (ShareHandler?.checkPendingShares) {
      console.log('✅ Calling ShareHandler.checkPendingShares');
      ShareHandler.checkPendingShares();
    } else {
      console.log('❌ ShareHandler.checkPendingShares not available');
      console.log('🔍 ShareHandler available methods:', ShareHandler ? Object.keys(ShareHandler) : 'ShareHandler is null');
    }
  }, []);

  // Handle app state changes (background -> foreground)
  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    console.log('📱 App state changed:', appState.current, '->', nextAppState);
    
    // App came to foreground from background
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      console.log('🔄 App came to foreground - checking for pending shares');
      
      // Add a small delay to ensure the app is fully active
      setTimeout(() => {
        checkPendingShares();
      }, 500);
    }
    
    appState.current = nextAppState;
  }, [checkPendingShares]);

  useEffect(() => {
    console.log('🚀 ShareExtension handler initializing...');
    console.log('📱 Platform:', Platform.OS);
    console.log('🔗 Setting up deep link listener...');
    
    // Listen for deep links
    const linkingSubscription = Linking.addEventListener('url', handleDeepLink);
    
    // Check for initial URL (app opened via deep link)
    Linking.getInitialURL().then(url => {
      if (url) {
        console.log('🔗 Initial URL found:', url);
        handleDeepLink({ url });
      } else {
        console.log('ℹ️ No initial URL');
      }
    });

    // Listen for app state changes
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    // Listen for share extension events
    let nativeSubscription: any;
    if (Platform.OS === 'ios' && ShareHandler) {
      console.log('✅ Setting up ShareHandler event listener');
      const shareEmitter = new NativeEventEmitter(ShareHandler);
      nativeSubscription = shareEmitter.addListener('ShareExtensionData', (data: { url: string }) => {
        console.log('📨 ShareExtensionData event received:', data);
        if (data.url) {
          onShareReceived(data.url);
        }
      });
      
      // Check for pending shares on startup
      setTimeout(() => {
        console.log('⏰ Initial check for pending shares...');
        checkPendingShares();
      }, 1000);
      
    } else {
      console.log('❌ ShareHandler not available');
      console.log('   Platform iOS:', Platform.OS === 'ios');
      console.log('   ShareHandler exists:', !!ShareHandler);
    }

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up ShareExtension listeners');
      linkingSubscription.remove();
      appStateSubscription.remove();
      if (nativeSubscription) {
        nativeSubscription.remove();
      }
    };
  }, [handleDeepLink, handleAppStateChange, checkPendingShares, onShareReceived]);

  return { checkPendingShares };
}