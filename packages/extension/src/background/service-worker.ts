import browser from 'webextension-polyfill';
import { AuthService } from '../services/auth';
import { API_BASE_URL } from '../config/oauth';

console.log('BookmarkAI Web Clip service worker loaded', API_BASE_URL);

// Initialize AuthService
const authService = AuthService.getInstance();

// Initialize service worker
browser.runtime.onInstalled.addListener(async (details) => {
  console.log('BookmarkAI: Extension installed/updated', details);
  
  // Create context menu
  await browser.contextMenus.create({
    id: 'bookmark-page',
    title: 'Bookmark this page',
    contexts: ['page']
  });
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
    
    // TODO: Implement bookmark saving logic (Phase 4)
    console.log('BookmarkAI: User authenticated, ready to bookmark');
  }
});

// Handle messages from content scripts and popup
browser.runtime.onMessage.addListener(async (message, _sender) => {
  console.log('BookmarkAI: Message received in service worker', message);
  
  switch (message.type) {
    case 'AUTH_INITIATE_LOGIN':
      try {
        await authService.initiateLogin();
        return { success: true };
      } catch (error) {
        console.error('BookmarkAI: Login initiation failed:', error);
        return { success: false, error: 'Failed to start login process' };
      }
    
    case 'AUTH_GET_STATE':
      return { 
        success: true, 
        authState: authService.getAuthState(),
        isAuthenticated: await authService.isAuthenticated()
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
        const token = await authService.getValidAccessToken();
        if (!token) {
          return { success: false, error: 'Missing access token', data: [] };
        }

        // Construct the shares URL using API_BASE_URL and append /shares
        // Example: VITE_API_BASE_URL=http://localhost:3001/api/v1
        // Result: http://localhost:3001/api/v1/shares?limit=10&sort=createdAt:desc
        const sharesUrl = `${API_BASE_URL}/shares?limit=10&sort=createdAt:desc`; 

        console.log(`Service Worker: Fetching shares from ${sharesUrl}`);

        const response = await fetch(sharesUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error('BookmarkAI: Failed to fetch shares:', response.status, errorData);
          throw new Error(`Failed to fetch shares: ${response.status} - ${errorData}`);
        }
        const responseData = await response.json(); 
        
        if (responseData.success && responseData.data && Array.isArray(responseData.data.items)) {
            return { success: true, data: responseData.data.items };
        } else if (Array.isArray(responseData.items)) { // Fallback for simpler { items: [] } structure
            return { success: true, data: responseData.items };
        } else if (responseData.success && Array.isArray(responseData.data)) { // Another common pattern { success: true, data: [] }
            return { success: true, data: responseData.data };
        }
         return { success: false, error: 'Invalid response structure from shares API', data: [] };

      } catch (error: any) {
        console.error('BookmarkAI: Failed to get recent shares:', error);
        return { success: false, error: error.message || 'Could not fetch shares', data: [] };
      }
    
    case 'BOOKMARK_PAGE':
      // Check authentication first
      const isAuthenticatedForBookmark = await authService.isAuthenticated();
      
      if (!isAuthenticatedForBookmark) {
        return { success: false, error: 'User not authenticated' };
      }
      
      // TODO: Implement bookmark saving (Phase 4)
      // Ensure to use API_BASE_URL for constructing the bookmark/share creation endpoint
      console.log('BookmarkAI: Bookmark request authenticated, API_BASE_URL available for use:', API_BASE_URL);
      // Example POST URL: `${API_BASE_URL}/shares`
      return { success: true, message: "Bookmark functionality not fully implemented yet." }; // Placeholder
    
    default:
      console.warn('BookmarkAI: Unknown message type in service worker', message.type);
      return { success: false, error: 'Unknown message type' };
  }
}); 