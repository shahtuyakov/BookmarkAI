import React from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';

const SearchScreen = () => {
  const [searchQuery, setSearchQuery] = React.useState('');

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search your bookmarks..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <View style={styles.content}>
        <Text style={styles.message}>
          {searchQuery ? 'Searching for: ' + searchQuery : 'Enter search term'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
  },
});

export default SearchScreen;
