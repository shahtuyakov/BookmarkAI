import { MD3LightTheme, MD3DarkTheme, MD3Theme } from 'react-native-paper';
import { useColorScheme } from 'react-native';

// Define custom colors
const customColors = {
  primary: '#007AFF', // iOS blue
  secondary: '#FF9500', // Orange
  tertiary: '#34C759', // Green
  error: '#FF3B30',
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceVariant: '#EFEFF4',
  onPrimary: '#FFFFFF',
  onSecondary: '#FFFFFF',
  onTertiary: '#FFFFFF',
  onBackground: '#000000',
  onSurface: '#000000',
  onSurfaceVariant: '#1C1C1E',
  outline: '#DDDDDD',
};

// Define custom dark colors
const customDarkColors = {
  primary: '#0A84FF', // iOS dark mode blue
  secondary: '#FF9F0A', // Dark mode orange
  tertiary: '#30D158', // Dark mode green
  error: '#FF453A',
  background: '#000000',
  surface: '#1C1C1E',
  surfaceVariant: '#2C2C2E',
  onPrimary: '#FFFFFF',
  onSecondary: '#FFFFFF',
  onTertiary: '#FFFFFF',
  onBackground: '#FFFFFF',
  onSurface: '#FFFFFF',
  onSurfaceVariant: '#EBEBF5',
  outline: '#444444',
};

// Create theme with custom colors
export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...customColors,
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...customDarkColors,
  },
};

// Hook to get the current theme based on system appearance
export const useAppTheme = () => {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkTheme : lightTheme;
};

export default {
  lightTheme,
  darkTheme,
};
