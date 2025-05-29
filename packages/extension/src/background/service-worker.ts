import browser from 'webextension-polyfill';
import { AuthService } from '../services/auth';
import { API_BASE_URL } from '../config/auth';

console.log('BookmarkAI Web Clip service worker loaded', API_BASE_URL);

// Initialize AuthService
const authService = AuthService.getInstance();

// Generate idempotency key based on URL and current day
function generateIdempotencyKey(url: string): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const data = `${url}-${today}`;
  
  // Simple hash function for the browser environment
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `${Math.abs(hash)}-${today}`;
}

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
    const isAuthenticated = authService.isAuthenticated();
    
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
        // This would open the web app login page in a new tab
        // For now, we'll just open the web app URL
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
        const isAuthenticated = authService.isAuthenticated();
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
      // Ensure auth service is initialized before checking authentication
      await authService.ensureInitialized();
      
      // Debug: Check authentication status and log detailed info
      const authState = authService.getAuthState();
      const isAuthenticatedForBookmark = authService.isAuthenticated();
      
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

        // Get access token
        const token = await authService.getValidAccessToken();
        console.log('BookmarkAI: Got access token:', token ? 'Yes' : 'No');
        
        if (!token) {
          return { success: false, error: 'Failed to get access token' };
        }

        const sharesUrl = `${API_BASE_URL}/v1/shares`;
        const idempotencyKey = generateIdempotencyKey(metadata.url);
        const requestBody = {
          url: metadata.url,
          title: metadata.title,
          description: metadata.description,
          faviconUrl: metadata.favicon,
          source: 'webext',
        };
        
        console.log('BookmarkAI: Making API call to:', sharesUrl);
        console.log('BookmarkAI: Request body:', requestBody);
        console.log('BookmarkAI: Idempotency key:', idempotencyKey);

        // Create share/bookmark
        const response = await fetch(sharesUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(requestBody),
        });

        console.log('BookmarkAI: API response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('BookmarkAI: API error response:', errorText);
          
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }
          
          throw new Error(errorData.message || `Failed to create bookmark: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('BookmarkAI: Bookmark created successfully', data);
        
        // Notify popup to refresh shares list if it's open
        browser.runtime.sendMessage({
          type: 'BOOKMARK_CREATED',
          bookmark: data.data,
        }).catch(() => {
          // Ignore errors if popup is not open
        });

        return { success: true, data: data.data };
      } catch (error: any) {
        console.error('BookmarkAI: Failed to create bookmark:', error);
        console.error('BookmarkAI: Error stack:', error.stack);
        return { success: false, error: error.message || 'Failed to create bookmark' };
      }
    
    default:
      console.warn('BookmarkAI: Unknown message type in service worker', message.type);
      return { success: false, error: 'Unknown message type' };
  }
}); 