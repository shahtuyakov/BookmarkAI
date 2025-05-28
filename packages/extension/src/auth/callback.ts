import { AuthService } from '../services/auth';

console.log('BookmarkAI: OAuth callback page loaded');

document.addEventListener('DOMContentLoaded', async () => {
  const messageElement = document.getElementById('message');
  const statusElement = document.getElementById('status');
  const loadingElement = document.getElementById('loading');

  const authService = AuthService.getInstance();

  if (loadingElement) loadingElement.style.display = 'block';

  try {
    // Pass the entire URL for the service to parse
    await authService.handleCallback(window.location.href);

    if (statusElement) statusElement.textContent = 'Success!';
    if (messageElement) messageElement.textContent = 'Authentication successful. You can close this tab.';
    // Optionally, close the tab automatically after a delay
    // setTimeout(() => window.close(), 3000);
  } catch (error: any) {
    console.error('BookmarkAI: OAuth Callback Error:', error);
    if (statusElement) statusElement.textContent = 'Error';
    if (messageElement) {
      messageElement.textContent = `Authentication failed: ${error.message || 'Unknown error'}. Please try again or contact support.`;
      (messageElement as HTMLElement).style.color = 'red';
    }
  } finally {
    if (loadingElement) loadingElement.style.display = 'none';
  }
}); 