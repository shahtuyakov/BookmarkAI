import React from 'react';
import { ScrollView, View, StyleSheet, Linking, RefreshControl } from 'react-native';
import { Text, Card, Button, Chip, Divider, ActivityIndicator, useTheme, Banner } from 'react-native-paper';
import { RouteProp } from '@react-navigation/native';
import { HomeStackParamList } from '../../navigation/types';
import { useShareById } from '../../hooks/useShares';
import { useSDKShareById } from '../../hooks/useSDKShares';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { isUsingSDKAuth, useSDKClient } from '../../contexts/auth-provider';

type Props = {
  route: RouteProp<HomeStackParamList, 'Detail'>;
};

const getPlatformColor = (platform: string) => {
  switch (platform) {
    case 'tiktok':
      return '#000000';
    case 'reddit':
      return '#FF4500';
    case 'twitter':
    case 'x':
      return '#1DA1F2';
    default:
      return '#666666';
  }
};

const DetailScreen: React.FC<Props> = ({ route }) => {
  const { id } = route.params;
  const theme = useTheme();
  const { isConnected } = useNetworkStatus();
  
  // Get SDK client if using SDK auth
  const sdkClient = useSDKClient();
  const usingSDKAuth = isUsingSDKAuth();
  
  // Use SDK hook if SDK auth is enabled, otherwise use direct API hook
  const shareResult = usingSDKAuth && sdkClient 
    ? useSDKShareById(sdkClient, id)
    : useShareById(id);
  
  const { 
    share, 
    isLoading, 
    isRefreshing, 
    error, 
    refresh 
  } = shareResult;
  
  // Handle opening the URL in browser
  const openInBrowser = () => {
    if (share?.url) {
      Linking.openURL(share.url);
    }
  };
  
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }
  
  if (error || !share) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          {isConnected 
            ? 'Failed to load bookmark details. Please try again.' 
            : 'You\'re offline. Connect to the internet to load the latest details.'}
        </Text>
        <Button
          mode="contained"
          onPress={() => refresh()}
          disabled={!isConnected}>
          {isConnected ? 'Retry' : 'Offline'}
        </Button>
      </View>
    );
  }
  
  // Format dates
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  // Check if this is a pending offline share
  const isPendingOfflineShare = (share as any)._isPending === true;
  
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
          enabled={isConnected}
        />
      }>
      
      {!isConnected && (
        <Banner
          visible={true}
          icon="wifi-off"
          actions={[
            {
              label: 'Dismiss',
              onPress: () => {},
            },
          ]}>
          You're offline. Some content may not be updated.
        </Banner>
      )}
      
      {isPendingOfflineShare && (
        <Banner
          visible={true}
          icon="cloud-sync"
          actions={[
            {
              label: 'Dismiss',
              onPress: () => {},
            },
          ]}>
          This bookmark is waiting to be synced when you're back online.
        </Banner>
      )}
      
      <Card style={styles.card}>
        {share.metadata?.thumbnailUrl && (
          <Card.Cover source={{ uri: share.metadata.thumbnailUrl }} style={styles.coverImage} />
        )}
        
        <Card.Content style={styles.cardContent}>
          <Text style={styles.title}>
            {share.metadata?.title || 'Untitled Bookmark'}
          </Text>
          
          {share.metadata?.author && (
            <Text style={styles.author}>By {share.metadata.author}</Text>
          )}
          
          <View style={styles.metaContainer}>
            <Chip
              mode="outlined"
              style={[styles.chip, { borderColor: getPlatformColor(share.platform) }]}
              textStyle={{ color: getPlatformColor(share.platform) }}>
              {share.platform.toUpperCase()}
            </Chip>
            
            <Chip
              mode="outlined"
              style={styles.chip}
              textStyle={{ color: theme.colors.primary }}>
              {share.status.toUpperCase()}
            </Chip>
          </View>
          
          <Divider style={styles.divider} />
          
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>
            {share.metadata?.description || 'No description available'}
          </Text>
          
          <Divider style={styles.divider} />
          
          <Text style={styles.sectionTitle}>URL</Text>
          <Text style={styles.url} selectable={true}>
            {share.url}
          </Text>
          
          <Button
            mode="contained"
            icon="open-in-new"
            onPress={openInBrowser}
            style={styles.openButton}>
            Open in Browser
          </Button>
          
          <Divider style={styles.divider} />
          
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailsContainer}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Created:</Text>
              <Text style={styles.detailValue}>{formatDate(share.createdAt)}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Updated:</Text>
              <Text style={styles.detailValue}>{formatDate(share.updatedAt)}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>ID:</Text>
              <Text style={styles.detailValue} selectable={true}>{share.id}</Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 20,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  coverImage: {
    height: 200,
  },
  cardContent: {
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  author: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  metaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  chip: {
    marginRight: 8,
    marginBottom: 8,
  },
  divider: {
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  url: {
    fontSize: 14,
    color: '#0066CC',
    marginBottom: 12,
  },
  openButton: {
    marginTop: 12,
  },
  detailsContainer: {
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    width: 80,
  },
  detailValue: {
    fontSize: 14,
    flex: 1,
  },
});

export default DetailScreen;