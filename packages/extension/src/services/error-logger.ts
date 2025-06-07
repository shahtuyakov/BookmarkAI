import browser from 'webextension-polyfill';
import { getFeatureFlag } from '../config/features';

export interface ErrorLogEntry {
  timestamp: number;
  url: string;
  error: string;
  type: 'CSP' | 'NETWORK' | 'AUTH' | 'GENERAL' | 'SDK';
  details?: any;
  stack?: string;
  userAgent?: string;
  extensionVersion?: string;
  isUsingSDK?: boolean;
}

class ErrorLogger {
  private static instance: ErrorLogger;
  private errorLogs: ErrorLogEntry[] = [];
  private readonly MAX_ERROR_LOGS = 100;
  private isUsingSDK: boolean = false;

  private constructor() {
    this.initializeLogger();
  }

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  private async initializeLogger() {
    // Check if we should use SDK features
    this.isUsingSDK = await getFeatureFlag('USE_SDK_AUTH');
    
    // Restore error logs from storage
    try {
      const stored = await browser.storage.local.get('errorLogs');
      if (stored.errorLogs && Array.isArray(stored.errorLogs)) {
        this.errorLogs = stored.errorLogs;
      }
    } catch (error) {
      console.error('Failed to restore error logs:', error);
    }

    // Set up global error handler for unhandled errors
    this.setupGlobalErrorHandler();
  }

  private setupGlobalErrorHandler() {
    // In service worker context
    if (typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in self) {
      self.addEventListener('error', (event) => {
        this.logError('GENERAL', 'service-worker', event.message, {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        });
      });

      self.addEventListener('unhandledrejection', (event) => {
        this.logError('GENERAL', 'service-worker', 'Unhandled promise rejection', {
          reason: event.reason,
          stack: event.reason?.stack,
        });
      });
    }
  }

  public async logError(
    type: ErrorLogEntry['type'],
    url: string,
    error: string,
    details?: any
  ): Promise<void> {
    try {
      const manifest = browser.runtime.getManifest();
      
      const errorLog: ErrorLogEntry = {
        timestamp: Date.now(),
        url,
        error,
        type,
        details,
        stack: details?.stack,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        extensionVersion: manifest.version,
        isUsingSDK: this.isUsingSDK,
      };

      // Add to local logs
      this.errorLogs.push(errorLog);

      // Keep only the latest errors
      if (this.errorLogs.length > this.MAX_ERROR_LOGS) {
        this.errorLogs = this.errorLogs.slice(-this.MAX_ERROR_LOGS);
      }

      // Store in browser storage
      await browser.storage.local.set({ errorLogs: this.errorLogs });

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.error(`[BookmarkAI ${type}] Error:`, error, details);
      }

      // TODO: Send to remote logging service (Sentry) when implemented
      // if (this.isUsingSDK && type !== 'CSP') {
      //   await this.sendToSentry(errorLog);
      // }

    } catch (err) {
      // Don't throw from error logger
      console.error('Failed to log error:', err);
    }
  }

  public async getErrorLogs(): Promise<ErrorLogEntry[]> {
    return [...this.errorLogs];
  }

  public async clearErrorLogs(): Promise<void> {
    this.errorLogs = [];
    await browser.storage.local.remove('errorLogs');
  }

  public async getErrorStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    last24Hours: number;
    mostCommon: Array<{ error: string; count: number }>;
  }> {
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);

    const stats = {
      total: this.errorLogs.length,
      byType: {} as Record<string, number>,
      last24Hours: 0,
      mostCommon: [] as Array<{ error: string; count: number }>,
    };

    const errorCounts = new Map<string, number>();

    for (const log of this.errorLogs) {
      // Count by type
      stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;

      // Count last 24 hours
      if (log.timestamp >= dayAgo) {
        stats.last24Hours++;
      }

      // Count error frequency
      const errorKey = `${log.type}:${log.error}`;
      errorCounts.set(errorKey, (errorCounts.get(errorKey) || 0) + 1);
    }

    // Get most common errors
    stats.mostCommon = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return stats;
  }

  // Enhanced error handler for SDK operations
  public wrapSDKCall<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    return operation().catch(async (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = {
        context,
        code: error.code,
        status: error.status,
        response: error.response,
        stack: error instanceof Error ? error.stack : undefined,
      };

      await this.logError('SDK', context, errorMessage, errorDetails);
      throw error;
    });
  }
}

export const errorLogger = ErrorLogger.getInstance();