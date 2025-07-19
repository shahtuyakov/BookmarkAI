import { useCallback } from 'react';
import { 
  useQuery, 
  useInfiniteQuery 
} from '@tanstack/react-query';
import { useNetworkStatus } from './useNetworkStatus';
import { sharesAPI, EnrichedShare, GetEnrichedSharesParams } from '../services/api/shares';

// Keys for querying enriched shares
export const enrichedSharesKeys = {
  all: ['enrichedShares'] as const,
  lists: () => [...enrichedSharesKeys.all, 'list'] as const,
  list: (filters: GetEnrichedSharesParams) => 
    [...enrichedSharesKeys.lists(), filters] as const,
  details: () => [...enrichedSharesKeys.all, 'detail'] as const,
  detail: (id: string) => [...enrichedSharesKeys.details(), id] as const,
};

export function useEnrichedSharesList(params: GetEnrichedSharesParams = {}) {
  const { isConnected } = useNetworkStatus();
  
  const queryResult = useInfiniteQuery({
    queryKey: enrichedSharesKeys.list(params),
    queryFn: async ({ pageParam = undefined }) => {
      const queryParams = { 
        ...params,
        cursor: pageParam as string | undefined
      };
      return await sharesAPI.getEnrichedShares(queryParams);
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: isConnected,
    meta: {
      persist: true,
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    // Enable refetch on focus to catch updates from share extension
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
  
  const shares = queryResult.data?.pages.flatMap(page => page.items) || [];
  
  const isLoading = queryResult.isLoading || 
    (queryResult.isFetching && !queryResult.isFetchingNextPage && shares.length === 0);
  
  const refresh = useCallback(async () => {
    // Manually refreshing enriched shares list
    const result = await queryResult.refetch();
    // Manual refresh completed
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

export function useEnrichedShareById(id: string) {
  const { isConnected } = useNetworkStatus();
  
  const queryResult = useQuery({
    queryKey: enrichedSharesKeys.detail(id),
    queryFn: async () => await sharesAPI.getEnrichedShareById(id),
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