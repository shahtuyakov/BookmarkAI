/**
 * Network Status Service for Browser Extension
 * Provides enhanced network connectivity detection and monitoring
 * Supports offline queueing decisions and automatic sync triggers
 */

export type NetworkStatus = 'online' | 'offline' | 'checking';

export interface NetworkStatusListener {
  (status: NetworkStatus): void;
}

export class NetworkStatusService {
  private static instance: NetworkStatusService | null = null;
  private currentStatus: NetworkStatus = 'checking';
  private listeners: Set<NetworkStatusListener> = new Set();
  private checkTimer: NodeJS.Timeout | null = null;
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string = '') {
    this.apiBaseUrl = apiBaseUrl;
    this.initialize();
  }

  /**
   * Get singleton instance
   */
  static getInstance(apiBaseUrl?: string): NetworkStatusService {
    if (!NetworkStatusService.instance) {
      NetworkStatusService.instance = new NetworkStatusService(apiBaseUrl);
    }
    return NetworkStatusService.instance;
  }

  /**
   * Initialize network monitoring
   */
  private initialize(): void {
    // Set initial status based on navigator.onLine
    this.currentStatus = navigator.onLine ? 'online' : 'offline';

    // Listen to browser online/offline events
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));

    // Perform initial connectivity check
    this.checkConnectivity();

    // Schedule periodic connectivity checks (every 30 seconds when offline)
    this.schedulePeriodicCheck();

    console.log('NetworkStatusService: Initialized with status:', this.currentStatus);
  }

  /**
   * Handle browser online event
   */
  private handleOnline(): void {
    console.log('NetworkStatusService: Browser reports online');
    // Verify actual connectivity before updating status
    this.checkConnectivity();
  }

  /**
   * Handle browser offline event
   */
  private handleOffline(): void {
    console.log('NetworkStatusService: Browser reports offline');
    this.updateStatus('offline');
  }

  /**
   * Check actual connectivity by attempting API request
   */
  private async checkConnectivity(): Promise<void> {
    if (!navigator.onLine) {
      this.updateStatus('offline');
      return;
    }

    this.updateStatus('checking');

    try {
      // Try to reach the API health endpoint
      const healthUrl = this.apiBaseUrl ? `${this.apiBaseUrl}/healthz` : '/healthz';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-cache',
        mode: 'cors',
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.updateStatus('online');
        console.log('NetworkStatusService: API connectivity confirmed');
      } else {
        console.warn('NetworkStatusService: API returned non-OK status:', response.status);
        this.updateStatus('offline');
      }
    } catch (error: any) {
      console.warn('NetworkStatusService: API connectivity check failed:', error.message);
      
      // If it's just an abort error, we might still be online but API is unreachable
      if (error.name === 'AbortError') {
        // Try a simple network test (like fetching a well-known endpoint)
        try {
          await fetch('https://httpbin.org/status/200', {
            method: 'HEAD',
            mode: 'no-cors',
            signal: AbortSignal.timeout(3000),
          });
          // If we can reach external service, we're online but API might be down
          this.updateStatus('online');
          console.log('NetworkStatusService: General internet connectivity confirmed');
        } catch {
          this.updateStatus('offline');
        }
      } else {
        this.updateStatus('offline');
      }
    }
  }

  /**
   * Update network status and notify listeners
   */
  private updateStatus(newStatus: NetworkStatus): void {
    if (this.currentStatus !== newStatus) {
      const previousStatus = this.currentStatus;
      this.currentStatus = newStatus;
      
      console.log(`NetworkStatusService: Status changed from ${previousStatus} to ${newStatus}`);
      
      // Notify all listeners
      this.listeners.forEach(listener => {
        try {
          listener(newStatus);
        } catch (error) {
          console.error('NetworkStatusService: Error in status listener:', error);
        }
      });

      // Adjust periodic check frequency based on status
      this.schedulePeriodicCheck();
    }
  }

  /**
   * Schedule periodic connectivity checks
   */
  private schedulePeriodicCheck(): void {
    // Clear existing timer
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
    }

    // Schedule next check based on current status
    let checkInterval: number;
    
    switch (this.currentStatus) {
      case 'offline':
        checkInterval = 30000; // Check every 30 seconds when offline
        break;
      case 'online':
        checkInterval = 300000; // Check every 5 minutes when online
        break;
      case 'checking':
        checkInterval = 10000; // Check every 10 seconds when checking
        break;
    }

    this.checkTimer = setTimeout(() => {
      this.checkConnectivity();
    }, checkInterval);
  }

  /**
   * Get current network status
   */
  getStatus(): NetworkStatus {
    return this.currentStatus;
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.currentStatus === 'online';
  }

  /**
   * Check if currently offline
   */
  isOffline(): boolean {
    return this.currentStatus === 'offline';
  }

  /**
   * Check if status is being determined
   */
  isChecking(): boolean {
    return this.currentStatus === 'checking';
  }

  /**
   * Add a status change listener
   */
  addListener(listener: NetworkStatusListener): void {
    this.listeners.add(listener);
    // Immediately notify the listener of current status
    listener(this.currentStatus);
  }

  /**
   * Remove a status change listener
   */
  removeListener(listener: NetworkStatusListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Force a connectivity check
   */
  async forceCheck(): Promise<NetworkStatus> {
    await this.checkConnectivity();
    return this.currentStatus;
  }

  /**
   * Update API base URL for connectivity checks
   */
  updateApiBaseUrl(newUrl: string): void {
    this.apiBaseUrl = newUrl;
    console.log('NetworkStatusService: Updated API base URL:', newUrl);
    // Trigger immediate connectivity check with new URL
    this.checkConnectivity();
  }

  /**
   * Get detailed network information (if available)
   */
  getNetworkInfo(): any {
    const info: any = {
      status: this.currentStatus,
      navigatorOnLine: navigator.onLine,
      timestamp: Date.now(),
    };

    // Add connection info if available (Chrome/Edge)
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      info.connection = {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData,
      };
    }

    // Add network timing if available
    if ('performance' in window && 'getEntriesByType' in performance) {
      try {
        const navigation = performance.getEntriesByType('navigation')[0] as any;
        if (navigation) {
          info.timing = {
            domainLookupTime: navigation.domainLookupEnd - navigation.domainLookupStart,
            connectTime: navigation.connectEnd - navigation.connectStart,
            responseTime: navigation.responseEnd - navigation.responseStart,
          };
        }
      } catch (error) {
        // Ignore timing errors
      }
    }

    return info;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Remove event listeners
    window.removeEventListener('online', this.handleOnline.bind(this));
    window.removeEventListener('offline', this.handleOffline.bind(this));

    // Clear timer
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }

    // Clear listeners
    this.listeners.clear();

    NetworkStatusService.instance = null;
    console.log('NetworkStatusService: Service destroyed');
  }
}

// Export singleton instance factory
export function createNetworkStatusService(apiBaseUrl?: string): NetworkStatusService {
  return NetworkStatusService.getInstance(apiBaseUrl);
}