// Type augmentation for react-native-keychain to match SDK expectations
import * as Keychain from 'react-native-keychain';

declare module 'react-native-keychain' {
  // Augment the existing module to ensure compatibility
  export interface Result {
    service: string;
    storage: string;
  }
  
  // Override the setInternetCredentials return type for SDK compatibility
  export function setInternetCredentials(
    server: string,
    username: string,
    password: string,
    options?: Keychain.Options
  ): Promise<boolean>;
}