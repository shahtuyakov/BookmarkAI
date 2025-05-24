import { NativeEventEmitter, NativeModules, Linking, Platform, AppState, AppStateStatus } from 'react-native';
import { useEffect, useCallback, useRef } from 'react';

console.log('📦 Available NativeModules:', Object.keys(NativeModules));
console.log('🔍 ShareHandler module:', NativeModules.ShareHandler);

const { ShareHandler } = NativeModules;

interface ShareExtensionHandlerProps {
  onShareReceived: (url: string, silent?: boolean) => void;
}

export function useShareExtension({ onShareReceived }: ShareExtensionHandlerProps) {
  const appState = useRef(AppState.currentState);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle deep links
  const handleDeepLink = useCallback((event: { url: string }) => {
    console.log('🔗 Deep link received:', event.url);
    
    if (event.url.startsWith('bookmarkai://share')) {
      console.log('✅ BookmarkAI share link detected');
      const urlObj = new URL(event.url);
      const sharedUrl = urlObj.searchParams.get('url');
      const isSilent = urlObj.searchParams.get('silent') === 'true';
      
      if (sharedUrl) {
        console.log('📤 Processing shared URL:', sharedUrl, 'Silent:', isSilent);
        onShareReceived(decodeURIComponent(sharedUrl), isSilent);
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

  // Start periodic checking when app is active
  const startPeriodicCheck = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
    }
    
    console.log('🔄 Starting periodic check for pending shares');
    checkIntervalRef.current = setInterval(() => {
      if (AppState.currentState === 'active') {
        checkPendingShares();
      }
    }, 2000); // Check every 2 seconds when active
  }, [checkPendingShares]);

  // Stop periodic checking
  const stopPeriodicCheck = useCallback(() => {
    if (checkIntervalRef.current) {
      console.log('🛑 Stopping periodic check');
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
  }, []);

  // Handle app state changes (background -> foreground)
  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    console.log('📱 App state changed:', appState.current, '->', nextAppState);
    
    if (nextAppState === 'active') {
      // App became active - start checking silently
      console.log('🔄 App became active - starting silent background checks');
      
      // Immediate check
      setTimeout(() => {
        checkPendingShares();
      }, 100);
      
      // Start periodic checking for 10 seconds (shorter since it's silent)
      startPeriodicCheck();
      setTimeout(stopPeriodicCheck, 10000); // Stop after 10 seconds
      
    } else if (nextAppState === 'background' || nextAppState === 'inactive') {
      // App going to background - stop periodic checks
      stopPeriodicCheck();
    }
    
    appState.current = nextAppState;
  }, [checkPendingShares, startPeriodicCheck, stopPeriodicCheck]);

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
      nativeSubscription = shareEmitter.addListener('ShareExtensionData', (data: { url: string; silent?: boolean }) => {
        console.log('📨 ShareExtensionData event received:', data);
        if (data.url) {
          onShareReceived(data.url, data.silent);
        }
      });
      
      // Single initial check with shorter delay
      setTimeout(() => {
        console.log('⏰ Initial check for pending shares...');
        checkPendingShares();
      }, 500);
      
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
      stopPeriodicCheck();
      if (nativeSubscription) {
        nativeSubscription.remove();
      }
    };
  }, [handleDeepLink, handleAppStateChange, checkPendingShares, onShareReceived, stopPeriodicCheck]);

  return { checkPendingShares };
}