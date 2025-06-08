import { 
  NetworkAdapter, 
  StorageAdapter, 
  PlatformAdapter,
  RequestConfig,
  Response 
} from './adapters/types';
import { FetchAdapter } from './adapters/fetch.adapter';
import { MemoryStorageAdapter } from './adapters/storage/memory.storage';
import { AuthService, TokenPair } from './services/auth.service';
import { BookmarkAIRateLimiter } from './utils/rate-limiter';
import { withRetry, RetryConfig } from './utils/retry';
import { ConfigService, ClientConfig, DevModeConfig } from './config';
import { InterceptorManager } from './interceptors/types';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { TracingInterceptor } from './interceptors/tracing.interceptor';
import { SharesService } from './services/shares.service';
import { HealthService } from './services/health.service';
import { AuthApiService } from './services/auth-api.service';
import { EventsService } from './services/events.service';

export interface BookmarkAIClientConfig extends ClientConfig {
  adapter?: NetworkAdapter | PlatformAdapter;
  storage?: StorageAdapter;
  retry?: Partial<RetryConfig>;
  enableRateLimiting?: boolean;
}

export interface BookmarkAIError {
  code: string;
  message: string;
  details?: any;
  status?: number;
  retryable?: boolean;
  retryAfter?: number;
}

export class BookmarkAIClient {
  private networkAdapter: NetworkAdapter;
  private storageAdapter: StorageAdapter;
  private authService: AuthService;
  private rateLimiter: BookmarkAIRateLimiter;
  private configService: ConfigService;
  private interceptorManager: InterceptorManager;
  private devModeInterval?: NodeJS.Timeout;

  // Public API services
  public auth!: AuthApiService;
  public shares!: SharesService;
  public health!: HealthService;
  public events!: EventsService;

  constructor(config: BookmarkAIClientConfig) {
    // Set up adapters
    if (config.adapter && 'network' in config.adapter) {
      // Platform adapter provided
      this.networkAdapter = config.adapter.network;
      this.storageAdapter = config.adapter.storage;
    } else {
      // Individual adapters
      this.networkAdapter = (config.adapter as NetworkAdapter) || new FetchAdapter();
      this.storageAdapter = config.storage || new MemoryStorageAdapter();
    }

    // Initialize services
    this.configService = new ConfigService(config);
    this.rateLimiter = new BookmarkAIRateLimiter();
    this.interceptorManager = new InterceptorManager();
    
    // Initialize auth service
    this.authService = new AuthService(
      {
        storage: this.storageAdapter,
        onTokenRefresh: config.onTokenRefresh,
      },
      this.refreshTokenHandler.bind(this)
    );

    // Add default interceptors
    this.interceptorManager.addRequestInterceptor(new AuthInterceptor(this.authService));
    this.interceptorManager.addRequestInterceptor(new TracingInterceptor());
    this.interceptorManager.addResponseInterceptor(new TracingInterceptor());

    // Initialize generated API services
    this.initializeServices();
  }

  /**
   * Enable development mode with hot config reloading
   */
  enableDevMode(config: DevModeConfig): void {
    if (this.devModeInterval) {
      clearInterval(this.devModeInterval);
    }

    const pollConfig = async () => {
      try {
        const response = await this.networkAdapter.request({
          url: `${this.configService.getConfig().baseUrl}${config.configUrl}`,
          method: 'GET',
        });

        if (response.data && response.data.apiUrl) {
          this.configService.updateConfig({ baseUrl: response.data.apiUrl });
        }
      } catch (error) {
        // Ignore errors in dev mode polling
      }
    };

    // Initial poll
    pollConfig();

    // Set up interval
    this.devModeInterval = setInterval(
      pollConfig, 
      config.pollInterval || 1000
    );
  }

  /**
   * Make an authenticated API request
   */
  async request<T = any>(config: RequestConfig): Promise<Response<T>> {
    // Apply rate limiting
    const rateConfig = this.configService.getConfig();
    if (rateConfig.environment !== 'development') {
      await this.rateLimiter.waitForToken();
    }

    // Build initial config
    let requestConfig: RequestConfig = {
      ...config,
      url: this.buildUrl(config.url),
      headers: {
        ...config.headers,
        'Accept-Version': this.configService.getConfig().apiVersion || '1.0',
      },
      timeout: config.timeout || this.configService.getConfig().timeout,
    };

    // Apply request interceptors
    requestConfig = await this.interceptorManager.applyRequestInterceptors(requestConfig);

    // Execute request with retry
    return withRetry(
      async () => {
        try {
          let response = await this.networkAdapter.request<T>(requestConfig);
          
          // Apply response interceptors
          response = await this.interceptorManager.applyResponseInterceptors(response);
          
          // Check for 401 and retry with refreshed token
          if (response.status === 401) {
            try {
              await this.authService.refreshTokens();
              // Re-apply interceptors to get new auth header
              requestConfig = await this.interceptorManager.applyRequestInterceptors(config);
              response = await this.networkAdapter.request<T>(requestConfig);
              response = await this.interceptorManager.applyResponseInterceptors(response);
            } catch (refreshError) {
              // Token refresh failed, the AuthService already emitted 'auth-error'
              // Just re-throw the error
              throw refreshError;
            }
          }

          // Transform error responses
          if (response.status >= 400) {
            throw this.createError(response);
          }

          return response;
        } catch (error: any) {
          // Network errors
          if (!error.status) {
            throw {
              code: 'NETWORK_ERROR',
              message: error.message || 'Network request failed',
              retryable: true,
            } as BookmarkAIError;
          }
          throw error;
        }
      },
      this.configService.getConfig().retry
    );
  }

  /**
   * Set authentication tokens
   */
  async setTokens(tokens: TokenPair, expiresIn?: number): Promise<void> {
    await this.authService.setTokens(tokens, expiresIn);
  }

  /**
   * Clear authentication
   */
  async logout(): Promise<void> {
    await this.authService.clearTokens();
  }

  /**
   * Check if authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    return this.authService.isAuthenticated();
  }

  /**
   * Get the current access token
   */
  async getAccessToken(): Promise<string | null> {
    return this.authService.getAccessToken();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ClientConfig>): void {
    this.configService.updateConfig(config);
  }

  /**
   * Add a custom request interceptor
   */
  addRequestInterceptor(interceptor: any): () => void {
    return this.interceptorManager.addRequestInterceptor(interceptor);
  }

  /**
   * Add a custom response interceptor
   */
  addResponseInterceptor(interceptor: any): () => void {
    return this.interceptorManager.addResponseInterceptor(interceptor);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.devModeInterval) {
      clearInterval(this.devModeInterval);
    }
    this.authService.destroy();
    this.interceptorManager.clear();
    this.shares.destroy();
    this.health.destroy();
    this.events.destroy();
  }

  /**
   * Build full URL from path
   */
  private buildUrl(path: string): string {
    if (path.startsWith('http')) {
      return path; // Already full URL
    }

    const baseUrl = this.configService.getConfig().baseUrl;
    return `${baseUrl}${path}`;
  }

  /**
   * Create error from response
   */
  private createError(response: Response): BookmarkAIError {
    const data = response.data as any;
    
    return {
      code: data?.code || 'UNKNOWN_ERROR',
      message: data?.message || response.statusText,
      details: data?.details,
      status: response.status,
      retryable: data?.retryable || response.status >= 500,
      retryAfter: data?.retryAfter || 
        (response.headers['retry-after'] ? 
          parseInt(response.headers['retry-after']) : undefined),
    };
  }

  /**
   * Handle token refresh
   */
  private async refreshTokenHandler(refreshToken: string): Promise<TokenPair> {
    const response = await this.request<any>({
      url: '/auth/refresh',
      method: 'POST',
      data: { refreshToken },
    });

    // Handle nested response structure: { data: { data: { accessToken, refreshToken } } }
    const tokenData = response.data.data || response.data;
    
    if (!tokenData.accessToken || !tokenData.refreshToken) {
      throw new Error('Invalid refresh response: missing tokens');
    }

    return tokenData;
  }

  /**
   * Initialize API services
   */
  private initializeServices(): void {
    this.auth = new AuthApiService(this);
    this.shares = new SharesService(this, {
      enableBatching: false,
      batchWindow: 2000,
      maxBatchSize: 50,
    });
    this.health = new HealthService(this, {
      enableAutoCheck: false, // Let consumer decide
      checkInterval: 30000,
    });
    this.events = new EventsService(
      this.configService,
      this.authService,
      {
        reconnectInterval: 5000,
        maxReconnectAttempts: 5,
      }
    );
  }
}