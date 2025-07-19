import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Text, Chip, useTheme, Avatar, Divider } from 'react-native-paper';
import type { Share, EnrichedShare } from '../../services/api/shares';

interface ShareCardProps {
  share: Share | EnrichedShare;
  onPress: (share: Share | EnrichedShare) => void;
}

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

const getPlatformIcon = (platform: string) => {
  switch (platform) {
    case 'tiktok':
      return 'music-note';
    case 'reddit':
      return 'reddit';
    case 'twitter':
    case 'x':
      return 'twitter';
    case 'youtube':
      return 'youtube';
    case 'generic':
      return 'web';
    default:
      return 'link';
  }
};

const getStatusColor = (status: string, theme: any) => {
  switch (status) {
    case 'pending':
      return theme.colors.secondary;
    case 'processing':
      return theme.colors.primary;
    case 'fetching':
      return theme.colors.primary;
    case 'done':
      return theme.colors.tertiary;
    case 'error':
      return theme.colors.error;
    default:
      return theme.colors.onSurfaceVariant;
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getMLStatusColor = (share: Share | EnrichedShare, theme: any) => {
  if (!('mlResults' in share) || !share.mlResults) {
    return theme.colors.onSurfaceVariant;
  }
  
  const { processingStatus } = share.mlResults;
  const statuses = [processingStatus.summary, processingStatus.transcript];
  
  if (statuses.some(s => s === 'failed')) {
    return theme.colors.error;
  } else if (statuses.every(s => s === 'done' || s === 'not_applicable')) {
    return theme.colors.tertiary;
  } else if (statuses.some(s => s === 'processing')) {
    return theme.colors.primary;
  }
  
  return theme.colors.secondary;
};

const getMLStatusText = (share: Share | EnrichedShare) => {
  if (!('mlResults' in share) || !share.mlResults) {
    return null;
  }
  
  const { processingStatus } = share.mlResults;
  const hasSummary = processingStatus.summary === 'done';
  const hasTranscript = processingStatus.transcript === 'done';
  
  if (hasSummary && hasTranscript) return 'AI Ready';
  if (hasSummary || hasTranscript) return 'AI Partial';
  if (processingStatus.summary === 'processing' || processingStatus.transcript === 'processing') return 'AI Processing';
  
  return null;
};

const ShareCard: React.FC<ShareCardProps> = ({ share, onPress }) => {
  const theme = useTheme();
  
  // Extract domain from URL
  const getDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return domain;
    } catch (e) {
      return url;
    }
  };
  
  // Format title or fallback to URL
  const title = share.title || share.metadata?.title || `Content from ${getDomain(share.url)}`;
  const author = share.author || share.metadata?.author;
  const description = share.description || share.metadata?.description;
  const thumbnailUrl = share.thumbnailUrl || share.metadata?.thumbnailUrl;
  
  return (
    <Card style={styles.card} onPress={() => onPress(share)}>
      {thumbnailUrl ? (
        <Card.Cover source={{ uri: thumbnailUrl }} style={styles.cardCover} />
      ) : (
        <Card.Cover 
          source={{ uri: `https://picsum.photos/seed/${share.id}/400/200` }} 
          style={styles.cardCover} 
        />
      )}
      
      <Card.Content style={styles.cardContent}>
        <View style={styles.titleContainer}>
          <Avatar.Icon 
            size={24} 
            icon={getPlatformIcon(share.platform)} 
            style={{ backgroundColor: getPlatformColor(share.platform) }} 
          />
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        </View>
        
        {author && (
          <Text style={styles.author} numberOfLines={1}>
            By {author}
          </Text>
        )}
        
        {description && (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        )}
        
        {/* ML Results Section */}
        {'mlResults' in share && share.mlResults && (
          <>
            <Divider style={styles.divider} />
            
            {share.mlResults.summary && (
              <View style={styles.mlSection}>
                <View style={styles.mlHeader}>
                  <Text style={styles.mlIcon}>📝</Text>
                  <Text style={styles.mlTitle}>AI Summary</Text>
                </View>
                <Text style={styles.mlSummary} numberOfLines={3}>
                  {share.mlResults.summary}
                </Text>
              </View>
            )}
            
            {share.mlResults.keyPoints && share.mlResults.keyPoints.length > 0 && (
              <View style={styles.keyPointsSection}>
                {share.mlResults.keyPoints.slice(0, 2).map((point: string, index: number) => (
                  <Text key={index} style={styles.keyPoint} numberOfLines={1}>
                    • {point}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}
        
        <View style={styles.metaContainer}>
          <Chip
            mode="outlined"
            style={[styles.statusChip, { borderColor: getStatusColor(share.status, theme) }]}
            textStyle={{ color: getStatusColor(share.status, theme) }}>
            {share.status.toUpperCase()}
          </Chip>
          
          {getMLStatusText(share) && (
            <Chip
              mode="outlined"
              style={[styles.statusChip, { borderColor: getMLStatusColor(share, theme) }]}
              textStyle={{ color: getMLStatusColor(share, theme), fontSize: 11 }}>
              {getMLStatusText(share)}
            </Chip>
          )}
          
          <Text style={styles.date}>{formatDate(share.createdAt)}</Text>
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    marginHorizontal: 16,
    elevation: 2,
  },
  cardCover: {
    height: 150,
  },
  cardContent: {
    paddingVertical: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    flex: 1,
  },
  author: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  metaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statusChip: {
    marginRight: 8,
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    color: '#888',
  },
  divider: {
    marginVertical: 8,
    backgroundColor: '#E0E0E0',
  },
  mlSection: {
    marginBottom: 8,
  },
  mlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  mlIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  mlTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  mlSummary: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
  },
  keyPointsSection: {
    marginTop: 4,
    marginBottom: 8,
  },
  keyPoint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#555',
    marginBottom: 2,
  },
});

export default ShareCard;
