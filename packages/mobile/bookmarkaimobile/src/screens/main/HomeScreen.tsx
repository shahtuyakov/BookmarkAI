import React, { useState } from 'react';
import { 
  FlatList, 
  View, 
  StyleSheet, 
  RefreshControl, 
  ActivityIndicator, 
  Alert,
  Image,
  SafeAreaView 
} from 'react-native';
import { FAB, Searchbar, Text, useTheme, Dialog, Portal, Button, TextInput, Chip } from 'react-native-paper';
import { HomeScreenNavigationProp } from '../../navigation/types';
import { useSharesList, useCreateShare } from '../../hooks/useShares';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import ShareCard from '../../components/shares/ShareCard';
import EmptyState from '../../components/shares/EmptyState';
import { Share } from '@bookmarkai/sdk';

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp<'Home'>;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogVisible, setIsAddDialogVisible] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  
  // Get network status
  const { isConnected } = useNetworkStatus();
  
  // Get shares with infinite scrolling (SDK version)
  const { 
    data,
    isLoading, 
    error, 
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useSharesList({ limit: 20 });
  
  // Flatten all pages into a single array
  const shares = data?.pages?.flatMap(page => page.items) || [];
  const isRefreshing = isFetching && !isLoading;
  
  // Create share mutation (SDK version)
  const { 
    mutate: createShare, 
    isPending: isSubmitting
  } = useCreateShare();
  
  // For now, set pendingCount to 0 since SDK version doesn't track this the same way
  const pendingCount = 0;
  
  // Handle search (this would be expanded in a real implementation)
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // In a real implementation, this would filter results or make a new API call
  };
  
  // Navigate to detail screen when a share is tapped
  const handleSharePress = (share: Share) => {
    const title = typeof share.metadata?.title === 'string' ? share.metadata.title : 'Details';
    navigation.navigate('Detail', { id: share.id, title });
  };
  
  // Show add bookmark dialog
  const showAddDialog = () => {
    setIsAddDialogVisible(true);
  };
  
  // Hide add bookmark dialog
  const hideAddDialog = () => {
    setIsAddDialogVisible(false);
    setNewUrl('');
  };
  
  // Add a new bookmark
  const addBookmark = async () => {
    if (!newUrl) {
      return;
    }
    
    try {
      createShare({ url: newUrl });
      
      // Hide dialog and reset form
      hideAddDialog();
      
      // Show success message
      Alert.alert('Success', 'Bookmark added successfully');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || 
                           'Failed to add bookmark. Please try again.';
      
      Alert.alert('Error', errorMessage);
    }
  };
  
  
  // Handle loading more items when reaching the end
  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };
  
  // Render a loading footer when loading more items
  const renderFooter = () => {
    if (isFetchingNextPage) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.footerText}>Loading more...</Text>
        </View>
      );
    }
    
    // Show retry button if there's an error and we have more pages
    if (error && hasNextPage) {
      return (
        <View style={styles.footerError}>
          <Text style={styles.footerErrorText}>Failed to load more</Text>
          <Button 
            mode="outlined" 
            onPress={handleLoadMore}
            compact
            style={styles.footerRetryButton}>
            Retry
          </Button>
        </View>
      );
    }
    
    if (!hasNextPage && shares.length > 0) {
      return (
        <View style={styles.footerEnd}>
          <Text style={styles.footerEndText}>You've reached the end</Text>
        </View>
      );
    }
    
    return null;
  };
  
  // Generate unique key for each item
  const getItemKey = (item: Share, index: number) => {
    // Use a combination of ID, URL hash, and index to ensure uniqueness
    const urlHash = item.url ? item.url.slice(-8) : 'no-url';
    return `share-${item.id}-${urlHash}-${index}`;
  };
  
  // Render content based on state
  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading your bookmarks...</Text>
        </View>
      );
    }
    
    if (error && (!shares || shares.length === 0)) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {isConnected 
              ? 'Failed to load bookmarks. Please try again.' 
              : 'You\'re offline. Connect to the internet to load your bookmarks.'}
          </Text>
          <Button 
            mode="contained" 
            onPress={() => refetch()} 
            style={styles.retryButton}
            disabled={!isConnected}>
            {isConnected ? 'Retry' : 'Offline'}
          </Button>
        </View>
      );
    }
    
    // Show error banner if there's an error but we have some data
    if (error && shares.length > 0) {
      return (
        <View style={styles.container}>
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>
              Failed to load more bookmarks
            </Text>
            <Button 
              mode="text" 
              onPress={() => refetch()}
              compact
              textColor="white">
              Retry
            </Button>
          </View>
          <FlatList
            data={shares}
            keyExtractor={getItemKey}
            renderItem={({ item }) => <ShareCard share={item} onPress={handleSharePress} />}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refetch}
                colors={[theme.colors.primary]}
                tintColor={theme.colors.primary}
              />
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.1}
            ListFooterComponent={renderFooter}
            removeClippedSubviews={true}
            initialNumToRender={20}
            maxToRenderPerBatch={10}
            windowSize={10}
            getItemLayout={undefined}
          />
        </View>
      );
    }
    
    if (!shares || shares.length === 0) {
      return <EmptyState onAddBookmark={showAddDialog} />;
    }
    
    return (
      <FlatList
        data={shares}
        keyExtractor={getItemKey}
        renderItem={({ item }) => <ShareCard share={item} onPress={handleSharePress} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refetch}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.1}
        ListFooterComponent={renderFooter}
        removeClippedSubviews={true}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={10}
        getItemLayout={undefined} // Let FlatList calculate automatically for better performance
      />
    );
  };
  
  return (
    <SafeAreaView style={styles.container}>
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>You're offline. Some features may be limited.</Text>
        </View>
      )}
      
      <View style={styles.headerContainer}>
        <Searchbar
          placeholder="Search bookmarks"
          onChangeText={handleSearch}
          value={searchQuery}
          style={styles.searchBar}
        />
      </View>
      
      {renderContent()}
      
      {pendingCount > 0 && (
        <Chip 
          icon="cloud-off-outline" 
          style={styles.pendingChip} 
          mode="outlined">
          {pendingCount} bookmark{pendingCount > 1 ? 's' : ''} pending sync
        </Chip>
      )}
      
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={showAddDialog}
      />
      
      <Portal>
        <Dialog visible={isAddDialogVisible} onDismiss={hideAddDialog}>
          <Dialog.Title>Add Bookmark</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="URL"
              value={newUrl}
              onChangeText={setNewUrl}
              autoCapitalize="none"
              keyboardType="url"
              autoCorrect={false}
              disabled={isSubmitting}
              placeholder="https://example.com"
              style={styles.urlInput}
            />
            {!isConnected && (
              <Text style={styles.offlineWarning}>
                You're offline. Your bookmark will be saved and synced when you reconnect.
              </Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={hideAddDialog} disabled={isSubmitting}>Cancel</Button>
            <Button
              onPress={addBookmark}
              loading={isSubmitting}
              disabled={isSubmitting || !newUrl}>
              Add
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchBar: {
    flex: 1,
    elevation: 2,
  },
  listContent: {
    paddingBottom: 80, // Space for FAB
  },
  loadingOverlay: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 16,
  },
  errorBanner: {
    backgroundColor: '#FF3B30',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorBannerText: {
    color: 'white',
    fontSize: 14,
    flex: 1,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    marginTop: 8,
    color: '#666',
    fontSize: 14,
  },
  footerEnd: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerEndText: {
    color: '#999',
    fontSize: 14,
    fontStyle: 'italic',
  },
  footerError: {
    paddingVertical: 20,
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
  },
  footerErrorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginBottom: 8,
  },
  footerRetryButton: {
    borderColor: '#FF3B30',
  },
  urlInput: {
    marginTop: 10,
  },
  offlineBanner: {
    backgroundColor: '#FF9500',
    padding: 10,
    alignItems: 'center',
  },
  offlineText: {
    color: 'white',
    fontWeight: 'bold',
  },
  offlineFooter: {
    textAlign: 'center',
    padding: 16,
    color: '#666',
  },
  offlineWarning: {
    marginTop: 10,
    color: '#FF9500',
    fontSize: 12,
  },
  pendingChip: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    borderColor: '#FF9500',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
});

export default HomeScreen;