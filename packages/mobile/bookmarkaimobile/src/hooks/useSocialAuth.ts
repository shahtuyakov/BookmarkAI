import { useState, useCallback, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import appleAuth from '@invertase/react-native-apple-authentication';
import Config from 'react-native-config';
import { useSDKClient } from '../contexts/auth-provider';

// Configure Google Sign-In when the hook is first used
let isGoogleConfigured = false;

export const useSocialAuth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const client = useSDKClient();

  // Configure Google Sign-In once
  useEffect(() => {
    if (!isGoogleConfigured && Config.GOOGLE_IOS_CLIENT_ID && Config.GOOGLE_WEB_CLIENT_ID) {
      GoogleSignin.configure({
        iosClientId: Config.GOOGLE_IOS_CLIENT_ID,
        webClientId: Config.GOOGLE_WEB_CLIENT_ID, // Required for getting the ID token
        offlineAccess: false,
      });
      isGoogleConfigured = true;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      setIsLoading(true);

      // Check if Google Play Services are available (Android)
      await GoogleSignin.hasPlayServices();

      // Sign in and get user info
      const userInfo = await GoogleSignin.signIn();
      
      if (!userInfo.data?.idToken) {
        throw new Error('Failed to get Google ID token');
      }

      if (!client) {
        throw new Error('SDK client not initialized');
      }

      // Send the ID token to our backend using SDK
      // The SDK will automatically handle token storage and user state
      await client.auth.googleSignIn({
        idToken: userInfo.data.idToken,
        deviceInfo: {
          platform: Platform.OS,
          version: Platform.Version.toString(),
        },
      });

      // The onTokenRefresh callback in the SDK client will emit 'auth-state-changed' event
      // which will trigger the auth context to re-check authentication state

    } catch (error: any) {
      let message = 'Failed to sign in with Google';
      
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled the sign in
        return;
      } else if (error.code === statusCodes.IN_PROGRESS) {
        message = 'Sign in already in progress';
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        message = 'Google Play Services not available';
      } else if (error.response?.data?.message) {
        message = error.response.data.message;
      }

      Alert.alert('Sign In Failed', message);
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('Not Available', 'Apple Sign In is only available on iOS');
      return;
    }

    try {
      setIsLoading(true);

      // Check if Apple Sign In is available
      if (!appleAuth.isSupported) {
        throw new Error('Apple Sign In is not supported on this device');
      }

      // Perform the Apple Sign In request
      const appleAuthRequestResponse = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });

      // Get the credential state
      const credentialState = await appleAuth.getCredentialStateForUser(
        appleAuthRequestResponse.user
      );

      if (credentialState === appleAuth.State.AUTHORIZED) {
        if (!appleAuthRequestResponse.identityToken) {
          throw new Error('Failed to get Apple identity token');
        }

        if (!client) {
          throw new Error('SDK client not initialized');
        }

        // Send the identity token to our backend using SDK
        // The SDK will automatically handle token storage and user state
        await client.auth.appleSignIn({
          idToken: appleAuthRequestResponse.identityToken,
          firstName: appleAuthRequestResponse.fullName?.givenName || undefined,
          lastName: appleAuthRequestResponse.fullName?.familyName || undefined,
          deviceInfo: {
            platform: Platform.OS,
            version: Platform.Version.toString(),
          },
        });
      } else {
        throw new Error('Apple Sign In failed');
      }
    } catch (error: any) {
      let message = 'Failed to sign in with Apple';
      
      if (error.code === appleAuth.Error.CANCELED) {
        // User cancelled the sign in
        return;
      } else if (error.code === appleAuth.Error.FAILED) {
        message = 'Apple Sign In failed';
      } else if (error.code === appleAuth.Error.UNKNOWN) {
        message = 'An unknown error occurred with Apple Sign In';
      } else if (error.response?.data?.message) {
        message = error.response.data.message;
      }

      Alert.alert('Sign In Failed', message);
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  return {
    signInWithGoogle,
    signInWithApple,
    isLoading,
  };
};