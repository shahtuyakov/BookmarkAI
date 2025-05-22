import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { AuthProvider } from './contexts/AuthContext';
import { NetworkProvider } from './hooks/useNetworkStatus';
import { PersistentQueryClientProvider } from './services/queryClient';
import RootNavigator from './navigation';
import { useAppTheme } from './theme';
import { useShareExtension } from './services/ShareExtensionHandler';
import { useCreateShare } from './hooks/useShares';

function AppContent(): React.JSX.Element {
  const { createShare } = useCreateShare();
  
  // Set up share extension handler
  useShareExtension({
    onShareReceived: (url) => {
      console.log('Received shared URL:', url);
      createShare(url);
    }
  });

  return <RootNavigator />;
}

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