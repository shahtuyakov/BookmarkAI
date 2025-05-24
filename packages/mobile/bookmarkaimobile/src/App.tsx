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
import { Alert } from 'react-native';

function AppContent(): React.JSX.Element {
  const { createShare, isPending, isError, error } = useCreateShare();
  
  // Set up share extension handler
  useShareExtension({
    onShareReceived: async (url) => {
      console.log('📨 onShareReceived called with URL:', url);
      
      try {
        console.log('📝 About to call createShare...');
        await createShare(url);
        console.log('✅ createShare completed successfully');
        
        // Show success feedback
        Alert.alert(
          'Bookmark Saved! 🎉',
          `Successfully saved: ${url}`,
          [{ text: 'OK', style: 'default' }]
        );
      } catch (err) {
        console.error('❌ createShare failed:', err);
        
        // Show error feedback
        Alert.alert(
          'Failed to Save Bookmark',
          'There was an error saving your bookmark. Please try again.',
          [{ text: 'OK', style: 'default' }]
        );
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