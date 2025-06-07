import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { AuthProvider } from './src/contexts/AuthContext';
import { NetworkProvider } from './src/hooks/useNetworkStatus';
import { PersistentQueryClientProvider } from './src/services/queryClient';
import { SDKProvider, useSDK } from './src/contexts/SDKContext';
import RootNavigator from './src/navigation';
import { useAppTheme } from './src/theme';
import { useShareExtension } from './src/services/ShareExtensionHandler';
import { useCreateShare } from './src/hooks/useShares';
import { View, Text, ActivityIndicator } from 'react-native';

function AppContent(): React.JSX.Element {
  const { mutate: createShare } = useCreateShare();
  
  // Set up share extension handler
  useShareExtension({
    onShareReceived: (url) => {
      console.log('onShareReceived called with URL:', url);
      console.log('About to call createShare...');
      createShare({ url });
      console.log('createShare called');
    }
  });

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
  console.log('🏁 App component mounting...');
  console.log('📱 Platform:', require('react-native').Platform.OS);
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