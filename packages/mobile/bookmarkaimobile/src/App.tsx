import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { Platform, Alert, ToastAndroid, NativeModules, View, Text, ActivityIndicator } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AuthProvider } from './contexts/auth-provider';
import { NetworkProvider } from './hooks/useNetworkStatus';
import { PersistentQueryClientProvider } from './services/queryClient';
import RootNavigator from './navigation';
import { useAppTheme } from './theme';
import { useShareExtension } from './services/ShareExtensionHandler';
import { useCreateShare, sharesKeys } from './hooks/useShares';
import { initializeIOSConfiguration } from './utils/ios-config-sync';

interface ShareData {
  url: string;
  timestamp?: number;
  id?: string;
  status?: string;
}

function AppContent(): React.JSX.Element {
  const { mutate: createShare } = useCreateShare();
  const queryClient = useQueryClient();
  
  
  // Initialize iOS configuration on app launch
  useEffect(() => {
    initializeIOSConfiguration();
  }, []);
  
  // Helper function to invalidate shares cache and trigger UI refresh
  const refreshSharesList = React.useCallback(() => {
    
    // Invalidate all shares queries to trigger refetch
    queryClient.invalidateQueries({ 
      queryKey: sharesKeys.lists() 
    });
    
    // Also invalidate individual share details that might be cached
    queryClient.invalidateQueries({ 
      queryKey: sharesKeys.details() 
    });
    
  }, [queryClient]);
  
  // Process multiple shares from queue (cross-platform)
  const handleSharesQueue = React.useCallback(async (shares: ShareData[], silent = true, needsAuth = false) => {
    
    // Show Android toast for debugging
    if (Platform.OS === 'android' && !silent) {
      ToastAndroid.show(
        `📦 Processing ${shares.length} ${needsAuth ? 'auth-needed' : 'shared'} links`, 
        ToastAndroid.SHORT
      );
    }
    
    let successCount = 0;
    let failureCount = 0;
    let shouldRefreshUI = false;
    
    // Process shares in sequence to avoid overwhelming the API
    for (let i = 0; i < shares.length; i++) {
      const share = shares[i];
      
      try {
        // If it's already uploaded on Android, just mark for UI refresh
        if (Platform.OS === 'android' && share.status === 'uploaded') {
          successCount++;
          shouldRefreshUI = true;
        } else if (Platform.OS === 'android' && (share.status === 'needs_auth' || needsAuth)) {
          // For NEEDS_AUTH items, process through React Native which has auth tokens
          await createShare({ url: share.url });
          
          // Mark as processed in Android database
          if (share.id && NativeModules.ShareHandler?.markShareAsProcessed) {
            try {
              await NativeModules.ShareHandler.markShareAsProcessed(share.id);
            } catch (err) {
              // Failed to mark share as processed
            }
          }
          
          successCount++;
          shouldRefreshUI = true;
        } else {
          await createShare({ url: share.url });
          successCount++;
          shouldRefreshUI = true;
        }
        
        // Small delay between requests to be API-friendly
        if (i < shares.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (err) {
        failureCount++;
        // Failed to process share
      }
    }
    
    
    // Refresh UI if any shares were processed successfully
    if (shouldRefreshUI && successCount > 0) {
      
      // Small delay to ensure any optimistic updates have settled
      setTimeout(() => {
        refreshSharesList();
      }, 500);
    }
    
    // Show user feedback for multiple shares (platform-specific)
    if (!silent && shares.length > 1) {
      const message = `${successCount}/${shares.length} bookmarks processed`;
      
      if (Platform.OS === 'ios') {
        // Could add a toast notification here for iOS
      } else if (Platform.OS === 'android') {
        ToastAndroid.show(`✅ ${message}`, ToastAndroid.LONG);
      }
    }
  }, [createShare, queryClient, refreshSharesList]);
  
  // Process single share (cross-platform)
  const handleSingleShare = React.useCallback(async (url: string, silent = false) => {
    
    try {
      await createShare({ url });
      
      // Refresh UI after successful share creation
      setTimeout(() => {
        refreshSharesList();
      }, 300);
      
      // Platform-specific feedback
      if (!silent) {
        if (Platform.OS === 'ios') {
          // Could add iOS-specific toast here
        } else if (Platform.OS === 'android') {
          ToastAndroid.show('✅ Bookmark added!', ToastAndroid.SHORT);
        }
      } else {
      }
    } catch (err) {
      // createShare failed
      
      // For errors, we might still want to show feedback even in silent mode
      if (!silent) {
        const errorMessage = 'Failed to save bookmark. Please try again.';
        
        if (Platform.OS === 'ios') {
          Alert.alert('Error', errorMessage);
        } else if (Platform.OS === 'android') {
          ToastAndroid.show('❌ ' + errorMessage, ToastAndroid.LONG);
        }
      } else {
      }
    }
  }, [createShare, refreshSharesList]);
  
  // Set up share extension handler with platform-aware callbacks
  const shareExtensionReturn = useShareExtension({
    onShareReceived: handleSingleShare,
    onSharesQueueReceived: handleSharesQueue,
  });
  
  // Log available methods based on platform
  React.useEffect(() => {
    
    if (Platform.OS === 'android') {
      
      // Test Android queue status on startup
      if (shareExtensionReturn.getQueueStatus) {
        shareExtensionReturn.getQueueStatus().then(status => {
          if (status && (status.pending > 0 || status.uploaded > 0)) {
            ToastAndroid.show(
              `📋 Queue: ${status.pending} pending, ${status.uploaded} uploaded`, 
              ToastAndroid.LONG
            );
          }
        });
      }
    }
  }, [shareExtensionReturn]);
  
  // Add manual test button for Android (development only)
  React.useEffect(() => {
    if (__DEV__ && Platform.OS === 'android') {
      const testAndroidQueue = async () => {
        if (shareExtensionReturn.processAndroidQueue) {
          await shareExtensionReturn.processAndroidQueue();
        }
      };
      
      // Test after 3 seconds
      const timeout = setTimeout(testAndroidQueue, 3000);
      return () => clearTimeout(timeout);
    }
  }, [shareExtensionReturn]);

  return <RootNavigator />;
}

// SDK initialization now handled in auth-provider

function App(): React.JSX.Element {
  const theme = useAppTheme();

  return (
    <PersistentQueryClientProvider>
      <NetworkProvider>
        <AuthProvider>
          <PaperProvider theme={theme}>
            <NavigationContainer>
              <AppContent />
            </NavigationContainer>
          </PaperProvider>
        </AuthProvider>
      </NetworkProvider>
    </PersistentQueryClientProvider>
  );
}

export default App;