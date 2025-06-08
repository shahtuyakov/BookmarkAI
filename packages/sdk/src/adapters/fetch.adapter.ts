import { NetworkAdapter, RequestConfig, Response } from './types';

export class FetchAdapter implements NetworkAdapter {
  async request<T = any>(config: RequestConfig): Promise<Response<T>> {
    const { url, method, headers = {}, params, data, timeout = 30000 } = config;

    // Build URL with query params
    const urlWithParams = params
      ? `${url}?${new URLSearchParams(params).toString()}`
      : url;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(urlWithParams, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseData = await response.json().catch(() => null);

      // Convert Headers to plain object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        data: responseData as T,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }

      throw error;
    }
  }
}