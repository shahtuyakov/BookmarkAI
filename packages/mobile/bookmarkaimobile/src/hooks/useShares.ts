import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { useBookmarkClient, useSyncService } from '../contexts/SDKContext';
import { Share, CreateShareRequest, ShareListResponse } from '@bookmarkai/sdk';
import NetInfo from '@react-native-community/netinfo';

// Query keys
export const shareKeys = {
  all: ['shares'] as const,
  lists: () => [...shareKeys.all, 'list'] as const,
  list: (filters?: any) => [...shareKeys.lists(), filters] as const,
  details: () => [...shareKeys.all, 'detail'] as const,
  detail: (id: string) => [...shareKeys.details(), id] as const,
};

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
      // Invalidate and refetch shares list
      queryClient.invalidateQueries({ queryKey: shareKeys.lists() });
      
      // Add the new share to cache immediately
      queryClient.setQueryData<Share>(
        shareKeys.detail(share.id),
        share
      );

      // Optimistically update lists
      queryClient.setQueriesData<ShareListResponse>(
        { queryKey: shareKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: [share, ...old.items],
          };
        }
      );
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
      // Update the share in cache
      queryClient.setQueryData<Share>(
        shareKeys.detail(share.id),
        share
      );

      // Update in list cache
      queryClient.setQueriesData<ShareListResponse>(
        { queryKey: shareKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map(item => 
              item.id === share.id ? share : item
            ),
          };
        }
      );
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