import { RequestConfig, Response } from '../adapters/types';

export interface RequestInterceptor {
  onRequest(config: RequestConfig): Promise<RequestConfig> | RequestConfig;
  onRequestError?(error: any): Promise<any> | any;
}

export interface ResponseInterceptor {
  onResponse<T>(response: Response<T>): Promise<Response<T>> | Response<T>;
  onResponseError?(error: any): Promise<any> | any;
}

export type Interceptor = RequestInterceptor | ResponseInterceptor;

export class InterceptorManager {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  /**
   * Add a request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.requestInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Add a response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.responseInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Apply request interceptors
   */
  async applyRequestInterceptors(config: RequestConfig): Promise<RequestConfig> {
    let finalConfig = config;

    for (const interceptor of this.requestInterceptors) {
      try {
        finalConfig = await interceptor.onRequest(finalConfig);
      } catch (error) {
        if (interceptor.onRequestError) {
          finalConfig = await interceptor.onRequestError(error);
        } else {
          throw error;
        }
      }
    }

    return finalConfig;
  }

  /**
   * Apply response interceptors
   */
  async applyResponseInterceptors<T>(response: Response<T>): Promise<Response<T>> {
    let finalResponse = response;

    for (const interceptor of this.responseInterceptors) {
      try {
        finalResponse = await interceptor.onResponse(finalResponse);
      } catch (error) {
        if (interceptor.onResponseError) {
          finalResponse = await interceptor.onResponseError(error);
        } else {
          throw error;
        }
      }
    }

    return finalResponse;
  }

  /**
   * Clear all interceptors
   */
  clear(): void {
    this.requestInterceptors = [];
    this.responseInterceptors = [];
  }
}