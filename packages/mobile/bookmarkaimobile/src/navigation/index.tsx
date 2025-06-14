// src/navigation/index.tsx
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import AuthNavigator from './auth/AuthNavigator';
import MainNavigator from './main/MainNavigator';
import { RootStackParamList } from './types';
import { useAuth } from '../contexts/AuthContext';

const Stack = createStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  // Use the real auth context to determine if user is authenticated
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default RootNavigator;
