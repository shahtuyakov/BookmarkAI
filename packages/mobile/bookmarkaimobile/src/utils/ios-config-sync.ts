import { Platform } from 'react-native';
import { API_BASE_URL } from '../services/api/client-config';

/**
 * Sync configuration to iOS native side for share extension access
 * 
 * NOTE: Currently using hardcoded values in ShareViewController.swift
 * TODO: Implement proper App Groups configuration sharing
 */
export const syncIOSConfiguration = async () => {
  if (Platform.OS !== 'ios') {
    return;
  }

  // For now, just log what would be synced
  console.log('📱 iOS Configuration (hardcoded in share extension):', API_BASE_URL);
};

/**
 * Get the current API URL from iOS native side
 */
export const getIOSAPIBaseURL = async (): Promise<string | null> => {
  // Return the same URL we're using in React Native
  return API_BASE_URL;
};

// Call this when the app launches
export const initializeIOSConfiguration = () => {
  syncIOSConfiguration();
};