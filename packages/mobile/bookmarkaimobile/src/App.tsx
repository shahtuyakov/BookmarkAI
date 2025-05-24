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

function AppContent(): React.JSX.Element {
  const { createShare } = useCreateShare();
  
  // Set up share extension handler
  useShareExtension({
    onShareReceived: async (url, silent = false) => {
      console.log('📨 onShareReceived called with URL:', url, 'Silent:', silent);
      
      try {
        console.log('📝 About to call createShare silently...');
        await createShare(url);
        console.log('✅ createShare completed successfully');
        
        // Only show feedback if NOT silent (for backward compatibility with old flows)
        if (!silent) {
          // This would only happen if someone uses the old deep link format
          console.log('🔔 Showing success feedback (non-silent mode)');
          // Could add a toast here instead of alert for less intrusive feedback
        } else {
          console.log('🤫 Silent mode - bookmark saved without user notification');
        }
      } catch (err) {
        console.error('❌ createShare failed:', err);
        
        // For errors, we might still want to show feedback even in silent mode
        // but make it less intrusive (like a toast instead of alert)
        if (!silent) {
          console.log('🚨 Showing error feedback');
          // Could show error alert here
        } else {
          console.log('🤫 Silent mode error - bookmark failed to save');
          // Could show a subtle toast or add to a retry queue
        }
      }
    }
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