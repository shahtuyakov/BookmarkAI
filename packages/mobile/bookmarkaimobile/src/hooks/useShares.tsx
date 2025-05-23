import { useCallback } from 'react';
import { 
  useQuery, 
  useMutation, 
  useQueryClient, 
  useInfiniteQuery 
} from '@tanstack/react-query';
import { NetworkProvider, useNetworkStatus } from './useNetworkStatus';
import { sharesAPI, Share, GetSharesParams } from '../services/api/shares';
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Keys for querying shares
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

// Interface for a pending share
interface PendingShare {
  id: string; // Local ID for tracking
  url: string;
  idempotencyKey: string;
  timestamp: number;
}

// Hook to get a paginated list of shares
export function useSharesList(params: GetSharesParams = {}) {
  const { isConnected } = useNetworkStatus();
  
  const queryResult = useInfiniteQuery({
    queryKey: sharesKeys.list(params),
    queryFn: async ({ pageParam = undefined }) => {
      const queryParams = { 
        ...params,
        cursor: pageParam as string | undefined
      };
      return await sharesAPI.getShares(queryParams);
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: isConnected, // Only actively fetch when online
    // Mark this query for persistence
    meta: {
      persist: true,
    },
    // Keep using cached data when offline
    staleTime: Infinity,
  });
  
  // Compute flat list of shares
  const shares = queryResult.data?.pages.flatMap(page => page.items) || [];
  
  // Enhanced loading state (true when fetching first page or refreshing)
  const isLoading = queryResult.isLoading || 
    (queryResult.isFetching && !queryResult.isFetchingNextPage && shares.length === 0);
  
  // Handle refresh (useful for pull-to-refresh)
  const refresh = useCallback(async () => {
    return await queryResult.refetch();
  }, [queryResult]);
  
  return {
    ...queryResult,
    shares,
    isLoading,
    refresh,
    isRefreshing: queryResult.isFetching && !queryResult.isFetchingNextPage,
  };
}

// Hook to get a single share by ID
export function useShareById(id: string) {
  const { isConnected } = useNetworkStatus();
  
  const queryResult = useQuery({
    queryKey: sharesKeys.detail(id),
    queryFn: async () => await sharesAPI.getShareById(id),
    enabled: !!id && isConnected, // Only actively fetch when online and have ID
    // Mark this query for persistence
    meta: {
      persist: true,
    },
    // Keep using cached data when offline
    staleTime: Infinity,
  });
  
  // Handle refresh
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

// Hook to create a new share with offline support
export function useCreateShare() {
  console.log('🏗️ useCreateShare hook initialized');
  
  const queryClient = useQueryClient();
  const { isConnected } = useNetworkStatus();
  
  // Load pending shares from AsyncStorage
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
  
  // Save pending shares to AsyncStorage
  const savePendingShares = async (pendingShares: PendingShare[]) => {
    try {
      await AsyncStorage.setItem(PENDING_SHARES_KEY, JSON.stringify(pendingShares));
    } catch (error) {
      console.error('Error saving pending shares:', error);
    }
  };
  
  // Add a share to the pending queue
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
  
  // Remove a share from the pending queue
  const removeFromPendingQueue = async (id: string) => {
    const pendingShares = await loadPendingShares();
    const updatedShares = pendingShares.filter(share => share.id !== id);
    await savePendingShares(updatedShares);
  };
  
  // Sync pending shares when back online
  const syncPendingShares = async () => {
    const pendingShares = await loadPendingShares();
    
    // If no pending shares, nothing to do
    if (pendingShares.length === 0) return;
    
    // Process each pending share
    for (const pendingShare of pendingShares) {
      try {
        // Try to create the share on the server
        await sharesAPI.createShare(pendingShare.url, pendingShare.idempotencyKey);
        
        // If successful, remove from pending queue
        await removeFromPendingQueue(pendingShare.id);
      } catch (error) {
        console.error('Failed to sync pending share:', error);
        // Keep in queue to retry later
      }
    }
    
    // Refresh the shares list
    await queryClient.invalidateQueries({ queryKey: sharesKeys.lists() });
  };
  
  // Listen for network changes to sync when back online
  NetInfo.addEventListener(state => {
    if (state.isConnected) {
      syncPendingShares();
    }
  });
  
  // Main mutation for creating shares
  const mutation = useMutation({
    mutationFn: async ({ url }: { url: string }) => {
      console.log(`🚀 Creating share for URL: ${url}`);
      console.log(`📶 Network connected: ${isConnected}`);
      
      // If offline, add to pending queue
      if (!isConnected) {
        console.log('📴 Offline - adding to pending queue');
        const pendingShare = await addToPendingQueue(url);
        
        // Return a mock share that will be replaced when online
        return {
          id: pendingShare.id,
          url: pendingShare.url,
          platform: detectPlatformFromUrl(url),
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          // Flag to indicate this is a pending offline share
          _isPending: true,
        };
      }
      
      // If online, create directly
      console.log('🌐 Online - making API call');
      const idempotencyKey = uuidv4();
      console.log(`🔑 Idempotency key: ${idempotencyKey}`);
      
      try {
        const result = await sharesAPI.createShare(url, idempotencyKey);
        console.log('✅ Share created successfully:', result);
        return result;
      } catch (error) {
        console.error('❌ API call failed:', error);
        throw error;
      }
    },
    
    // Update cache after successful creation
    onSuccess: (newShare) => {
      console.log('🎉 Share creation successful, updating cache');
      // Invalidate relevant queries to refetch data
      queryClient.invalidateQueries({ queryKey: sharesKeys.lists() });
      
      // If it was an offline share that's now synced, remove the pending flag
      if (newShare._isPending) {
        // This will happen when back online and syncing
        delete newShare._isPending;
      }
    },
    
    onError: (error) => {
      console.error('💥 Share creation failed:', error);
    }
  });
  
  return {
    ...mutation,
    // Helper to simplify API for consumers
    createShare: (url: string) => {
      console.log(`📝 createShare called with: ${url}`);
      return mutation.mutate({ url });
    },
    pendingCount: mutation.isPending ? 1 : 0, // Simple count for UI indicators
  };
}

// Helper to detect platform from URL
function detectPlatformFromUrl(url: string): string {
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