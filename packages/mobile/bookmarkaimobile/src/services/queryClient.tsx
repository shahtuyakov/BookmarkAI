// src/services/queryClient.tsx
import React from 'react';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

// Create a client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default settings for all queries
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 60 * 24, // 24 hours
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // By default, we assume data might be stale and needs refetching
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      
      // Offline handling: use cached data when offline
      networkMode: 'always',
    },
    mutations: {
      // Mutations will retry 3 times with exponential backoff
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      networkMode: 'always',
    },
  },
});

// Create a persister for offline caching
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'bookmarkai-cache',
  // Only persist queries that explicitly opt-in with meta.persist = true
  // This prevents unnecessary persistence of infrequently used queries
  throttleTime: 1000, // Only persist after 1 second of inactivity
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
});

// QueryClientProvider wrapper that includes persistence
export const PersistentQueryClientProvider: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        // When we reconnect, refetch everything that might have changed
        dehydrateOptions: {
          shouldDehydrateQuery: query => {
            // Only persist queries marked for persistence
            return query.meta?.persist === true;
          },
        },
        // Eagerly restore cached data on app startup
        hydrateOptions: {
          defaultOptions: {
            queries: {
              // Force cache initialization to be synchronous
              // to avoid loading flashes
              throwOnError: false,
            },
          },
        },
      }}>
      {children}
    </PersistQueryClientProvider>
  );
};