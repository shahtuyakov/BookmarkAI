import { useQuery, useMutation, useQueryClient, UseQueryOptions, useInfiniteQuery, QueryClient } from '@tanstack/react-query';
import { useBookmarkClient, useSyncService } from '../contexts/SDKContext';
import { Share, CreateShareRequest, ShareListResponse } from '@bookmarkai/sdk';
import { useNetworkStatus } from './useNetworkStatus';
import { useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';

// Query keys
export const shareKeys = {
  all: ['shares'] as const,
  lists: () => [...shareKeys.all, 'list'] as const,
  list: (filters?: any) => [...shareKeys.lists(), filters] as const,
  infinite: (filters?: any) => [...shareKeys.lists(), 'infinite', filters] as const,
  details: () => [...shareKeys.all, 'detail'] as const,
  detail: (id: string) => [...shareKeys.details(), id] as const,
};

/**
 * Safely update cache for both regular and infinite queries
 * Handles Share Extension edge cases where cache might not be initialized
 */
function safelyUpdateSharesCache(
  queryClient: QueryClient,
  operation: 'add' | 'update',
  share: Share
) {
  try {
    // Update regular lists
    queryClient.setQueriesData<ShareListResponse>(
      { 
        queryKey: shareKeys.lists(),
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && 
                 key.includes('list') && 
                 !key.includes('infinite');
        }
      },
      (old: ShareListResponse | undefined) => {
        if (operation === 'add') {
          if (!old) return { items: [share], hasMore: false, cursor: undefined };
          return {
            ...old,
            items: [share, ...old.items],
          };
        } else {
          // update operation
          if (!old || !Array.isArray(old.items)) return old;
          return {
            ...old,
            items: old.items.map(item => 
              item.id === share.id ? share : item
            ),
          };
        }
      }
    );

    // Update infinite queries
    queryClient.setQueriesData(
      { 
        queryKey: shareKeys.infinite(),
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key.includes('infinite');
        }
      },
      (old: any) => {
        if (!old || !old.pages || !Array.isArray(old.pages)) {
          return old;
        }
        
        if (operation === 'add') {
          const newPages = [...old.pages];
          if (newPages.length > 0 && newPages[0] && Array.isArray(newPages[0].items)) {
            newPages[0] = {
              ...newPages[0],
              items: [share, ...newPages[0].items],
            };
          }
          return {
            ...old,
            pages: newPages,
          };
        } else {
          // update operation
          const newPages = old.pages.map((page: ShareListResponse) => {
            if (!page || !Array.isArray(page.items)) return page;
            return {
              ...page,
              items: page.items.map((item: Share) => 
                item.id === share.id ? share : item
              ),
            };
          });
          return {
            ...old,
            pages: newPages,
          };
        }
      }
    );
  } catch (error) {
    console.warn(`Failed to update shares cache (${operation}):`, error);
    
    // Fallback: just invalidate queries
    try {
      queryClient.invalidateQueries({ queryKey: shareKeys.lists() });
    } catch (invalidateError) {
      console.warn('Failed to invalidate queries as fallback:', invalidateError);
    }
  }
}

/**
 * Hook to fetch shares list
 */
export function useSharesList(
  params?: {
    cursor?: string;
    limit?: number;
    status?: Share['status'];
    platform?: Share['platform'];
  },
  options?: UseQueryOptions<ShareListResponse>
) {
  const client = useBookmarkClient();

  return useQuery({
    queryKey: shareKeys.list(params),
    queryFn: () => client.shares.list(params),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Hook to fetch shares with infinite scrolling
 */
export function useInfiniteSharesList(
  params?: {
    limit?: number;
    status?: Share['status'];
    platform?: Share['platform'];
  }
) {
  const client = useBookmarkClient();
  const { isConnected } = useNetworkStatus();

  const limit = params?.limit || 20; // Default to 20 items per page

  return useInfiniteQuery({
    queryKey: shareKeys.infinite(params),
    queryFn: ({ pageParam }: { pageParam?: string }) => 
      client.shares.list({
        ...params,
        cursor: pageParam,
        limit,
      }),
    getNextPageParam: (lastPage: ShareListResponse) => 
      lastPage.hasMore ? lastPage.cursor : undefined,
    getPreviousPageParam: () => undefined, // Backend doesn't support backward pagination
    initialPageParam: undefined, // Start with no cursor (first page)
    maxPages: 20, // Cache limit: 20 pages (400 items total)
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true, // Auto-refresh on app focus
    retry: 3, // Auto-retry attempts
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    enabled: isConnected, // Only fetch when connected
  });
}

/**
 * Hook to fetch a single share
 */
export function useShare(
  shareId: string,
  options?: UseQueryOptions<Share>
) {
  const client = useBookmarkClient();

  return useQuery({
    queryKey: shareKeys.detail(shareId),
    queryFn: () => client.shares.get(shareId),
    enabled: !!shareId,
    ...options,
  });
}

/**
 * Hook to fetch a single share by ID (alias for useShare with consistent naming)
 */
export function useShareById(
  shareId: string,
  options?: UseQueryOptions<Share>
) {
  const client = useBookmarkClient();
  const { isConnected } = useNetworkStatus();

  const queryResult = useQuery({
    queryKey: shareKeys.detail(shareId),
    queryFn: () => client.shares.get(shareId),
    enabled: !!shareId && isConnected,
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });

  const refresh = useCallback(async () => {
    console.log('🔄 useShareById: Manually refreshing share');
    const result = await queryResult.refetch();
    console.log('✅ useShareById: Manual refresh completed');
    return result;
  }, [queryResult]);

  return {
    ...queryResult,
    share: queryResult.data,
    isLoading: queryResult.isLoading,
    refresh,
    isRefreshing: queryResult.isFetching,
  };
}

/**
 * Hook to create a share with offline support
 */
export function useCreateShare() {
  const client = useBookmarkClient();
  const syncService = useSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateShareRequest) => {
      // Check network status
      const netInfo = await NetInfo.fetch();
      
      if (!netInfo.isConnected) {
        // Queue for offline processing
        await syncService.queueShare(request);
        
        // Return a mock share for optimistic UI
        return {
          id: `offline_${Date.now()}`,
          url: request.url,
          title: request.title,
          notes: request.notes,
          status: 'pending',
          platform: 'unknown',
          userId: 'offline',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Share;
      }

      // Online - create directly
      return client.shares.create(request);
    },
    onSuccess: (share) => {
      // Invalidate and refetch shares lists (both regular and infinite)
      queryClient.invalidateQueries({ queryKey: shareKeys.lists() });
      
      // Add the new share to detail cache immediately
      queryClient.setQueryData<Share>(
        shareKeys.detail(share.id),
        share
      );

      // Safely update both regular and infinite query caches
      safelyUpdateSharesCache(queryClient, 'add', share);
    },
    onError: (error: any) => {
      console.error('Failed to create share:', error);
      
      // If it's a network error, queue for later
      if (error.code === 'NETWORK_ERROR') {
        // The mutation function already handles this
      }
    },
  });
}

/**
 * Hook to process share and wait for completion
 */
export function useProcessShare() {
  const client = useBookmarkClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shareId, timeout = 30000 }: { shareId: string; timeout?: number }) => {
      return client.shares.waitForProcessing(shareId, { timeout });
    },
    onSuccess: (share) => {
      // Update the share in detail cache
      queryClient.setQueryData<Share>(
        shareKeys.detail(share.id),
        share
      );

      // Safely update both regular and infinite query caches
      safelyUpdateSharesCache(queryClient, 'update', share);
    },
  });
}

/**
 * Hook to get queued shares
 */
export function useQueuedShares() {
  const syncService = useSyncService();

  return useQuery({
    queryKey: ['queued-shares'],
    queryFn: () => {
      const shares = syncService.getQueuedShares();
      const stats = syncService.getQueueStats();
      return { shares, stats };
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}

/**
 * Hook to manually process queue
 */
export function useProcessQueue() {
  const syncService = useSyncService();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => syncService.processQueue(),
    onSuccess: () => {
      // Invalidate shares list to show newly synced items
      queryClient.invalidateQueries({ queryKey: shareKeys.lists() });
      // Invalidate queued shares
      queryClient.invalidateQueries({ queryKey: ['queued-shares'] });
    },
  });
}