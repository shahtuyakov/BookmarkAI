import browser from 'webextension-polyfill';

console.log('BookmarkAI Web Clip service worker loaded');

// TODO: Implement API communication, context menu, and auth management
// This will be expanded in Phase 4: Service Worker Background

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
    // TODO: Implement bookmark saving logic
  }
});

// Handle messages from content scripts
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('BookmarkAI: Message received in service worker', message);
  
  switch (message.type) {
    case 'BOOKMARK_PAGE':
      // TODO: Implement bookmark saving
      return { success: true };
    
    default:
      console.warn('BookmarkAI: Unknown message type', message.type);
      return { error: 'Unknown message type' };
  }
}); 