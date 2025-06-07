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
import { TokenSyncTestSuite } from '../../utils/test-token-sync';

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp<'Home'>;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogVisible, setIsAddDialogVisible] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [isTestDialogVisible, setIsTestDialogVisible] = useState(false);
  
  // Get network status
  const { isConnected } = useNetworkStatus();
  
  // Get shares with React Query (SDK version)
  const { 
    data: sharesResponse, 
    isLoading, 
    error, 
    refetch,
    isFetching
  } = useSharesList({ limit: 10 });
  
  const shares = sharesResponse?.items || [];
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
  
  // Test functions
  const runTokenSyncTests = async () => {
    try {
      await TokenSyncTestSuite.runAllTests();
      Alert.alert('Tests Complete', 'Check the console/logs for detailed results');
    } catch (error: any) {
      Alert.alert('Test Error', error.message);
    }
  };
  
  const runIndividualTest = async (testName: string) => {
    try {
      switch (testName) {
        case 'tokenSync':
          await TokenSyncTestSuite.testTokenSyncFromReactNative();
          break;
        case 'hardwareSecurity':
          await TokenSyncTestSuite.testHardwareSecurityCapabilities();
          break;
        case 'persistence':
          await TokenSyncTestSuite.testTokenPersistence();
          break;
        case 'manualSync':
          await TokenSyncTestSuite.testManualTokenSync();
          break;
        case 'enhancedSync':
          await TokenSyncTestSuite.testEnhancedTokenSync();
          break;
      }
      Alert.alert('Test Complete', `${testName} test finished. Check console for results.`);
    } catch (error: any) {
      Alert.alert('Test Error', error.message);
    }
  };
  
  // For SDK version, we don't have infinite scroll yet
  // TODO: Implement pagination with cursor-based loading
  const handleLoadMore = () => {
    // Placeholder for future pagination implementation
  };
  
  // Render a loading footer when loading more items
  const renderFooter = () => {
    // No pagination footer for now
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
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        removeClippedSubviews={true}
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        windowSize={10}
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
        
        {/* Development Test Button - Only show in debug mode */}
        {false && (
          <Button 
            mode="outlined" 
            icon="test-tube" 
            onPress={() => setIsTestDialogVisible(true)}
            style={styles.testButton}
            compact>
            Tests
          </Button>
        )}
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
        
        {/* Test Dialog */}
        <Dialog visible={isTestDialogVisible} onDismiss={() => setIsTestDialogVisible(false)}>
          <Dialog.Title>🧪 Development Tests</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.testDescription}>
              Test Android native integration and token synchronization
            </Text>
            
            <View style={styles.testButtonsContainer}>
              <Button 
                mode="contained" 
                icon="play-circle"
                onPress={runTokenSyncTests}
                style={styles.testDialogButton}>
                Run All Tests
              </Button>
              
              <Button 
                mode="outlined" 
                icon="sync"
                onPress={() => runIndividualTest('tokenSync')}
                style={styles.testDialogButton}>
                Token Sync Test
              </Button>
              
              <Button 
                mode="outlined" 
                icon="shield-check"
                onPress={() => runIndividualTest('hardwareSecurity')}
                style={styles.testDialogButton}>
                Hardware Security Test
              </Button>
              
              <Button 
                mode="outlined" 
                icon="content-save"
                onPress={() => runIndividualTest('persistence')}
                style={styles.testDialogButton}>
                Token Persistence Test
              </Button>
              
              <Button 
                mode="outlined" 
                icon="refresh"
                onPress={() => runIndividualTest('manualSync')}
                style={styles.testDialogButton}>
                Manual Sync Test
              </Button>
              
              <Button 
                mode="outlined" 
                icon="auto-fix"
                onPress={() => runIndividualTest('enhancedSync')}
                style={styles.testDialogButton}>
                Enhanced Auto Sync Test
              </Button>
            </View>
            
            <Text style={styles.testNote}>
              💡 Check Metro console for detailed test results
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsTestDialogVisible(false)}>Close</Button>
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
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  testButton: {
    minWidth: 70,
  },
  testDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  testButtonsContainer: {
    gap: 8,
  },
  testDialogButton: {
    marginVertical: 4,
  },
  testNote: {
    fontSize: 12,
    color: '#888',
    marginTop: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default HomeScreen;