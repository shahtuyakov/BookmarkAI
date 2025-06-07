import browser from 'webextension-polyfill';
import { sdkClient } from '../sdk/client';
import { authService } from '../services/auth-unified';
import { API_BASE_URL } from '../config/auth';
import { errorLogger } from '../services/error-logger';

console.log('BookmarkAI Web Clip service worker (SDK) loaded', API_BASE_URL);

// Initialize service worker
browser.runtime.onInstalled.addListener(async (details) => {
  console.log('BookmarkAI: Extension installed/updated', details);
  
  // Create context menu
  await browser.contextMenus.create({
    id: 'bookmark-page',
    title: 'Bookmark this page',
    contexts: ['page']
  });
  
  // Initialize auth service
  await authService.ensureInitialized();
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'bookmark-page' && tab?.url) {
    console.log('BookmarkAI: Context menu bookmark triggered for', tab.url);
    
    // Check authentication before bookmarking
    const isAuthenticated = await authService.isAuthenticated();
    
    if (!isAuthenticated) {
      // Open popup to prompt login
      await browser.action.openPopup();
      return;
    }
    
    console.log('BookmarkAI: User authenticated, ready to bookmark');
  }
});

// Handle messages from content scripts and popup
browser.runtime.onMessage.addListener(async (message, _sender) => {
  console.log('BookmarkAI: Message received in service worker', message);
  
  switch (message.type) {
    case 'AUTH_INITIATE_LOGIN':
      try {
        // This would open the web app login page in a new tab
        const webAppUrl = `${API_BASE_URL.replace('/api/v1', '')}/login`;
        await browser.tabs.create({ url: webAppUrl });
        return { success: true };
      } catch (error) {
        console.error('BookmarkAI: Login initiation failed:', error);
        return { success: false, error: 'Failed to start login process' };
      }
    
    case 'AUTH_DIRECT_LOGIN':
      try {
        const { credentials } = message;
        if (!credentials || !credentials.email || !credentials.password) {
          return { success: false, error: 'Invalid credentials' };
        }
        
        console.log('BookmarkAI: Starting login for:', credentials.email);
        await authService.login(credentials);
        
        // Debug: Check auth state after login
        const postLoginState = authService.getAuthState();
        console.log('BookmarkAI: Auth state after login:', postLoginState);
        
        return { success: true };
      } catch (error: any) {
        console.error('BookmarkAI: Direct login failed:', error);
        return { success: false, error: error.message || 'Login failed' };
      }
    
    case 'AUTH_GET_STATE':
      await authService.ensureInitialized();
      return { 
        success: true, 
        data: authService.getAuthState()
      };
    
    case 'AUTH_LOGOUT':
      try {
        await authService.logout();
        return { success: true };
      } catch (error) {
        console.error('BookmarkAI: Logout failed:', error);
        return { success: false, error: 'Failed to logout' };
      }
    
    case 'AUTH_GET_TOKEN':
      try {
        const token = await authService.getValidAccessToken();
        return { success: true, token };
      } catch (error: any) {
        console.error('BookmarkAI: Token retrieval failed:', error);
        return { success: false, error: error.message || 'Failed to get access token' };
      }
    
    case 'GET_RECENT_SHARES':
      try {
        const isAuthenticated = await authService.isAuthenticated();
        if (!isAuthenticated) {
          return { success: false, error: 'User not authenticated', data: [] };
        }

        // Use SDK to fetch shares
        const sharesResponse = await errorLogger.wrapSDKCall(
          () => sdkClient.shares.list({ limit: 10 }),
          'GET_RECENT_SHARES'
        );

        console.log('BookmarkAI: Fetched shares via SDK:', sharesResponse);
        
        return { 
          success: true, 
          data: sharesResponse.items 
        };
      } catch (error: any) {
        console.error('BookmarkAI: Failed to get recent shares:', error);
        return { success: false, error: error.message || 'Could not fetch shares', data: [] };
      }
    
    case 'OPEN_TIMELINE':
      try {
        // Open the web app timeline in a new tab
        const webAppUrl = import.meta.env.VITE_WEB_APP_URL || 'https://app.bookmarkai.com';
        await browser.tabs.create({ url: `${webAppUrl}/timeline` });
        return { success: true };
      } catch (error) {
        console.error('BookmarkAI: Failed to open timeline:', error);
        return { success: false, error: 'Failed to open timeline' };
      }
    
    case 'BOOKMARK_PAGE':
      // Ensure auth service is initialized before checking authentication
      await authService.ensureInitialized();
      
      // Check authentication status
      const authState = authService.getAuthState();
      const isAuthenticatedForBookmark = await authService.isAuthenticated();
      
      console.log('BookmarkAI: Auth state for bookmark:', authState);
      console.log('BookmarkAI: Is authenticated:', isAuthenticatedForBookmark);
      
      if (!isAuthenticatedForBookmark) {
        return { success: false, error: 'User not authenticated' };
      }
      
      try {
        const { metadata } = message;
        console.log('BookmarkAI: Processing bookmark request:', metadata);
        
        if (!metadata || !metadata.url) {
          return { success: false, error: 'Invalid bookmark data' };
        }

        // Use SDK to create share with error handling
        const share = await errorLogger.wrapSDKCall(
          () => sdkClient.shares.create({
            url: metadata.url,
            title: metadata.title,
          }),
          'BOOKMARK_PAGE'
        );

        console.log('BookmarkAI: Bookmark created successfully via SDK', share);
        
        // Notify popup to refresh shares list if it's open
        browser.runtime.sendMessage({
          type: 'BOOKMARK_CREATED',
          bookmark: share,
        }).catch(() => {
          // Ignore errors if popup is not open
        });

        return { success: true, data: share };
      } catch (error: any) {
        console.error('BookmarkAI: Failed to create bookmark:', error);
        return { success: false, error: error.message || 'Failed to create bookmark' };
      }
    
    case 'LOG_ERROR':
      try {
        const { url, error, details } = message;
        const errorType = details?.errorType || 'GENERAL';
        await errorLogger.logError(errorType, url || 'unknown', error || 'Unknown error', details);
        return { success: true };
      } catch (error) {
        console.error('BookmarkAI: Failed to log error:', error);
        return { success: false, error: 'Failed to log error' };
      }
    
    case 'GET_ERROR_LOGS':
      try {
        const logs = await errorLogger.getErrorLogs();
        return { success: true, data: logs };
      } catch (error) {
        console.error('BookmarkAI: Failed to get error logs:', error);
        return { success: false, error: 'Failed to get error logs' };
      }
    
    case 'GET_ERROR_STATS':
      try {
        const stats = await errorLogger.getErrorStats();
        return { success: true, data: stats };
      } catch (error) {
        console.error('BookmarkAI: Failed to get error stats:', error);
        return { success: false, error: 'Failed to get error stats' };
      }
    
    case 'SWITCH_AUTH_MODE':
      try {
        const { useSDK } = message;
        await authService.switchAuthMode(useSDK);
        return { success: true };
      } catch (error) {
        console.error('BookmarkAI: Failed to switch auth mode:', error);
        return { success: false, error: 'Failed to switch auth mode' };
      }
    
    default:
      console.warn('BookmarkAI: Unknown message type in service worker', message.type);
      return { success: false, error: 'Unknown message type' };
  }
});

// Listen for alarms (if needed for periodic tasks)
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync-shares') {
    // Periodic sync logic here if needed
    console.log('BookmarkAI: Sync alarm triggered');
  }
});

// Monitor online/offline status
browser.runtime.onConnect.addListener((port) => {
  if (port.name === 'network-status') {
    port.onMessage.addListener(async (message) => {
      if (message.type === 'online') {
        console.log('BookmarkAI: Network is online');
        // Could trigger sync here
      } else if (message.type === 'offline') {
        console.log('BookmarkAI: Network is offline');
      }
    });
  }
});