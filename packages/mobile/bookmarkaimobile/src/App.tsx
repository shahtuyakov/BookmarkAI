import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
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
  
  // Process multiple shares from queue
  const handleSharesQueue = async (shares: ShareData[], silent = true) => {
    console.log(`📦 Processing ${shares.length} shares from queue`);
    
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
    
    // Optional: Show a subtle notification for multiple shares
    if (!silent && shares.length > 1) {
      console.log(`🔔 Could show notification: ${successCount}/${shares.length} bookmarks saved`);
      // Could add a toast notification here
    }
  };
  
  // Process single share
  const handleSingleShare = async (url: string, silent = false) => {
    console.log('📨 Processing single share:', url, 'Silent:', silent);
    
    try {
      console.log('📝 About to call createShare...');
      await createShare(url);
      console.log('✅ createShare completed successfully');
      
      // Only show feedback if NOT silent (for backward compatibility)
      if (!silent) {
        console.log('🔔 Showing success feedback (non-silent mode)');
        // Could add toast here for less intrusive feedback
      } else {
        console.log('🤫 Silent mode - bookmark saved without user notification');
      }
    } catch (err) {
      console.error('❌ createShare failed:', err);
      
      // For errors, we might still want to show feedback even in silent mode
      if (!silent) {
        console.log('🚨 Showing error feedback');
        // Could show error alert here
      } else {
        console.log('🤫 Silent mode error - bookmark failed to save');
        // Could show a subtle toast or add to a retry queue
      }
    }
  };
  
  // Set up share extension handler
  useShareExtension({
    onShareReceived: handleSingleShare,
    onSharesQueueReceived: handleSharesQueue,
  });

  return <RootNavigator />;
}

function App(): React.JSX.Element {
  console.log('🏁 App component mounting...');
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