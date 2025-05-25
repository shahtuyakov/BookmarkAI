import { NativeEventEmitter, NativeModules, Linking, Platform, AppState, AppStateStatus } from 'react-native';
import { useEffect, useCallback, useRef } from 'react';

console.log('📦 Available NativeModules:', Object.keys(NativeModules));
console.log('🔍 ShareHandler module:', NativeModules.ShareHandler);

const { ShareHandler } = NativeModules;

interface ShareData {
  url: string;
  timestamp?: number;
  id?: string;
}

interface ShareExtensionHandlerProps {
  onShareReceived: (url: string, silent?: boolean) => void;
  onSharesQueueReceived?: (shares: ShareData[], silent?: boolean) => void;
}

export function useShareExtension({ onShareReceived, onSharesQueueReceived }: ShareExtensionHandlerProps) {
  const appState = useRef(AppState.currentState);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle deep links (iOS only)
  const handleDeepLink = useCallback((event: { url: string }) => {
    console.log('🔗 Deep link received:', event.url);
    
    if (event.url.startsWith('bookmarkai://share')) {
      console.log('✅ BookmarkAI share link detected');
      const urlObj = new URL(event.url);
      const sharedUrl = urlObj.searchParams.get('url');
      const isSilent = urlObj.searchParams.get('silent') === 'true';
      const isQueued = urlObj.searchParams.get('queued') === 'true';
      
      if (sharedUrl) {
        console.log('📤 Processing shared URL:', sharedUrl, 'Silent:', isSilent, 'Queued:', isQueued);
        onShareReceived(decodeURIComponent(sharedUrl), isSilent);
      } else {
        console.log('❌ No URL parameter found in deep link');
      }
    } else {
      console.log('ℹ️ Non-share deep link:', event.url);
    }
  }, [onShareReceived]);

  // Check for pending shares (cross-platform)
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

  // Flush queue (Android-specific, but safe to call on iOS)
  const flushQueue = useCallback(async () => {
    if (Platform.OS === 'android' && ShareHandler?.flushQueue) {
      try {
        console.log('🔄 Flushing Android share queue...');
        const result = await ShareHandler.flushQueue();
        console.log('✅ Queue flush result:', result);
        return result;
      } catch (error) {
        console.error('❌ Failed to flush queue:', error);
        return null;
      }
    } else if (Platform.OS === 'ios') {
      // On iOS, just check for pending shares
      checkPendingShares();
    }
  }, [checkPendingShares]);

  // Get pending count (Android-specific)
  const getPendingCount = useCallback(async (): Promise<number> => {
    if (Platform.OS === 'android' && ShareHandler?.getPendingCount) {
      try {
        const count = await ShareHandler.getPendingCount();
        console.log('📊 Pending count:', count);
        return count;
      } catch (error) {
        console.error('❌ Failed to get pending count:', error);
        return 0;
      }
    }
    return 0;
  }, []);

  // Start periodic checking when app is active
  const startPeriodicCheck = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
    }
    
    console.log('🔄 Starting periodic check for pending shares');
    checkIntervalRef.current = setInterval(() => {
      if (AppState.currentState === 'active') {
        if (Platform.OS === 'android') {
          // On Android, flush the queue
          flushQueue();
        } else {
          // On iOS, check for pending shares
          checkPendingShares();
        }
      }
    }, 2000); // Check every 2 seconds when active
  }, [checkPendingShares, flushQueue]);

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
        if (Platform.OS === 'android') {
          flushQueue();
        } else {
          checkPendingShares();
        }
      }, 100);
      
      // Start periodic checking for 10 seconds
      startPeriodicCheck();
      setTimeout(stopPeriodicCheck, 10000); // Stop after 10 seconds
      
    } else if (nextAppState === 'background' || nextAppState === 'inactive') {
      // App going to background - stop periodic checks
      stopPeriodicCheck();
    }
    
    appState.current = nextAppState;
  }, [checkPendingShares, flushQueue, startPeriodicCheck, stopPeriodicCheck]);

  useEffect(() => {
    console.log('🚀 ShareExtension handler initializing...');
    console.log('📱 Platform:', Platform.OS);
    
    // iOS-specific setup
    if (Platform.OS === 'ios') {
      console.log('🍎 Setting up iOS deep link listener...');
      
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
    }

    // Listen for app state changes (both platforms)
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    // Listen for share extension events (both platforms)
    let nativeSubscription: any;
    
    if (ShareHandler) {
      console.log('✅ Setting up ShareHandler event listener');
      const shareEmitter = new NativeEventEmitter(ShareHandler);
      
      // Single event listener that handles both single shares and queues
      nativeSubscription = shareEmitter.addListener('ShareExtensionData', (data: any) => {
        console.log('📨 ShareExtensionData event received:', data);
        
        if (data.isQueue && data.shares && onSharesQueueReceived) {
          // This is a queue of multiple shares
          console.log(`📦 Processing queue of ${data.shares.length} shares`);
          onSharesQueueReceived(data.shares, data.silent);
        } else if (data.url) {
          // This is a single share
          console.log('📤 Processing single share:', data.url);
          onShareReceived(data.url, data.silent);
        } else {
          console.log('❌ Unrecognized share data format:', data);
        }
      });
      
      // Listen for pending count changes (Android-specific)
      if (Platform.OS === 'android') {
        const pendingCountSubscription = shareEmitter.addListener('PendingCountChanged', (data: any) => {
          console.log('📊 Pending count changed:', data.pendingCount);
          // Could emit this to a global state or context if needed
        });
        
        // Clean up pending count subscription
        const originalRemove = nativeSubscription.remove;
        nativeSubscription.remove = () => {
          originalRemove();
          pendingCountSubscription.remove();
        };
      }
      
      // Single initial check
      setTimeout(() => {
        console.log('⏰ Initial check for pending shares...');
        if (Platform.OS === 'android') {
          flushQueue();
        } else {
          checkPendingShares();
        }
      }, 500);
      
    } else {
      console.log('❌ ShareHandler not available');
      console.log('   Platform:', Platform.OS);
      console.log('   ShareHandler exists:', !!ShareHandler);
    }

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up ShareExtension listeners');
      
      if (Platform.OS === 'ios') {
        // iOS-specific cleanup
        const linkingSubscription = Linking.addEventListener('url', handleDeepLink);
        linkingSubscription.remove();
      }
      
      appStateSubscription.remove();
      stopPeriodicCheck();
      if (nativeSubscription) {
        nativeSubscription.remove();
      }
    };
  }, [handleDeepLink, handleAppStateChange, checkPendingShares, flushQueue, onShareReceived, onSharesQueueReceived, stopPeriodicCheck]);

  return { 
    checkPendingShares, 
    flushQueue, 
    getPendingCount,
    // Platform-specific methods
    ...(Platform.OS === 'android' && {
      // Android-specific methods could be exposed here
      retryFailedItems: async () => {
        if (ShareHandler?.retryFailedItems) {
          try {
            const result = await ShareHandler.retryFailedItems();
            console.log('🔄 Retried failed items:', result);
            return result;
          } catch (error) {
            console.error('❌ Failed to retry items:', error);
            return 0;
          }
        }
        return 0;
      },
      getQueueStatus: async () => {
        if (ShareHandler?.getQueueStatus) {
          try {
            const status = await ShareHandler.getQueueStatus();
            console.log('📋 Queue status:', status);
            return status;
          } catch (error) {
            console.error('❌ Failed to get queue status:', error);
            return null;
          }
        }
        return null;
      }
    })
  };
}