import { RequestInterceptor } from './types';
import { RequestConfig } from '../adapters/types';
import { AuthService } from '../services/auth.service';

/**
 * Interceptor that adds authentication headers to requests
 */
export class AuthInterceptor implements RequestInterceptor {
  constructor(private authService: AuthService) {}

  async onRequest(config: RequestConfig): Promise<RequestConfig> {
    // Skip auth header for auth endpoints
    if (config.url.includes('/auth/login') || 
        config.url.includes('/auth/refresh')) {
      return config;
    }

    const accessToken = await this.authService.getAccessToken();
    
    if (accessToken) {
      return {
        ...config,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      };
    }

    return config;
  }
}