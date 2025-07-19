import React, { useCallback } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Alert,
  Text,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  ActivityIndicator,
  FAB,
  Chip,
  Banner,
} from 'react-native-paper';
import { useCreateShare } from '../hooks/useShares';
import { useEnrichedSharesList } from '../hooks/useEnrichedShares';
import type { Share, EnrichedShare } from '../services/api/shares';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function SharesScreen() {
  const insets = useSafeAreaInsets();
  
  // Fetch enriched shares list with ML results
  const {
    shares,
    isLoading,
    error,
    refresh,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useEnrichedSharesList({ limit: 20 });

  // Create share mutation
  const createShare = useCreateShare();

  // shares is already provided by useEnrichedSharesList

  const handleCreateShare = useCallback(() => {
    // In a real app, this would open a form or share sheet
    Alert.prompt(
      'Add Bookmark',
      'Enter URL to save',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (url) => {
            if (url) {
              createShare.mutate(
                { url },
                {
                  onSuccess: () => {
                    Alert.alert('Success', 'Bookmark saved!');
                  },
                  onError: (error: any) => {
                    Alert.alert('Error', error.message);
                  },
                }
              );
            }
          },
        },
      ],
      'plain-text'
    );
  }, [createShare]);

  const renderShare = useCallback(({ item }: { item: Share | EnrichedShare }) => (
    <Card style={styles.card}>
      <Card.Content>
        <Title numberOfLines={1}>{item.title || item.url}</Title>
        <Paragraph numberOfLines={2}>{item.url}</Paragraph>
        {item.description && (
          <Paragraph style={styles.notes} numberOfLines={2}>
            {item.description}
          </Paragraph>
        )}
        <View style={styles.chipContainer}>
          <Chip
            mode="flat"
            compact
            style={styles.chip}
          >
            {item.status}
          </Chip>
          <Chip mode="flat" compact style={styles.chip}>
            {item.platform}
          </Chip>
        </View>
      </Card.Content>
    </Card>
  ), []);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load bookmarks</Text>
        <Button mode="contained" onPress={() => refresh()}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      <FlatList
        data={shares}
        renderItem={renderShare}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator style={styles.loadingMore} />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No bookmarks yet</Text>
            <Text style={styles.emptySubtext}>
              Tap the + button to add your first bookmark
            </Text>
          </View>
        }
      />

      <FAB
        icon="plus"
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={handleCreateShare}
        loading={createShare.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  card: {
    marginBottom: 12,
    elevation: 2,
  },
  notes: {
    marginTop: 8,
    color: '#666',
  },
  chipContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  chip: {
    height: 24,
  },
  chip_pending: {
    backgroundColor: '#FFA500',
  },
  chip_processing: {
    backgroundColor: '#2196F3',
  },
  chip_done: {
    backgroundColor: '#4CAF50',
  },
  chip_failed: {
    backgroundColor: '#F44336',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
  },
  loadingMore: {
    paddingVertical: 20,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
  },
});