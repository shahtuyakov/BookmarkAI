import { useState, useCallback, useEffect } from 'react';
import { sharesAPI, Share, GetSharesParams } from '../services/api/shares';

interface UseSharesResult {
  shares: Share[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  hasMore: boolean;
  refreshShares: () => Promise<void>;
  loadMoreShares: () => Promise<void>;
}

export const useShares = (initialParams?: GetSharesParams): UseSharesResult => {
  const [shares, setShares] = useState<Share[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState<boolean>(true);
  
  // Function to fetch shares
  const fetchShares = useCallback(async (params: GetSharesParams, refresh = false) => {
    try {
      const response = await sharesAPI.getShares(params);
      
      setShares(prevShares => {
        if (refresh) {
          return response.items;
        }
        return [...prevShares, ...response.items];
      });
      
      setCursor(response.cursor);
      setHasMore(response.hasMore);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching shares:', err);
      const errorMessage = err.response?.data?.error?.message || 
                           'Failed to load bookmarks. Please try again.';
      setError(errorMessage);
    }
  }, []);
  
  // Initial fetch
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        await fetchShares(initialParams || {}, true);
      } catch (error) {
        console.error('Failed to fetch initial shares:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadInitialData();
  }, [fetchShares, initialParams]);
  
  // Refresh shares (pull-to-refresh)
  const refreshShares = useCallback(async () => {
    setIsRefreshing(true);
    
    try {
      await fetchShares(initialParams || {}, true);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchShares, initialParams]);
  
  // Load more shares (pagination)
  const loadMoreShares = useCallback(async () => {
    if (!hasMore || isLoading || isRefreshing) return;
    
    try {
      await fetchShares({
        ...(initialParams || {}),
        cursor,
      });
    } catch (err) {
      console.error('Error loading more shares:', err);
    }
  }, [fetchShares, hasMore, isLoading, isRefreshing, cursor, initialParams]);
  
  return {
    shares,
    isLoading,
    isRefreshing,
    error,
    hasMore,
    refreshShares,
    loadMoreShares,
  };
};
