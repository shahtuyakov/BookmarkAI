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
import { Share } from '../../services/api/shares';

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
  
  // Get shares with React Query
  const { 
    shares, 
    isLoading, 
    isRefreshing, 
    error, 
    fetchNextPage, 
    hasNextPage, 
    refresh, 
    isFetchingNextPage 
  } = useSharesList({ limit: 10 });
  
  // Create share mutation
  const { 
    createShare, 
    isPending: isSubmitting, 
    pendingCount 
  } = useCreateShare();
  
  // Handle search (this would be expanded in a real implementation)
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // In a real implementation, this would filter results or make a new API call
  };
  
  // Navigate to detail screen when a share is tapped
  const handleSharePress = (share: Share) => {
    navigation.navigate('Detail', { id: share.id, title: share.metadata?.title || 'Details' });
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
      await createShare(newUrl);
      
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
  
  // Handle loading more data when reaching end of list
  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage && isConnected) {
      fetchNextPage();
    }
  };
  
  // Render a loading footer when loading more items
  const renderFooter = () => {
    if (!hasNextPage) return null;
    if (!isConnected) return <Text style={styles.offlineFooter}>Connect to load more</Text>;
    
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
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
    
    if (error && shares.length === 0) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {isConnected 
              ? 'Failed to load bookmarks. Please try again.' 
              : 'You\'re offline. Connect to the internet to load your bookmarks.'}
          </Text>
          <Button 
            mode="contained" 
            onPress={() => refresh()} 
            style={styles.retryButton}
            disabled={!isConnected}>
            {isConnected ? 'Retry' : 'Offline'}
          </Button>
        </View>
      );
    }
    
    if (shares.length === 0) {
      return <EmptyState onAddBookmark={showAddDialog} />;
    }
    
    return (
      <FlatList
        data={shares}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ShareCard share={item} onPress={handleSharePress} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
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
      
      <Searchbar
        placeholder="Search bookmarks"
        onChangeText={handleSearch}
        value={searchQuery}
        style={styles.searchBar}
      />
      
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
    margin: 16,
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
});

export default HomeScreen;