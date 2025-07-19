declare module 'react-native-config' {
  export interface NativeConfig {
    API_URL?: string;
    ENVIRONMENT?: string;
    NODE_ENV?: string;
    ENABLE_SDK?: string;
    ENABLE_LOGGING?: string;
    ENABLE_TRACE_PROPAGATION?: string;
    TRACE_SAMPLING_RATE?: string;
    TEMPO_ENDPOINT?: string;
    GOOGLE_IOS_CLIENT_ID?: string;
    GOOGLE_WEB_CLIENT_ID?: string;
  }

  export const Config: NativeConfig;
  export default Config;
}