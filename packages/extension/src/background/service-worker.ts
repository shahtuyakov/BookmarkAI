import browser from 'webextension-polyfill';
import { AuthService } from '../services/auth';

console.log('BookmarkAI Web Clip service worker loaded');

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
browser.runtime.onMessage.addListener(async (message, _sender, _sendResponse) => {
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
      } catch (error) {
        console.error('BookmarkAI: Token retrieval failed:', error);
        return { success: false, error: 'Failed to get access token' };
      }
    
    case 'BOOKMARK_PAGE':
      // Check authentication first
      const isAuthenticated = await authService.isAuthenticated();
      
      if (!isAuthenticated) {
        return { success: false, error: 'User not authenticated' };
      }
      
      // TODO: Implement bookmark saving (Phase 4)
      console.log('BookmarkAI: Bookmark request authenticated');
      return { success: true };
    
    default:
      console.warn('BookmarkAI: Unknown message type', message.type);
      return { error: 'Unknown message type' };
  }
}); 