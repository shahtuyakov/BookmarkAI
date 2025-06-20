import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

// Auth Stack
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

// Home Stack (nested inside Home Tab)
export type HomeStackParamList = {
  Home: undefined;
  Detail: { id: string; title: string };
};

// Main Tab
export type MainTabParamList = {
  HomeTab: undefined;
  SearchTab: undefined;
  ProfileTab: undefined;
};

// Root Navigator
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

// Navigation Props Types
export type AuthScreenNavigationProp<T extends keyof AuthStackParamList> = StackNavigationProp<
  AuthStackParamList,
  T
>;

export type HomeScreenNavigationProp<T extends keyof HomeStackParamList> = StackNavigationProp<
  HomeStackParamList,
  T
>;

export type DetailScreenRouteProp = RouteProp<HomeStackParamList, 'Detail'>;
