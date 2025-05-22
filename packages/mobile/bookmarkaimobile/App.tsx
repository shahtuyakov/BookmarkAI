import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { AuthProvider } from './src/contexts/AuthContext';
import { NetworkProvider } from './src/hooks/useNetworkStatus';
import { PersistentQueryClientProvider } from './src/services/queryClient';
import RootNavigator from './src/navigation';
import { useAppTheme } from './src/theme';
import { useShareExtension } from './src/services/ShareExtensionHandler';
import { useCreateShare } from './src/hooks/useShares';

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