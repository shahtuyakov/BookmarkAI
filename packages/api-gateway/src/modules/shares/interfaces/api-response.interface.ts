/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
      code: string;
      message: string;
      details?: any;
    };
  }
  
  /**
   * Success response
   */
  export function successResponse<T>(data: T): ApiResponse<T> {
    return {
      success: true,
      data
    };
  }
  
  /**
   * Error response
   */
  export function errorResponse(code: string, message: string, details?: any): ApiResponse<any> {
    return {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {})
      }
    };
  }