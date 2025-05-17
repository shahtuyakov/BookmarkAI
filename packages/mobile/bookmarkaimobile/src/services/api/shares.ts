import apiClient from './client';

export interface Share {
  id: string;
  url: string;
  platform: 'tiktok' | 'reddit' | 'twitter' | 'x';
  status: 'pending' | 'processing' | 'done' | 'error';
  createdAt: string;
  updatedAt: string;
  metadata?: {
    author?: string;
    title?: string;
    description?: string;
    thumbnailUrl?: string;
  };
}

export interface GetSharesParams {
  cursor?: string;
  limit?: number;
  platform?: string;
  status?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  cursor?: string;
  hasMore: boolean;
  limit: number;
}

export const sharesAPI = {
  // Get all shares with pagination
  getShares: async (params?: GetSharesParams): Promise<PaginatedResponse<Share>> => {
    const response = await apiClient.get<{data: PaginatedResponse<Share>}>('/v1/shares', { params });
    return response.data.data;
  },
  
  // Get a specific share by ID
  getShareById: async (id: string): Promise<Share> => {
    const response = await apiClient.get<{data: Share}>(`/v1/shares/${id}`);
    return response.data.data;
  },
  
  // Create a new share
  createShare: async (url: string, idempotencyKey: string): Promise<Share> => {
    const response = await apiClient.post<{data: Share}>(
      '/v1/shares',
      { url },
      {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      }
    );
    return response.data.data;
  },
};
