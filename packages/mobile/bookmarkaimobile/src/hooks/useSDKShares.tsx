import { useCallback } from 'react';
import { 
  useQuery, 
  useMutation, 
  useQueryClient, 
  useInfiniteQuery,
  InfiniteData 
} from '@tanstack/react-query';
import { useNetworkStatus } from './useNetworkStatus';
import { Share, GetSharesParams, PaginatedResponse, createSDKSharesService } from '../services/sdk/shares';
import { BookmarkAIClient } from '@bookmarkai/sdk';
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Keys for querying shares (compatible with existing keys)
export const sharesKeys = {
  all: ['shares'] as const,
  lists: () => [...sharesKeys.all, 'list'] as const,
  list: (filters: GetSharesParams) => 
    [...sharesKeys.lists(), filters] as const,
  details: () => [...sharesKeys.all, 'detail'] as const,
  detail: (id: string) => [...sharesKeys.details(), id] as const,
};

// Key for pending shares queue
const PENDING_SHARES_KEY = 'bookmarkai-pending-shares';

interface PendingShare {
  id: string;
  url: string;
  idempotencyKey: string;
  timestamp: number;
}

export function useSDKSharesList(client: BookmarkAIClient, params: GetSharesParams = {}) {
  const { isConnected } = useNetworkStatus();
  const sharesService = createSDKSharesService(client);
  
  const queryResult = useInfiniteQuery<
    PaginatedResponse<Share>,
    Error,
    InfiniteData<PaginatedResponse<Share>>,
    readonly ['shares', 'list', GetSharesParams],
    string | undefined
  >({
    queryKey: sharesKeys.list(params),
    queryFn: async ({ pageParam }) => {
      const queryParams = { 
        ...params,
        cursor: pageParam
      };
      return await sharesService.getShares(queryParams);
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: isConnected,
    meta: {
      persist: true,
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
  
  const shares = queryResult.data?.pages.flatMap(page => page.items) || [];
  
  const isLoading = queryResult.isLoading || 
    (queryResult.isFetching && !queryResult.isFetchingNextPage && shares.length === 0);
  
  const refresh = useCallback(async () => {
    console.log('🔄 SDK useSharesList: Manually refreshing shares list');
    const result = await queryResult.refetch();
    console.log('✅ SDK useSharesList: Manual refresh completed');
    return result;
  }, [queryResult]);
  
  return {
    ...queryResult,
    shares,
    isLoading,
    refresh,
    isRefreshing: queryResult.isFetching && !queryResult.isFetchingNextPage,
  };
}

export function useSDKShareById(client: BookmarkAIClient, id: string) {
  const { isConnected } = useNetworkStatus();
  const sharesService = createSDKSharesService(client);
  
  const queryResult = useQuery({
    queryKey: sharesKeys.detail(id),
    queryFn: async () => await sharesService.getShareById(id),
    enabled: !!id && isConnected,
    meta: {
      persist: true,
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
  });
  
  const refresh = useCallback(async () => {
    return await queryResult.refetch();
  }, [queryResult]);
  
  return {
    ...queryResult,
    share: queryResult.data,
    refresh,
    isRefreshing: queryResult.isFetching,
  };
}

export function useSDKCreateShare(client: BookmarkAIClient) {
  console.log('🏗️ SDK useCreateShare hook initialized');
  
  const queryClient = useQueryClient();
  const { isConnected } = useNetworkStatus();
  const sharesService = createSDKSharesService(client);
  
  const loadPendingShares = async (): Promise<PendingShare[]> => {
    try {
      const pendingData = await AsyncStorage.getItem(PENDING_SHARES_KEY);
      if (pendingData) {
        return JSON.parse(pendingData);
      }
    } catch (error) {
      console.error('Error loading pending shares:', error);
    }
    return [];
  };
  
  const savePendingShares = async (pendingShares: PendingShare[]) => {
    try {
      await AsyncStorage.setItem(PENDING_SHARES_KEY, JSON.stringify(pendingShares));
    } catch (error) {
      console.error('Error saving pending shares:', error);
    }
  };
  
  const addToPendingQueue = async (url: string): Promise<PendingShare> => {
    const pendingShares = await loadPendingShares();
    
    const newPendingShare: PendingShare = {
      id: uuidv4(),
      url,
      idempotencyKey: uuidv4(),
      timestamp: Date.now(),
    };
    
    await savePendingShares([...pendingShares, newPendingShare]);
    return newPendingShare;
  };
  
  const removeFromPendingQueue = async (id: string) => {
    const pendingShares = await loadPendingShares();
    const updatedShares = pendingShares.filter(share => share.id !== id);
    await savePendingShares(updatedShares);
  };
  
  const syncPendingShares = async () => {
    const pendingShares = await loadPendingShares();
    
    if (pendingShares.length === 0) return;
    
    for (const pendingShare of pendingShares) {
      try {
        await sharesService.createShare(pendingShare.url, pendingShare.idempotencyKey);
        await removeFromPendingQueue(pendingShare.id);
      } catch (error) {
        console.error('Failed to sync pending share:', error);
      }
    }
    
    // Invalidate and refetch after syncing
    await queryClient.invalidateQueries({ queryKey: sharesKeys.lists() });
  };
  
  NetInfo.addEventListener(state => {
    if (state.isConnected) {
      syncPendingShares();
    }
  });
  
  const mutation = useMutation({
    mutationFn: async ({ url }: { url: string }) => {
      console.log(`🚀 SDK Creating share for URL: ${url}`);
      console.log(`📶 Network connected: ${isConnected}`);
      
      if (!isConnected) {
        console.log('📴 Offline - adding to pending queue');
        const pendingShare = await addToPendingQueue(url);
        
        return {
          id: pendingShare.id,
          url: pendingShare.url,
          platform: detectPlatformFromUrl(url),
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          _isPending: true,
        } as Share;
      }
      
      console.log('🌐 Online - making SDK call');
      const idempotencyKey = uuidv4();
      console.log(`🔑 Idempotency key: ${idempotencyKey}`);
      
      try {
        const result = await sharesService.createShare(url, idempotencyKey);
        console.log('✅ SDK Share created successfully:', result);
        return result;
      } catch (error) {
        console.error('❌ SDK call failed:', error);
        throw error;
      }
    },
    
    onMutate: async ({ url }) => {
      console.log('🎯 SDK onMutate: Starting optimistic update');
      
      await queryClient.cancelQueries({ queryKey: sharesKeys.lists() });
      
      const previousShares = queryClient.getQueryData(sharesKeys.lists());
      
      const optimisticShare: Share & { _isOptimistic?: boolean } = {
        id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        url,
        platform: detectPlatformFromUrl(url),
        status: isConnected ? 'pending' : 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _isOptimistic: true,
      };
      
      queryClient.setQueriesData(
        { queryKey: sharesKeys.lists() },
        (old: any) => {
          if (!old) return old;
          
          const newPages = [...old.pages];
          if (newPages[0]) {
            const existingUrls = new Set(newPages[0].items.map((item: any) => item.url));
            if (!existingUrls.has(url)) {
              newPages[0] = {
                ...newPages[0],
                items: [optimisticShare, ...newPages[0].items],
              };
            }
          }
          
          return {
            ...old,
            pages: newPages,
          };
        }
      );
      
      console.log('✅ SDK Optimistic update applied');
      return { previousShares };
    },
    
    onSuccess: (newShare, variables) => {
      console.log('🎉 SDK Share creation successful, updating cache with real data');
      
      queryClient.setQueriesData(
        { queryKey: sharesKeys.lists() },
        (old: any) => {
          if (!old) return old;
          
          const newPages = [...old.pages];
          if (newPages[0]) {
            const filteredItems = newPages[0].items.filter(
              (item: any) => !item._isOptimistic || item.url !== variables.url
            );
            
            // Check if the new share already exists to avoid duplicates
            const existingIndex = filteredItems.findIndex((item: any) => item.url === newShare.url);
            if (existingIndex === -1) {
              newPages[0] = {
                ...newPages[0],
                items: [newShare, ...filteredItems],
              };
            } else {
              // Update existing item with server data
              filteredItems[existingIndex] = newShare;
              newPages[0] = {
                ...newPages[0],
                items: filteredItems,
              };
            }
          }
          
          return {
            ...old,
            pages: newPages,
          };
        }
      );
      
      console.log('✅ SDK Cache updated with real share data');
      
      // Force a background refresh to ensure we have the latest server state
      setTimeout(() => {
        console.log('🔄 SDK useCreateShare: Triggering background refresh after successful creation');
        queryClient.invalidateQueries({ 
          queryKey: sharesKeys.lists(),
          refetchType: 'active'  // Only refetch if currently active
        });
      }, 1000);
    },
    
    onError: (error, _variables, context) => {
      console.error('💥 SDK Share creation failed:', error);
      
      if (context?.previousShares) {
        queryClient.setQueryData(sharesKeys.lists(), context.previousShares);
      }
      
      if (!isConnected) {
        console.log('📴 Offline error - keeping optimistic update as pending');
      }
    },
    
    onSettled: () => {
      console.log('🏁 SDK Share creation settled');
    }
  });
  
  return {
    ...mutation,
    createShare: (url: string) => {
      console.log(`📝 SDK createShare called with: ${url}`);
      return mutation.mutate({ url });
    },
    pendingCount: mutation.isPending ? 1 : 0,
  };
}

function detectPlatformFromUrl(url: string): 'tiktok' | 'reddit' | 'twitter' | 'x' | 'unknown' {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    if (hostname.includes('tiktok.com')) return 'tiktok';
    if (hostname.includes('reddit.com')) return 'reddit';
    if (hostname.includes('twitter.com')) return 'twitter';
    if (hostname.includes('x.com')) return 'x';
    
    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
}