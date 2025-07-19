import React, { useState } from 'react';
import { ScrollView, View, StyleSheet, Linking, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Card, Button, Chip, Divider, ActivityIndicator, useTheme, Banner } from 'react-native-paper';
import { RouteProp } from '@react-navigation/native';
import { HomeStackParamList } from '../../navigation/types';
import { useEnrichedShareById } from '../../hooks/useEnrichedShares';
import { useSDKShareById } from '../../hooks/useSDKShares';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { isUsingSDKAuth, useSDKClient } from '../../contexts/auth-provider';
import type { Share, EnrichedShare } from '../../services/api/shares';

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
    case 'youtube':
      return '#FF0000';
    case 'generic':
      return '#4CAF50';
    default:
      return '#666666';
  }
};

const getMLStatusInfo = (share: Share | EnrichedShare) => {
  if (!('mlResults' in share) || !share.mlResults) {
    return { text: 'No AI Results', color: '#999' };
  }
  
  const { processingStatus } = share.mlResults;
  const statuses = [processingStatus.summary, processingStatus.transcript, processingStatus.embeddings];
  
  if (statuses.every(s => s === 'done' || s === 'not_applicable')) {
    return { text: '✅ AI Complete', color: '#4CAF50' };
  } else if (statuses.some(s => s === 'failed')) {
    return { text: '❌ AI Failed', color: '#FF3B30' };
  } else if (statuses.some(s => s === 'processing')) {
    return { text: '⏳ AI Processing', color: '#FF9500' };
  }
  
  return { text: '🔄 AI Pending', color: '#666' };
};

const DetailScreen: React.FC<Props> = ({ route }) => {
  const { id } = route.params;
  const theme = useTheme();
  const { isConnected } = useNetworkStatus();
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  
  // Get SDK client if using SDK auth
  const sdkClient = useSDKClient();
  const usingSDKAuth = isUsingSDKAuth();
  
  // Use SDK hook if SDK auth is enabled, otherwise use enriched API hook for ML results
  const shareResult = usingSDKAuth && sdkClient 
    ? useSDKShareById(sdkClient, id)
    : useEnrichedShareById(id);
  
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
        {(share.thumbnailUrl || share.metadata?.thumbnailUrl) && (
          <Card.Cover source={{ uri: share.thumbnailUrl || share.metadata?.thumbnailUrl }} style={styles.coverImage} />
        )}
        
        <Card.Content style={styles.cardContent}>
          <Text style={styles.title}>
            {share.title || share.metadata?.title || 'Untitled Bookmark'}
          </Text>
          
          {(share.author || share.metadata?.author) && (
            <Text style={styles.author}>By {share.author || share.metadata?.author}</Text>
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
            {share.description || share.metadata?.description || 'No description available'}
          </Text>
          
          {/* ML Results Section */}
          {'mlResults' in share && share.mlResults && (
            <>
              <Divider style={styles.divider} />
              
              {/* AI Summary */}
              {share.mlResults.summary && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>🤖 AI Summary</Text>
                    <Chip
                      mode="flat"
                      style={{ backgroundColor: 'transparent' }}
                      textStyle={{ color: getMLStatusInfo(share).color, fontSize: 12 }}>
                      {getMLStatusInfo(share).text}
                    </Chip>
                  </View>
                  <Text style={styles.description}>
                    {share.mlResults.summary}
                  </Text>
                </>
              )}
              
              {/* Key Points */}
              {share.mlResults.keyPoints && share.mlResults.keyPoints.length > 0 && (
                <>
                  <View style={styles.keyPointsHeader}>
                    <Text style={styles.sectionTitle}>📌 Key Points</Text>
                  </View>
                  <View style={styles.keyPointsList}>
                    {share.mlResults.keyPoints.map((point: string, index: number) => (
                      <Text key={index} style={styles.keyPoint}>
                        • {point}
                      </Text>
                    ))}
                  </View>
                </>
              )}
              
              {/* Transcript */}
              {share.mlResults.transcript && (
                <>
                  <Divider style={styles.divider} />
                  <Text style={styles.sectionTitle}>📄 Transcript</Text>
                  <TouchableOpacity
                    onPress={() => setTranscriptExpanded(!transcriptExpanded)}
                    style={styles.transcriptToggle}>
                    <Text style={styles.transcriptToggleText}>
                      {transcriptExpanded ? 'Hide Transcript ▲' : 'Show Full Transcript ▼'}
                    </Text>
                  </TouchableOpacity>
                  {transcriptExpanded && (
                    <View style={styles.transcriptContainer}>
                      <Text style={styles.transcriptText} selectable={true}>
                        {share.mlResults.transcript}
                      </Text>
                    </View>
                  )}
                </>
              )}
              
              {/* AI Analysis Metadata */}
              {(share.mlResults.language || share.mlResults.duration || share.mlResults.processedAt) && (
                <>
                  <Divider style={styles.divider} />
                  <Text style={styles.sectionTitle}>📊 AI Analysis</Text>
                  <View style={styles.detailsContainer}>
                    {share.mlResults.language && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Language:</Text>
                        <Text style={styles.detailValue}>{share.mlResults.language}</Text>
                      </View>
                    )}
                    {share.mlResults.duration && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Duration:</Text>
                        <Text style={styles.detailValue}>
                          {Math.floor(share.mlResults.duration / 60)}:{String(share.mlResults.duration % 60).padStart(2, '0')}
                        </Text>
                      </View>
                    )}
                    {share.mlResults.processedAt?.summary && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Processed:</Text>
                        <Text style={styles.detailValue}>
                          {formatDate(share.mlResults.processedAt.summary)}
                        </Text>
                      </View>
                    )}
                  </View>
                </>
              )}
            </>
          )}
          
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
          
          {share.mediaType && (
            <>
              <Text style={styles.sectionTitle}>Media</Text>
              <View style={styles.detailsContainer}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type:</Text>
                  <Text style={styles.detailValue}>{share.mediaType}</Text>
                </View>
                {share.mediaUrl && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Media URL:</Text>
                    <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
                      {share.mediaUrl}
                    </Text>
                  </View>
                )}
              </View>
              <Divider style={styles.divider} />
            </>
          )}
          
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  keyPointsHeader: {
    marginTop: 16,
    marginBottom: 8,
  },
  keyPointsList: {
    marginBottom: 8,
  },
  keyPoint: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
    marginBottom: 6,
  },
  transcriptToggle: {
    backgroundColor: '#F0F0F0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  transcriptToggleText: {
    fontSize: 14,
    color: '#0066CC',
    fontWeight: '500',
  },
  transcriptContainer: {
    backgroundColor: '#F8F8F8',
    padding: 16,
    borderRadius: 8,
    marginTop: 12,
  },
  transcriptText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#333',
  },
});

export default DetailScreen;