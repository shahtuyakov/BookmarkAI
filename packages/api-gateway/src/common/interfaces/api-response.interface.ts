/**
 * Standard API response envelope as per ADR-012
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  meta?: ApiResponseMeta;
  error?: ApiError;
}

/**
 * API response metadata
 */
export interface ApiResponseMeta {
  requestId: string;
  version?: string;
  deprecation?: string;
  timestamp?: string;
}

/**
 * Standard API error structure
 */
export interface ApiError {
  code: string;
  message: string;
  details?: ApiErrorDetails;
  timestamp: string;
  traceId: string;
}

/**
 * API error details for additional context
 */
export interface ApiErrorDetails {
  field?: string;
  constraint?: string;
  suggestion?: string;
  [key: string]: unknown;
}

/**
 * Pagination response wrapper
 */
export interface PaginatedResponse<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
  limit: number;
  total?: number;
}

/**
 * Offset-based pagination response
 */
export interface OffsetPaginatedResponse<T> {
  items: T[];
  offset: number;
  limit: number;
  total: number;
}

/**
 * Batch operation response
 */
export interface BatchOperationResponse<T, E = unknown> {
  succeeded: T[];
  failed: BatchOperationError<E>[];
}

/**
 * Batch operation error item
 */
export interface BatchOperationError<E = unknown> {
  index: number;
  error: ApiError;
  item?: E;
}

/**
 * Async operation response
 */
export interface AsyncOperationResponse {
  operationId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  statusUrl: string;
  progress?: {
    current: number;
    total: number;
  };
  result?: unknown;
  error?: ApiError;
}

/**
 * Helper function to create success response
 */
export function successResponse<T>(data: T, meta?: ApiResponseMeta): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };
}

/**
 * Helper function to create error response
 */
export function errorResponse(
  error: Omit<ApiError, 'timestamp' | 'traceId'>,
  traceId: string,
): ApiResponse {
  return {
    success: false,
    error: {
      ...error,
      timestamp: new Date().toISOString(),
      traceId,
    },
  };
}
