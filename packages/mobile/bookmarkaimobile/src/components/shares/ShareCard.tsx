import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Text, Chip, useTheme, Avatar } from 'react-native-paper';
import { Share } from '@bookmarkai/sdk';

interface ShareCardProps {
  share: Share;
  onPress: (share: Share) => void;
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
  const title = share.metadata?.title || `Content from ${getDomain(share.url)}`;
  
  return (
    <Card style={styles.card} onPress={() => onPress(share)}>
      {share.metadata?.thumbnailUrl ? (
        <Card.Cover source={{ uri: share.metadata.thumbnailUrl }} style={styles.cardCover} />
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
        
        {share.metadata?.author && (
          <Text style={styles.author} numberOfLines={1}>
            By {share.metadata.author}
          </Text>
        )}
        
        {share.metadata?.description && (
          <Text style={styles.description} numberOfLines={2}>
            {share.metadata.description}
          </Text>
        )}
        
        <View style={styles.metaContainer}>
          <Chip
            mode="outlined"
            style={[styles.statusChip, { borderColor: getStatusColor(share.status, theme) }]}
            textStyle={{ color: getStatusColor(share.status, theme) }}>
            {share.status.toUpperCase()}
          </Chip>
          
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
});

export default ShareCard;
