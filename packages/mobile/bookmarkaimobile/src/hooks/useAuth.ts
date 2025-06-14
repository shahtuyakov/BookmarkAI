import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBookmarkClient } from '../contexts/SDKContext';
import { LoginRequest } from '@bookmarkai/sdk';
import ReactNativeBiometrics from 'react-native-biometrics';

// Query keys
export const authKeys = {
  all: ['auth'] as const,
  user: () => [...authKeys.all, 'user'] as const,
  isAuthenticated: () => [...authKeys.all, 'isAuthenticated'] as const,
};

/**
 * Hook to check if user is authenticated
 */
export function useIsAuthenticated() {
  const client = useBookmarkClient();

  return useQuery({
    queryKey: authKeys.isAuthenticated(),
    queryFn: () => client.isAuthenticated(),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to get current user
 */
export function useCurrentUser() {
  const client = useBookmarkClient();
  const { data: isAuthenticated } = useIsAuthenticated();

  return useQuery({
    queryKey: authKeys.user(),
    queryFn: () => client.auth.getCurrentUser(),
    enabled: !!isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to login
 */
export function useLogin() {
  const client = useBookmarkClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: LoginRequest) => client.auth.login(credentials),
    onSuccess: (data) => {
      // Update auth state
      queryClient.setQueryData(authKeys.isAuthenticated(), true);
      queryClient.setQueryData(authKeys.user(), data.user);

      // Invalidate all queries to refetch with new auth
      queryClient.invalidateQueries();
    },
    onError: (error: any) => {
      console.error('Login failed:', error);
    },
  });
}

/**
 * Hook to logout
 */
export function useLogout() {
  const client = useBookmarkClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.auth.logout(),
    onSuccess: () => {
      // Clear all auth data
      queryClient.setQueryData(authKeys.isAuthenticated(), false);
      queryClient.removeQueries({ queryKey: authKeys.user() });

      // Clear all cached data
      queryClient.clear();
    },
    onError: (error: any) => {
      console.error('Logout failed:', error);
      // Even if server logout fails, clear local state
      queryClient.clear();
    },
  });
}

/**
 * Hook for biometric authentication
 */
export function useBiometricAuth() {
  const biometrics = new ReactNativeBiometrics();

  return useMutation({
    mutationFn: async () => {
      // Check if biometrics are available
      const { available, biometryType } = await biometrics.isSensorAvailable();

      if (!available) {
        throw new Error('Biometric authentication not available');
      }

      // Prompt for biometric authentication
      const { success, error } = await biometrics.simplePrompt({
        promptMessage: 'Authenticate to access BookmarkAI',
        fallbackPromptMessage: 'Use passcode',
      });

      if (!success) {
        throw new Error(error || 'Biometric authentication failed');
      }

      return { success, biometryType };
    },
  });
}

/**
 * Hook to enable biometric login
 */
export function useEnableBiometricLogin() {
  const client = useBookmarkClient();
  const biometrics = new ReactNativeBiometrics();

  return useMutation({
    mutationFn: async () => {
      // First check if user is authenticated
      const isAuthenticated = await client.isAuthenticated();
      if (!isAuthenticated) {
        throw new Error('Must be logged in to enable biometric login');
      }

      // Check biometric availability
      const { available } = await biometrics.isSensorAvailable();
      if (!available) {
        throw new Error('Biometric authentication not available');
      }

      // Store a flag that biometric login is enabled
      // The actual tokens are already stored securely by the SDK
      const mmkv = new (await import('react-native-mmkv')).MMKV({ id: 'auth-settings' });
      mmkv.set('biometric_enabled', true);

      return true;
    },
  });
}

/**
 * Hook to check if biometric login is enabled
 */
export function useIsBiometricEnabled() {
  return useQuery({
    queryKey: ['biometric-enabled'],
    queryFn: async () => {
      const mmkv = new (await import('react-native-mmkv')).MMKV({ id: 'auth-settings' });
      return mmkv.getBoolean('biometric_enabled') || false;
    },
  });
}
