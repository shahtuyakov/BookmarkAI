import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useColorScheme } from 'react-native';
import HomeStack from './HomeStack';
import SearchScreen from '../../screens/main/SearchScreen';
import ProfileScreen from '../../screens/main/ProfileScreen';
import { MainTabParamList } from '../types';

// We'll replace these with proper icons later
const HomeIcon = () => <></>;
const SearchIcon = () => <></>;
const ProfileIcon = () => <></>;

const Tab = createBottomTabNavigator<MainTabParamList>();

const MainNavigator = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
          borderTopColor: isDark ? '#38383A' : '#C6C6C8',
        },
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'HomeTab') {
            return <HomeIcon />;
          } else if (route.name === 'SearchTab') {
            return <SearchIcon />;
          } else if (route.name === 'ProfileTab') {
            return <ProfileIcon />;
          }
          return null;
        },
      })}>
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          title: 'Home',
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchScreen}
        options={{
          title: 'Search',
          headerShown: true,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          headerShown: true,
        }}
      />
    </Tab.Navigator>
  );
};

export default MainNavigator;
