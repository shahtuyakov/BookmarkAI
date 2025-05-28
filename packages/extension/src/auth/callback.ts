// OAuth callback handler for PKCE flow
// This will be expanded in Phase 2: Authentication System

console.log('BookmarkAI: OAuth callback page loaded');

async function handleCallback() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
      console.error('BookmarkAI: OAuth error:', error);
      // TODO: Handle OAuth error
      return;
    }

    if (code && state) {
      console.log('BookmarkAI: OAuth code received, processing...');
      // TODO: Exchange code for token using PKCE
      
      // Close the callback window after processing
      setTimeout(() => {
        window.close();
      }, 2000);
    }
  } catch (error) {
    console.error('BookmarkAI: Callback processing failed:', error);
  }
}

// Process the callback when page loads
handleCallback(); 