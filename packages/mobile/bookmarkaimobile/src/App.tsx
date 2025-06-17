import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { Platform, Alert, ToastAndroid, NativeModules, View, Text, ActivityIndicator } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AuthProvider } from '../src/contexts/AuthContext';
import { NetworkProvider } from '../src/hooks/useNetworkStatus';
import { PersistentQueryClientProvider } from '../src/services/queryClient';
import { SDKProvider, useSDK } from '../src/contexts/SDKContext';
import RootNavigator from '../src/navigation';
import { useAppTheme } from '../src/theme';
import { useShareExtension } from '../src/services/ShareExtensionHandler';
import { useCreateShare, shareKeys } from '../src/hooks/useShares';
import { initializeIOSConfiguration } from '../src/utils/ios-config-sync';

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
      queryKey: shareKeys.lists() 
    });
    
    // Also invalidate individual share details that might be cached
    queryClient.invalidateQueries({ 
      queryKey: shareKeys.details() 
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
              console.error(`❌ Failed to mark share ${share.id} as processed:`, err);
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
        console.error(`❌ Failed to process share ${i + 1}: ${share.url}`, err);
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
      console.error('❌ createShare failed:', err);
      
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

function AppWithSDK(): React.JSX.Element {
  const { isInitialized, error } = useSDK();

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 16 }}>Initializing BookmarkAI...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'red', textAlign: 'center', padding: 20 }}>
          Failed to initialize SDK: {error.message}
        </Text>
      </View>
    );
  }

  return <AppContent />;
}

function App(): React.JSX.Element {
  const theme = useAppTheme();

  return (
    <PersistentQueryClientProvider>
      <SDKProvider>
        <NetworkProvider>
          <AuthProvider>
            <PaperProvider theme={theme}>
              <NavigationContainer>
                <AppWithSDK />
              </NavigationContainer>
            </PaperProvider>
          </AuthProvider>
        </NetworkProvider>
      </SDKProvider>
    </PersistentQueryClientProvider>
  );
}

export default App;