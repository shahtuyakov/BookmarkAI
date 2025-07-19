import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const OrDivider: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <Text style={styles.text}>OR</Text>
      <View style={styles.line} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  text: {
    marginHorizontal: 16,
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default OrDivider;