import { ConfigService } from '../config';
import { AuthService } from './auth.service';

export interface EventHandler {
  (event: ServerEvent): void;
}

export interface ServerEvent {
  type: string;
  data: any;
  id?: string;
  retry?: number;
}

export interface EventsServiceConfig {
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class EventsService {
  private eventSource?: EventSource;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private isConnected = false;

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
    private config: EventsServiceConfig = {}
  ) {}

  /**
   * Connect to the SSE endpoint
   */
  async connect(): Promise<void> {
    if (this.eventSource) {
      return; // Already connected
    }

    const token = await this.authService.getAccessToken();
    if (!token) {
      throw new Error('Authentication required for events');
    }

    const baseUrl = this.configService.getConfig().baseUrl;
    const url = `${baseUrl}/events`;

    // EventSource doesn't support custom headers, so we use query param
    this.eventSource = new EventSource(`${url}?token=${encodeURIComponent(token)}`);

    this.eventSource.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected', { timestamp: new Date().toISOString() });
    };

    this.eventSource.onerror = (error) => {
      this.isConnected = false;
      this.emit('error', error);
      this.handleReconnect();
    };

    this.eventSource.onmessage = (event) => {
      try {
        const parsedEvent: ServerEvent = {
          type: event.type || 'message',
          data: JSON.parse(event.data),
          id: event.lastEventId,
        };

        this.emit(parsedEvent.type, parsedEvent.data);
        this.emit('*', parsedEvent); // Wildcard for all events
      } catch (error) {
        console.error('Failed to parse SSE event:', error);
      }
    };

    // Add specific event type listeners
    this.addEventTypeListener('cache-invalidation');
    this.addEventTypeListener('share-processed');
    this.addEventTypeListener('system-notification');
  }

  /**
   * Disconnect from SSE
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
      this.isConnected = false;
      this.emit('disconnected', { timestamp: new Date().toISOString() });
    }
  }

  /**
   * Subscribe to a specific event type
   */
  on(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    this.handlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(eventType);
        }
      }
    };
  }

  /**
   * Subscribe to a specific event type (once)
   */
  once(eventType: string, handler: EventHandler): () => void {
    const wrappedHandler: EventHandler = (event) => {
      handler(event);
      unsubscribe();
    };

    const unsubscribe = this.on(eventType, wrappedHandler);
    return unsubscribe;
  }

  /**
   * Check if connected
   */
  isConnectedToServer(): boolean {
    return this.isConnected;
  }

  /**
   * Emit an event to all handlers
   */
  private emit(eventType: string, data: any): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler({ type: eventType, data });
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Add event listener for specific type
   */
  private addEventTypeListener(eventType: string): void {
    if (this.eventSource) {
      this.eventSource.addEventListener(eventType, (event: any) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(eventType, data);
        } catch (error) {
          console.error(`Failed to parse ${eventType} event:`, error);
        }
      });
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    const maxAttempts = this.config.maxReconnectAttempts || 5;
    const reconnectInterval = this.config.reconnectInterval || 5000;

    if (this.reconnectAttempts >= maxAttempts) {
      this.emit('max-reconnect-attempts', { attempts: this.reconnectAttempts });
      return;
    }

    this.reconnectAttempts++;
    const delay = reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      this.disconnect();
      this.connect().catch(error => {
        console.error('Failed to reconnect:', error);
      });
    }, delay);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.disconnect();
    this.handlers.clear();
  }
}