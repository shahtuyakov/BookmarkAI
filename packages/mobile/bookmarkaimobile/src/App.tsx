import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { Platform, Alert } from 'react-native';
import { AuthProvider } from '../src/contexts/AuthContext';
import { NetworkProvider } from '../src/hooks/useNetworkStatus';
import { PersistentQueryClientProvider } from '../src/services/queryClient';
import RootNavigator from '../src/navigation';
import { useAppTheme } from '../src/theme';
import { useShareExtension } from '../src/services/ShareExtensionHandler';
import { useCreateShare } from '../src/hooks/useShares';

interface ShareData {
  url: string;
  timestamp?: number;
  id?: string;
}

function AppContent(): React.JSX.Element {
  const { createShare } = useCreateShare();
  
  // Process multiple shares from queue (cross-platform)
  const handleSharesQueue = async (shares: ShareData[], silent = true) => {
    console.log(`📦 Processing ${shares.length} shares from queue (Platform: ${Platform.OS})`);
    
    let successCount = 0;
    let failureCount = 0;
    
    // Process shares in sequence to avoid overwhelming the API
    for (let i = 0; i < shares.length; i++) {
      const share = shares[i];
      console.log(`📝 Processing share ${i + 1}/${shares.length}: ${share.url}`);
      
      try {
        await createShare(share.url);
        successCount++;
        console.log(`✅ Successfully processed share ${i + 1}: ${share.url}`);
        
        // Small delay between requests to be API-friendly
        if (i < shares.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (err) {
        failureCount++;
        console.error(`❌ Failed to process share ${i + 1}: ${share.url}`, err);
      }
    }
    
    console.log(`🎯 Queue processing complete: ${successCount} succeeded, ${failureCount} failed`);
    
    // Show user feedback for multiple shares (platform-specific)
    if (!silent && shares.length > 1) {
      const message = `${successCount}/${shares.length} bookmarks saved successfully`;
      
      if (Platform.OS === 'ios') {
        console.log(`🔔 iOS: ${message}`);
        // Could add a toast notification here for iOS
      } else if (Platform.OS === 'android') {
        console.log(`🤖 Android: ${message}`);
        // Android already shows toast in ShareActivity, so this is just for logging
        // Could add a subtle in-app notification here
      }
    }
  };
  
  // Process single share (cross-platform)
  const handleSingleShare = async (url: string, silent = false) => {
    console.log(`📨 Processing single share (Platform: ${Platform.OS}):`, url, 'Silent:', silent);
    
    try {
      console.log('📝 About to call createShare...');
      await createShare(url);
      console.log('✅ createShare completed successfully');
      
      // Platform-specific feedback
      if (!silent) {
        if (Platform.OS === 'ios') {
          console.log('🍎 iOS: Showing success feedback (non-silent mode)');
          // Could add iOS-specific toast here
        } else if (Platform.OS === 'android') {
          console.log('🤖 Android: Success (toast already shown by ShareActivity)');
          // Android ShareActivity already showed toast, no additional feedback needed
        }
      } else {
        console.log(`🤫 Silent mode - bookmark saved without user notification (${Platform.OS})`);
      }
    } catch (err) {
      console.error('❌ createShare failed:', err);
      
      // For errors, we might still want to show feedback even in silent mode
      if (!silent) {
        const errorMessage = 'Failed to save bookmark. Please try again.';
        
        if (Platform.OS === 'ios') {
          console.log('🚨 iOS: Showing error feedback');
          // Could show error alert here for iOS
          Alert.alert('Error', errorMessage);
        } else if (Platform.OS === 'android') {
          console.log('🚨 Android: Error (ShareActivity handled initial feedback)');
          // Could show in-app error notification for Android
        }
      } else {
        console.log(`🤫 Silent mode error - bookmark failed to save (${Platform.OS})`);
        // Could add to a retry queue or show a subtle notification
      }
    }
  };
  
  // Set up share extension handler with platform-aware callbacks
  const shareExtensionReturn = useShareExtension({
    onShareReceived: handleSingleShare,
    onSharesQueueReceived: handleSharesQueue,
  });
  
  // Log available methods based on platform
  React.useEffect(() => {
    console.log('🔧 Share extension methods available:');
    console.log('   Platform:', Platform.OS);
    console.log('   checkPendingShares:', typeof shareExtensionReturn.checkPendingShares);
    console.log('   flushQueue:', typeof shareExtensionReturn.flushQueue);
    console.log('   getPendingCount:', typeof shareExtensionReturn.getPendingCount);
    
    if (Platform.OS === 'android') {
      console.log('🤖 Android-specific methods:');
      console.log('   retryFailedItems:', typeof shareExtensionReturn.retryFailedItems);
      console.log('   getQueueStatus:', typeof shareExtensionReturn.getQueueStatus);
    }
  }, [shareExtensionReturn]);

  return <RootNavigator />;
}

function App(): React.JSX.Element {
  console.log('🏁 App component mounting...');
  console.log('📱 Platform:', Platform.OS);
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