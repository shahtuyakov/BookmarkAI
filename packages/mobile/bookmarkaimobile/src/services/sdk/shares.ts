// SDK-based shares service that maintains compatibility with existing interface
// while leveraging SDK features for improved reliability

import { BookmarkAIClient } from '@bookmarkai/sdk';
import { Share as SDKShare, CreateShareRequest } from '@bookmarkai/sdk';

// Map SDK Share interface to app's expected interface
export interface Share {
  id: string;
  url: string;
  platform: 'tiktok' | 'reddit' | 'twitter' | 'x' | 'unknown';
  status: 'pending' | 'processing' | 'done' | 'error';
  createdAt: string;
  updatedAt: string;
  userId?: string; // Add missing property from SDK type
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

// Transform SDK Share to app Share format
const transformSDKShare = (sdkShare: SDKShare): Share => ({
  id: sdkShare.id,
  url: sdkShare.url,
  platform: sdkShare.platform as Share['platform'],
  status: sdkShare.status === 'failed' ? 'error' : sdkShare.status as Share['status'],
  createdAt: sdkShare.createdAt,
  updatedAt: sdkShare.updatedAt,
  metadata: sdkShare.metadata ? {
    author: (sdkShare.metadata as any)?.author,
    title: (sdkShare.metadata as any)?.title || sdkShare.title,
    description: (sdkShare.metadata as any)?.description,
    thumbnailUrl: (sdkShare.metadata as any)?.thumbnailUrl,
  } : undefined,
});

export const createSDKSharesService = (client: BookmarkAIClient) => {
  return {
    // Get all shares with pagination
    getShares: async (params?: GetSharesParams): Promise<PaginatedResponse<Share>> => {
      console.log('📡 [SDK Shares] Fetching shares with params:', params);
      try {
        const response = await client.shares.list({
          cursor: params?.cursor,
          limit: params?.limit || 20,
          status: params?.status as SDKShare['status'],
          platform: params?.platform as SDKShare['platform'],
        });

        console.log('✅ [SDK Shares] Shares fetched successfully:', {
          count: response.items.length,
          hasMore: response.hasMore,
          cursor: response.cursor
        });

        return {
          items: response.items.map(transformSDKShare),
          cursor: response.cursor,
          hasMore: response.hasMore,
          limit: params?.limit || 20,
        };
      } catch (error) {
        console.error('❌ [SDK Shares] getShares failed:', error);
        throw error;
      }
    },

    // Get a specific share by ID
    getShareById: async (id: string): Promise<Share> => {
      console.log('📡 [SDK Shares] Fetching share by ID:', id);
      try {
        const sdkShare = await client.shares.get(id);
        console.log('✅ [SDK Shares] Share fetched successfully:', sdkShare.id);
        return transformSDKShare(sdkShare);
      } catch (error) {
        console.error('❌ [SDK Shares] getShareById failed:', error);
        throw error;
      }
    },

    // Create a new share
    createShare: async (url: string, idempotencyKey?: string): Promise<Share> => {
      try {
        const request: CreateShareRequest = { url };
        const sdkShare = await client.shares.create(request, idempotencyKey);
        return transformSDKShare(sdkShare);
      } catch (error) {
        console.error('SDK Shares: createShare failed:', error);
        throw error;
      }
    },
  };
};