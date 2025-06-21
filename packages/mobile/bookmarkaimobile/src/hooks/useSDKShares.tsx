import { useCallback, useState, useEffect } from 'react';
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Check if SDK is authenticated
  useEffect(() => {
    let mounted = true;
    let interval: NodeJS.Timeout | null = null;
    
    const checkAuth = async () => {
      if (!mounted) return;
      
      console.log('🔍 [useSDKShares] Checking SDK authentication...');
      const authenticated = await client.isAuthenticated();
      console.log('✅ [useSDKShares] SDK authenticated:', authenticated);
      setIsAuthenticated(authenticated);
      
      if (!authenticated) {
        console.log('🔄 [useSDKShares] Not authenticated, attempting to get access token...');
        try {
          const token = await client.getAccessToken();
          console.log('🎫 [useSDKShares] Access token obtained:', !!token);
        } catch (error) {
          console.error('❌ [useSDKShares] Failed to get access token:', error);
        }
      } else {
        // Clear interval once authenticated
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    };
    
    // Initial check immediately
    checkAuth();
    
    // Only re-check if not authenticated
    if (!isAuthenticated) {
      interval = setInterval(checkAuth, 2000);
    }
    
    return () => {
      mounted = false;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [client, isAuthenticated]);
  
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
    enabled: isConnected && isAuthenticated,
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
    const result = await queryResult.refetch();
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
    }
    return [];
  };
  
  const savePendingShares = async (pendingShares: PendingShare[]) => {
    try {
      await AsyncStorage.setItem(PENDING_SHARES_KEY, JSON.stringify(pendingShares));
    } catch (error) {
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
      if (!isConnected) {
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
      
      const idempotencyKey = uuidv4();
      
      try {
        const result = await sharesService.createShare(url, idempotencyKey);
        return result;
      } catch (error) {
        throw error;
      }
    },
    
    onMutate: async ({ url }) => {
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
      
      return { previousShares };
    },
    
    onSuccess: (newShare, variables) => {
      
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
      
      // Force a background refresh to ensure we have the latest server state
      setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: sharesKeys.lists(),
          refetchType: 'active'  // Only refetch if currently active
        });
      }, 1000);
    },
    
    onError: (_error, _variables, context) => {
      if (context?.previousShares) {
        queryClient.setQueryData(sharesKeys.lists(), context.previousShares);
      }
    },
    
    onSettled: () => {
    }
  });
  
  return {
    ...mutation,
    createShare: (url: string) => {
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