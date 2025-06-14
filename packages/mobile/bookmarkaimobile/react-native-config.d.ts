declare module 'react-native-config' {
  export interface NativeConfig {
    API_URL?: string;
    ENVIRONMENT?: string;
  }

  export const Config: NativeConfig;
  export default Config;
}
