import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { TextInput, Text, useTheme } from 'react-native-paper';
import { useDebouncedCallback } from 'use-debounce';
import ShareCard from '../../components/shares/ShareCard';
import { useSDKClient } from '../../contexts/auth-provider';
import { useNavigation } from '@react-navigation/native';

const SearchScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const client = useSDKClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);

  // Perform search using direct API call
  const performSearch = useCallback(async (query: string, pageCursor?: string) => {
    if (!client || query.trim().length < 3) return;

    try {
      setIsLoading(true);

      // Make authenticated request using the client's network adapter
      const response = await client.request({
        method: 'POST',
        url: '/v1/shares/search/similar',
        data: {
          query: query.trim(),
          limit: 20,
          minSimilarity: 0.2,
          cursor: pageCursor,
        },
      });

      // Handle the response
      const data = response.data;
      
      // Check if data has the expected structure
      if (data.data && data.data.items) {
        // Response is wrapped in { success: true, data: { items: [...] } }
        const items = data.data.items.map((item: any) => ({
          id: item.shareId,
          url: item.url,
          title: item.title,
          platform: item.platform,
          thumbnailUrl: item.thumbnailUrl,
          mediaType: item.contentType,
          status: 'done',
          createdAt: item.createdAt,
          updatedAt: item.processedAt,
          // Keep similarity for display
          similarity: item.similarity,
        }));
        if (pageCursor) {
          // Append results for pagination
          setSearchResults(prev => [...prev, ...items]);
        } else {
          // Replace results for new search
          setSearchResults(items);
        }
        setCursor(data.data.cursor);
        setHasMore(data.data.hasMore);
      } else if (data.items) {
        // Response has items directly
        const items = data.items.map((item: any) => ({
          id: item.shareId,
          url: item.url,
          title: item.title,
          platform: item.platform,
          thumbnailUrl: item.thumbnailUrl,
          mediaType: item.contentType,
          status: 'done',
          createdAt: item.createdAt,
          updatedAt: item.processedAt,
          // Keep similarity for display
          similarity: item.similarity,
        }));
        if (pageCursor) {
          // Append results for pagination
          setSearchResults(prev => [...prev, ...items]);
        } else {
          // Replace results for new search
          setSearchResults(items);
        }
        setCursor(data.cursor);
        setHasMore(data.hasMore);
      } else {
        console.error('Unexpected response structure:', data);
        setSearchResults([]);
      }
      
      setHasSearched(true);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  // Debounced search
  const debouncedSearch = useDebouncedCallback(
    (query: string) => {
      setCursor(undefined);
      performSearch(query);
    },
    300
  );

  // Handle search input change
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (query.trim().length >= 3) {
      debouncedSearch(query);
    } else {
      setSearchResults([]);
      setHasSearched(false);
    }
  };

  // Handle share press
  const handleSharePress = (share: any) => {
    navigation.navigate('ShareDetail', { shareId: share.id });
  };

  // Load more results
  const loadMore = () => {
    if (!isLoading && hasMore && cursor) {
      performSearch(searchQuery, cursor);
    }
  };

  // Render share item with similarity score
  const renderShareItem = ({ item }: { item: any }) => (
    <View style={styles.resultItem}>
      <ShareCard 
        share={item} 
        onPress={() => handleSharePress(item)}
      />
      {item.similarity !== undefined && (
        <View style={[styles.similarityBadge, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.similarityText}>
            {Math.round(item.similarity * 100)}% match
          </Text>
        </View>
      )}
    </View>
  );

  // Empty state
  const renderEmptyState = () => {
    if (!hasSearched) {
      if (searchQuery.trim().length > 0 && searchQuery.trim().length < 3) {
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Enter at least 3 characters to search
            </Text>
          </View>
        );
      }
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            Search your bookmarks by entering keywords above
          </Text>
        </View>
      );
    }

    if (searchQuery && !isLoading) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No results found for "{searchQuery}"
          </Text>
          <Text style={styles.emptyStateSubtext}>
            Try different keywords or check your spelling
          </Text>
        </View>
      );
    }

    return null;
  };

  // Footer component
  const renderFooter = () => {
    if (!isLoading) return null;
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          mode="outlined"
          placeholder="Search your bookmarks (min. 3 characters)..."
          value={searchQuery}
          onChangeText={handleSearchChange}
          left={<TextInput.Icon icon="magnify" />}
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={searchResults}
        renderItem={renderShareItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: 'white',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchInput: {
    backgroundColor: 'white',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  resultItem: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 16,
  },
  similarityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  similarityText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  loadingFooter: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default SearchScreen;