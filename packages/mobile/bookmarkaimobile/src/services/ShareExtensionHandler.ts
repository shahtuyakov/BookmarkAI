// src/services/ShareExtensionHandler.ts
import { NativeEventEmitter, NativeModules, Linking, Platform } from 'react-native';
import { useEffect, useCallback } from 'react';

const { ShareHandler } = NativeModules;

interface ShareExtensionHandlerProps {
  onShareReceived: (url: string) => void;
}

export function useShareExtension({ onShareReceived }: ShareExtensionHandlerProps) {
  // Handle deep links
  const handleDeepLink = useCallback((event: { url: string }) => {
    if (event.url.startsWith('bookmarkai://share')) {
      const urlObj = new URL(event.url);
      const sharedUrl = urlObj.searchParams.get('url');
      
      if (sharedUrl) {
        onShareReceived(decodeURIComponent(sharedUrl));
      }
    }
  }, [onShareReceived]);

  // Check for pending shares from the share extension
  const checkPendingShares = useCallback(() => {
    if (ShareHandler?.checkPendingShares) {
      ShareHandler.checkPendingShares();
    }
  }, []);

  useEffect(() => {
    // Listen for deep links
    const linkingSubscription = Linking.addEventListener('url', handleDeepLink);
    
    // Check for initial URL (app opened via deep link)
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink({ url });
    });

    // Listen for share extension events
    let nativeSubscription: any;
    if (Platform.OS === 'ios' && ShareHandler) {
      const shareEmitter = new NativeEventEmitter(ShareHandler);
      nativeSubscription = shareEmitter.addListener('ShareExtensionData', (data: { url: string }) => {
        if (data.url) {
          onShareReceived(data.url);
        }
      });
      
      // Check for pending shares
      checkPendingShares();
    }

    // Cleanup
    return () => {
      linkingSubscription.remove();
      if (nativeSubscription) {
        nativeSubscription.remove();
      }
    };
  }, [handleDeepLink, checkPendingShares, onShareReceived]);

  return { checkPendingShares };
}