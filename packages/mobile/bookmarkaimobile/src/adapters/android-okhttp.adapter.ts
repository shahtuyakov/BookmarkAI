import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type { NetworkAdapter, NetworkRequest, NetworkResponse } from '@bookmarkai/sdk';

/**
 * Android OkHttp Network Adapter
 * Uses native OkHttp library for optimal Android performance
 */

interface OkHttpNetworkAdapterNative {
  request(config: OkHttpRequestConfig): Promise<OkHttpResponse>;
  cancelRequest(requestId: string): Promise<boolean>;
  cancelAllRequests(): Promise<number>;
  getAdapterInfo(): Promise<OkHttpAdapterInfo>;
  testAdapter(testUrl?: string): Promise<OkHttpTestResult>;
  readonly PLATFORM: string;
  readonly ADAPTER_NAME: string;
  readonly SUPPORTS_CERTIFICATE_PINNING: boolean;
  readonly SUPPORTS_PROGRESS_TRACKING: boolean;
  readonly SUPPORTS_CANCELLATION: boolean;
  readonly EVENTS: string[];
}

interface OkHttpRequestConfig {
  requestId?: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  priority?: 'high' | 'normal' | 'low';
}

interface OkHttpResponse {
  requestId: string;
  status: number;
  statusText: string;
  ok: boolean;
  data: string;
  headers: Record<string, string>;
  responseTime: number;
  isRedirect: boolean;
  networkInfo: {
    networkStatus?: number;
    protocol?: string;
    fromCache?: boolean;
  };
}

interface OkHttpAdapterInfo {
  name: string;
  version: string;
  supportsCertificatePinning: boolean;
  supportsProgressTracking: boolean;
  supportsCancellation: boolean;
  supportsConnectionPooling: boolean;
  activeRequests: number;
  connectionPoolSize: number;
}

interface OkHttpTestResult {
  success: boolean;
  statusCode: number;
  statusMessage: string;
  isRedirect: boolean;
  responseTime: number;
}

interface ProgressEvent {
  requestId: string;
  bytesTransferred: number;
  totalBytes: number;
  progress: number;
  type: 'upload' | 'download';
}

// Get native module
const OkHttpNetworkAdapterNative = NativeModules.OkHttpNetworkAdapter as OkHttpNetworkAdapterNative;

/**
 * Android OkHttp Network Adapter implementation
 */
export class AndroidOkHttpAdapter implements NetworkAdapter {
  private eventEmitter: NativeEventEmitter | null = null;
  private progressListeners = new Map<string, (event: ProgressEvent) => void>();
  private requestIdCounter = 0;

  constructor() {
    if (Platform.OS === 'android' && OkHttpNetworkAdapterNative) {
      this.eventEmitter = new NativeEventEmitter(OkHttpNetworkAdapterNative as any);
      this.setupEventListeners();
    }
  }

  /**
   * Check if OkHttp adapter is available
   */
  static isAvailable(): boolean {
    return Platform.OS === 'android' && !!OkHttpNetworkAdapterNative;
  }

  /**
   * Get adapter information
   */
  async getInfo(): Promise<OkHttpAdapterInfo> {
    if (!this.isSupported()) {
      throw new Error('OkHttp adapter not available on this platform');
    }
    return await OkHttpNetworkAdapterNative.getAdapterInfo();
  }

  /**
   * Test adapter functionality
   */
  async test(testUrl?: string): Promise<OkHttpTestResult> {
    if (!this.isSupported()) {
      throw new Error('OkHttp adapter not available on this platform');
    }
    return await OkHttpNetworkAdapterNative.testAdapter(testUrl);
  }

  /**
   * Check if adapter is supported
   */
  private isSupported(): boolean {
    return AndroidOkHttpAdapter.isAvailable();
  }

  /**
   * Setup event listeners for progress tracking
   */
  private setupEventListeners(): void {
    if (!this.eventEmitter) return;

    // Upload progress
    this.eventEmitter.addListener('OkHttpUploadProgress', (event: ProgressEvent) => {
      const listener = this.progressListeners.get(event.requestId);
      if (listener) {
        listener(event);
      }
    });

    // Download progress
    this.eventEmitter.addListener('OkHttpDownloadProgress', (event: ProgressEvent) => {
      const listener = this.progressListeners.get(event.requestId);
      if (listener) {
        listener(event);
      }
    });
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `okhttp_${Date.now()}_${++this.requestIdCounter}`;
  }

  /**
   * Convert SDK NetworkRequest to OkHttp config
   */
  private convertRequest(request: NetworkRequest): OkHttpRequestConfig {
    const requestId = this.generateRequestId();
    
    return {
      requestId,
      url: request.url,
      method: request.method || 'GET',
      headers: request.headers || {},
      body: request.body ? JSON.stringify(request.body) : undefined,
      timeout: request.timeout,
      priority: this.mapPriority(request.priority)
    };
  }

  /**
   * Map SDK priority to OkHttp priority
   */
  private mapPriority(priority?: string): 'high' | 'normal' | 'low' {
    switch (priority?.toLowerCase()) {
      case 'high':
      case 'urgent':
        return 'high';
      case 'low':
      case 'background':
        return 'low';
      default:
        return 'normal';
    }
  }

  /**
   * Convert OkHttp response to SDK NetworkResponse
   */
  private convertResponse(response: OkHttpResponse): NetworkResponse {
    let data: any;
    
    try {
      // Try to parse as JSON first
      data = JSON.parse(response.data);
    } catch {
      // If not JSON, return as string
      data = response.data;
    }

    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      data,
      headers: response.headers,
      metadata: {
        responseTime: response.responseTime,
        isRedirect: response.isRedirect,
        networkInfo: response.networkInfo,
        adapter: 'OkHttp',
        platform: 'android'
      }
    };
  }

  /**
   * Make HTTP request using OkHttp
   */
  async request(request: NetworkRequest): Promise<NetworkResponse> {
    if (!this.isSupported()) {
      throw new Error('OkHttp adapter not available - falling back to fetch');
    }

    try {
      console.log(`🚀 OkHttp: ${request.method || 'GET'} ${request.url}`);
      
      const config = this.convertRequest(request);
      
      // Setup progress tracking if requested
      if (request.onProgress) {
        this.progressListeners.set(config.requestId!, (event: ProgressEvent) => {
          request.onProgress?.({
            loaded: event.bytesTransferred,
            total: event.totalBytes,
            progress: event.progress,
            type: event.type
          });
        });
      }

      const response = await OkHttpNetworkAdapterNative.request(config);
      
      // Cleanup progress listener
      if (config.requestId) {
        this.progressListeners.delete(config.requestId);
      }

      const networkResponse = this.convertResponse(response);
      
      console.log(`✅ OkHttp: ${response.status} ${request.url} (${response.responseTime}ms)`);
      
      return networkResponse;

    } catch (error: any) {
      console.error(`❌ OkHttp: ${request.method || 'GET'} ${request.url} failed:`, error.message);
      
      // Convert native errors to standard format
      throw new Error(`OkHttp request failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Cancel specific request
   */
  async cancelRequest(requestId: string): Promise<boolean> {
    if (!this.isSupported()) {
      return false;
    }

    try {
      const cancelled = await OkHttpNetworkAdapterNative.cancelRequest(requestId);
      this.progressListeners.delete(requestId);
      return cancelled;
    } catch (error) {
      console.error('Failed to cancel OkHttp request:', error);
      return false;
    }
  }

  /**
   * Cancel all pending requests
   */
  async cancelAllRequests(): Promise<number> {
    if (!this.isSupported()) {
      return 0;
    }

    try {
      const cancelledCount = await OkHttpNetworkAdapterNative.cancelAllRequests();
      this.progressListeners.clear();
      return cancelledCount;
    } catch (error) {
      console.error('Failed to cancel all OkHttp requests:', error);
      return 0;
    }
  }

  /**
   * Cleanup adapter resources
   */
  destroy(): void {
    this.progressListeners.clear();
    
    if (this.eventEmitter) {
      this.eventEmitter.removeAllListeners('OkHttpUploadProgress');
      this.eventEmitter.removeAllListeners('OkHttpDownloadProgress');
    }
  }
}

/**
 * Factory function to create Android OkHttp adapter
 */
export function createAndroidOkHttpAdapter(): AndroidOkHttpAdapter | null {
  if (!AndroidOkHttpAdapter.isAvailable()) {
    console.warn('OkHttp adapter not available on this platform');
    return null;
  }

  try {
    return new AndroidOkHttpAdapter();
  } catch (error) {
    console.error('Failed to create OkHttp adapter:', error);
    return null;
  }
}