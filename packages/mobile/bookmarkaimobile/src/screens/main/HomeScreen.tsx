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
import { FAB, Searchbar, Text, useTheme, Dialog, Portal, Button, TextInput } from 'react-native-paper';
import { HomeScreenNavigationProp } from '../../navigation/types';
import { useShares } from '../../hooks/useShares';
import ShareCard from '../../components/shares/ShareCard';
import EmptyState from '../../components/shares/EmptyState';
import { Share } from '../../services/api/shares';
import { sharesAPI } from '../../services/api/shares';
import { v4 as uuidv4 } from 'uuid';

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp<'Home'>;
}

// Create some fallback mock data in case API fails
const FALLBACK_MOCK_DATA: Share[] = [
  {
    id: 'mock-1',
    url: 'https://www.tiktok.com/@user/video/123456',
    platform: 'tiktok',
    status: 'done',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      title: 'TikTok Video Example',
      author: 'TikTok Creator',
      description: 'This is an example TikTok video from our mock data.',
      thumbnailUrl: 'https://picsum.photos/seed/tiktok/400/200'
    }
  },
  {
    id: 'mock-2',
    url: 'https://www.reddit.com/r/programming/comments/abc123',
    platform: 'reddit',
    status: 'done',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    metadata: {
      title: 'Programming Discussion on Reddit',
      author: 'Reddit User',
      description: 'An interesting discussion about programming from Reddit.',
      thumbnailUrl: 'https://picsum.photos/seed/reddit/400/200'
    }
  },
  {
    id: 'mock-3',
    url: 'https://twitter.com/user/status/123456',
    platform: 'twitter',
    status: 'processing',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
    metadata: {
      title: 'Interesting Tweet Thread',
      author: 'Twitter User',
      description: 'A viral thread discussing current technology trends.',
      thumbnailUrl: 'https://picsum.photos/seed/twitter/400/200'
    }
  }
];

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogVisible, setIsAddDialogVisible] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Use our custom hook to fetch shares
  const { 
    shares, 
    isLoading, 
    isRefreshing, 
    error, 
    hasMore, 
    refreshShares, 
    loadMoreShares 
  } = useShares({ limit: 10 });
  
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
    
    setIsSubmitting(true);
    
    try {
      // Generate a idempotency key
      const idempotencyKey = uuidv4();
      
      // Create a new share through the API
      await sharesAPI.createShare(newUrl, idempotencyKey);
      
      // Hide dialog and reset form
      hideAddDialog();
      
      // Refresh the shares list
      refreshShares();
      
      // Show success message
      Alert.alert('Success', 'Bookmark added successfully');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || 
                           'Failed to add bookmark. Please try again.';
      
      Alert.alert('Error', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Render a loading footer when loading more items
  const renderFooter = () => {
    if (!hasMore) return null;
    
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  };
  
  // Get the shares data to display (either from API or fallback)
  const displayShares = shares.length > 0 ? shares : FALLBACK_MOCK_DATA;
  
  // Render content based on state
  const renderContent = () => {
    if (isLoading) {
      return (
        <FlatList
          data={FALLBACK_MOCK_DATA}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ShareCard share={item} onPress={handleSharePress} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Loading your bookmarks...</Text>
            </View>
          }
        />
      );
    }
    
    if (error && shares.length === 0) {
      return (
        <FlatList
          data={FALLBACK_MOCK_DATA}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ShareCard share={item} onPress={handleSharePress} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <Button mode="contained" onPress={refreshShares} style={styles.retryButton}>
                Retry
              </Button>
            </View>
          }
        />
      );
    }
    
    if (displayShares.length === 0) {
      return <EmptyState onAddBookmark={showAddDialog} />;
    }
    
    return (
      <FlatList
        data={displayShares}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ShareCard share={item} onPress={handleSharePress} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshShares}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        onEndReached={loadMoreShares}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
      />
    );
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <Searchbar
        placeholder="Search bookmarks"
        onChangeText={handleSearch}
        value={searchQuery}
        style={styles.searchBar}
      />
      
      {renderContent()}
      
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
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
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
});

export default HomeScreen;
