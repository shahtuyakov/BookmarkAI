import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Initialize the biometrics module
const rnBiometrics = new ReactNativeBiometrics();

// Interface for biometric check result
interface BiometricCheckResult {
  available: boolean;
  biometryType?: string;
  error?: string;
}

// Check if biometrics is available
export const checkBiometricAvailability = async (): Promise<BiometricCheckResult> => {
  try {
    const { available, biometryType } = await rnBiometrics.isSensorAvailable();

    return {
      available,
      biometryType: biometryType || 'none',
    };
  } catch (error) {
    console.error('Error checking biometric availability:', error);
    return {
      available: false,
      error: String(error),
    };
  }
};

// Get the biometric type name for display
export const getBiometricName = (biometryType?: string): string => {
  switch (biometryType) {
    case BiometryTypes.FaceID:
      return 'Face ID';
    case BiometryTypes.TouchID:
      return 'Touch ID';
    case BiometryTypes.Biometrics:
      return 'Biometric Authentication';
    default:
      return 'Biometric Authentication';
  }
};

// Create biometric keys if needed
export const createBiometricKeys = async (): Promise<boolean> => {
  try {
    const { publicKey } = await rnBiometrics.createKeys();
    return !!publicKey;
  } catch (error) {
    console.error('Error creating biometric keys:', error);
    return false;
  }
};

// Authenticate with biometrics
export const authenticateWithBiometrics = async (
  promptMessage: string = 'Confirm your identity'
): Promise<boolean> => {
  try {
    // First check if biometric auth is available
    const { available } = await checkBiometricAvailability();
    if (!available) {
      return false;
    }

    // Show the authentication prompt
    const { success } = await rnBiometrics.simplePrompt({ promptMessage });
    return success;
  } catch (error) {
    console.error('Biometric authentication error:', error);
    return false;
  }
};

// Enable biometric login (store the user ID)
export const enableBiometricLogin = async (userId: string): Promise<boolean> => {
  try {
    // Create keys if they don't exist yet
    await createBiometricKeys();

    // Create signature with biometrics
    const { success, signature } = await rnBiometrics.createSignature({
      promptMessage: 'Sign in with biometrics',
      payload: userId,
    });

    if (!success || !signature) {
      return false;
    }

    // Store the user ID securely
    // In a production app, we'd also verify signatures server-side
    await AsyncStorage.setItem('biometric_user_id', userId);
    return true;
  } catch (error) {
    console.error('Error enabling biometric login:', error);
    return false;
  }
};

// Check if biometric login is enabled
export const isBiometricLoginEnabled = async (): Promise<boolean> => {
  try {
    const userId = await AsyncStorage.getItem('biometric_user_id');
    return !!userId;
  } catch (error) {
    console.error('Error checking biometric login status:', error);
    return false;
  }
};

// Get the user ID stored for biometric login
export const getBiometricUserId = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem('biometric_user_id');
  } catch (error) {
    console.error('Error getting biometric user ID:', error);
    return null;
  }
};

// Disable biometric login
export const disableBiometricLogin = async (): Promise<boolean> => {
  try {
    await AsyncStorage.removeItem('biometric_user_id');
    return true;
  } catch (error) {
    console.error('Error disabling biometric login:', error);
    return false;
  }
};
