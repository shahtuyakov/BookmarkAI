import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from '../../screens/main/HomeScreen';
import DetailScreen from '../../screens/main/DetailScreen';
import { HomeStackParamList } from '../types';

const Stack = createStackNavigator<HomeStackParamList>();

const HomeStack = () => {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="Detail"
        component={DetailScreen}
        options={({ route }) => ({
          title: route.params.title,
          headerShown: true,
        })}
      />
    </Stack.Navigator>
  );
};

export default HomeStack;
