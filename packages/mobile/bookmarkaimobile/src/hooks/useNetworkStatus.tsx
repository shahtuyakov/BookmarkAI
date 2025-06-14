// src/hooks/useNetworkStatus.tsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

// Define the context type
interface NetworkContextType {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: string | null;
}

// Create the context with default values
const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  isInternetReachable: true,
  connectionType: 'unknown',
});

// Hook to use the network context
export const useNetworkStatus = () => useContext(NetworkContext);

// Provider component to wrap the app
export const NetworkProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [networkState, setNetworkState] = useState<NetworkContextType>({
    isConnected: true,
    isInternetReachable: true,
    connectionType: 'unknown',
  });

  useEffect(() => {
    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setNetworkState({
        isConnected: state.isConnected !== null ? state.isConnected : false,
        isInternetReachable: state.isInternetReachable,
        connectionType: state.type,
      });
    });

    // Initial fetch of network state
    NetInfo.fetch().then((state: NetInfoState) => {
      setNetworkState({
        isConnected: state.isConnected !== null ? state.isConnected : false,
        isInternetReachable: state.isInternetReachable,
        connectionType: state.type,
      });
    });

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <NetworkContext.Provider value={networkState}>
      {children}
    </NetworkContext.Provider>
  );
};
