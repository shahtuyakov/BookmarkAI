/**
 * Interface for paginated responses
 */
export interface PaginatedData<T> {
    items: T[];
    cursor?: string;
    hasMore: boolean;
    total?: number;
    limit: number;
  }