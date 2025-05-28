import { AuthService } from '../services/auth';

console.log('BookmarkAI: OAuth callback page loaded');

/**
 * Handle OAuth callback - process authorization code and complete authentication
 */
async function handleCallback() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('BookmarkAI: OAuth error:', error, errorDescription);
      showError(`Authentication failed: ${error}`);
      return;
    }

    // Validate required parameters
    if (!code || !state) {
      console.error('BookmarkAI: Missing required OAuth parameters');
      showError('Invalid authentication response');
      return;
    }

    console.log('BookmarkAI: Processing OAuth callback...');
    showProgress('Completing authentication...');

    // Process the callback using AuthService
    const authService = AuthService.getInstance();
    const success = await authService.handleCallback(code, state);

    if (success) {
      showSuccess('Authentication successful!');
      console.log('BookmarkAI: Authentication completed successfully');
      
      // Close the callback window after a short delay
      setTimeout(() => {
        window.close();
      }, 2000);
    } else {
      showError('Authentication failed. Please try again.');
    }

  } catch (error) {
    console.error('BookmarkAI: Callback processing failed:', error);
    showError('An unexpected error occurred during authentication');
  }
}

/**
 * UI Helper functions for callback page
 */
function showProgress(message: string) {
  updateUI(message, 'progress');
}

function showSuccess(message: string) {
  updateUI(message, 'success');
}

function showError(message: string) {
  updateUI(message, 'error');
}

function updateUI(message: string, type: 'progress' | 'success' | 'error') {
  const container = document.querySelector('.container') as HTMLElement;
  if (!container) return;

  const spinner = container.querySelector('.spinner') as HTMLElement;
  const heading = container.querySelector('h2') as HTMLElement;
  const paragraph = container.querySelector('p') as HTMLElement;

  if (type === 'success') {
    if (spinner) spinner.style.display = 'none';
    if (heading) heading.textContent = 'Authentication Successful!';
    if (paragraph) paragraph.textContent = message;
    container.style.color = '#22c55e';
  } else if (type === 'error') {
    if (spinner) spinner.style.display = 'none';
    if (heading) heading.textContent = 'Authentication Failed';
    if (paragraph) paragraph.textContent = message;
    container.style.color = '#ef4444';
  } else {
    if (heading) heading.textContent = 'Completing authentication...';
    if (paragraph) paragraph.textContent = message;
  }
}

// Process the callback when page loads
handleCallback(); 