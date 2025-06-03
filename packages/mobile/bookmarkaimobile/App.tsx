import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { AuthProvider } from './src/contexts/AuthContext';
import { NetworkProvider } from './src/hooks/useNetworkStatus';
import { PersistentQueryClientProvider } from './src/services/queryClient';
import { SDKProvider } from './src/contexts/SDKContext';
import RootNavigator from './src/navigation';
import { useAppTheme } from './src/theme';
import { useShareExtension } from './src/services/ShareExtensionHandler';
import { useCreateShare } from './src/hooks/useShares';

function AppContent(): React.JSX.Element {
  const { createShare } = useCreateShare();
  
  // Set up share extension handler
  useShareExtension({
    onShareReceived: (url) => {
      console.log('onShareReceived called with URL:', url);
      console.log('About to call createShare...');
      createShare(url);
      console.log('createShare called');
    }
  });

  return <RootNavigator />;
}

function App(): React.JSX.Element {
  console.log('🏁 App component mounting...');
  const theme = useAppTheme();

  return (
    <PersistentQueryClientProvider>
      <SDKProvider>
        <NetworkProvider>
          <AuthProvider>
            <PaperProvider theme={theme}>
              <NavigationContainer>
                <AppContent />
              </NavigationContainer>
            </PaperProvider>
          </AuthProvider>
        </NetworkProvider>
      </SDKProvider>
    </PersistentQueryClientProvider>
  );
}

export default App;