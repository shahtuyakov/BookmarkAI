import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';

interface EmptyStateProps {
  onAddBookmark?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ onAddBookmark }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>No Bookmarks Yet</Text>
      <Text style={styles.message}>
        Share URLs from other apps or add your first bookmark now.
      </Text>
      {onAddBookmark && (
        <Button 
          mode="contained" 
          onPress={onAddBookmark}
          style={styles.button}
          icon="plus">
          Add Bookmark
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  button: {
    paddingHorizontal: 16,
  },
});

export default EmptyState;
