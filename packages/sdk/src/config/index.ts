export interface ClientConfig {
  baseUrl: string;
  environment?: 'development' | 'staging' | 'production';
  apiVersion?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  onTokenRefresh?: (tokens: { accessToken: string; refreshToken: string }) => void;
}

export interface DevModeConfig {
  configUrl: string;
  pollInterval?: number;
}

export interface FeatureFlags {
  [key: string]: boolean | string | number;
}

export interface RuntimeConfig extends ClientConfig {
  features?: FeatureFlags;
}

export class ConfigService {
  private config: RuntimeConfig;
  private listeners: Array<(config: RuntimeConfig) => void> = [];

  constructor(initialConfig: ClientConfig) {
    this.config = {
      apiVersion: '1.0',
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      ...initialConfig,
    };
  }

  getConfig(): RuntimeConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<RuntimeConfig>): void {
    this.config = { ...this.config, ...updates };
    this.notifyListeners();
  }

  onConfigChange(callback: (config: RuntimeConfig) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(): void {
    const config = this.getConfig();
    this.listeners.forEach(listener => listener(config));
  }
}