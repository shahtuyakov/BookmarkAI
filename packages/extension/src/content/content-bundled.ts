// Content script for BookmarkAI Web Clip
// This version bundles everything inline to avoid ES module issues

console.log('BookmarkAI Web Clip content script loaded');

// Since we can't use ES modules in content scripts easily, we'll use chrome API directly
declare const chrome: any;
declare const browser: any;
const browserAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

if (!browserAPI) {
  console.error('BookmarkAI: No browser API available');
}

// FAB states
type FABState = 'default' | 'hover' | 'loading' | 'success' | 'error';

class FloatingActionButton {
  private container: HTMLDivElement | null = null;
  private button: HTMLButtonElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private state: FABState = 'default';
  private isAuthenticated: boolean = false;

  constructor() {
    this.checkAuthStatus();
  }

  public async checkAuthStatus() {
    try {
      if (browserAPI && browserAPI.runtime && browserAPI.runtime.sendMessage) {
        const response = await browserAPI.runtime.sendMessage({ type: 'AUTH_GET_STATE' });
        if (response && response.success && response.data) {
          this.isAuthenticated = response.data.isAuthenticated;
        }
      }
    } catch (error) {
      console.error('BookmarkAI: Failed to check auth status:', error);
    }
  }

  public inject() {
    console.log('BookmarkAI: Starting FAB injection...');
    
    // Don't inject on certain pages
    if (this.shouldSkipInjection()) {
      console.log('BookmarkAI: Skipping FAB injection on this page');
      return;
    }

    console.log('BookmarkAI: Page is eligible for FAB');

    // Create FAB elements
    this.createFAB();
    
    // Add to page
    if (this.container) {
      document.body.appendChild(this.container);
      console.log('BookmarkAI: FAB injected successfully');
    } else {
      console.error('BookmarkAI: Failed to create FAB container');
    }
  }

  private shouldSkipInjection(): boolean {
    // Skip on extension pages, PDFs, and certain protocols
    const url = window.location.href;
    const skipPatterns = [
      /^chrome-extension:\/\//,
      /^chrome:\/\//,
      /^about:/,
      /^file:\/\//,
      /\.pdf$/i,
    ];
    
    return skipPatterns.some(pattern => pattern.test(url));
  }

  private createFAB() {
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'bookmarkai-fab-container';
    this.setContainerStyles();

    // Create button
    this.button = document.createElement('button');
    this.button.id = 'bookmarkai-fab-button';
    this.button.setAttribute('aria-label', 'Add to BookmarkAI');
    this.setButtonStyles();
    this.button.innerHTML = this.getButtonIcon();

    // Create tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'bookmarkai-fab-tooltip';
    this.tooltip.textContent = 'Add to BookmarkAI';
    this.setTooltipStyles();

    // Add event listeners
    this.button.addEventListener('click', this.handleClick.bind(this));
    this.button.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
    this.button.addEventListener('mouseleave', this.handleMouseLeave.bind(this));

    // Assemble elements
    this.container.appendChild(this.button);
    this.container.appendChild(this.tooltip);
  }

  private setContainerStyles() {
    if (!this.container) return;
    
    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: '2147483647', // Maximum z-index
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });
  }

  private setButtonStyles() {
    if (!this.button) return;
    
    Object.assign(this.button.style, {
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      backgroundColor: '#2563eb', // Blue-600
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      transition: 'all 0.3s ease',
      padding: '0',
      margin: '0',
      outline: 'none',
    });
  }

  private setTooltipStyles() {
    if (!this.tooltip) return;
    
    Object.assign(this.tooltip.style, {
      position: 'absolute',
      bottom: '70px',
      right: '0',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '14px',
      whiteSpace: 'nowrap',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'opacity 0.3s ease',
      userSelect: 'none',
    });
  }

  private getButtonIcon(): string {
    // SVG bookmark icon
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 2C4.44772 2 4 2.44772 4 3V22L12 18L20 22V3C20 2.44772 19.5523 2 19 2H5Z" 
              stroke="white" 
              stroke-width="2" 
              stroke-linecap="round" 
              stroke-linejoin="round"/>
      </svg>
    `;
  }

  private handleClick() {
    if (this.state === 'loading') return;

    if (!this.isAuthenticated) {
      this.showAuthPrompt();
      return;
    }

    this.bookmarkPage();
  }

  private handleMouseEnter() {
    if (this.tooltip && this.state !== 'loading') {
      this.tooltip.style.opacity = '1';
    }
    if (this.button) {
      this.button.style.transform = 'scale(1.1)';
      this.button.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.2)';
    }
  }

  private handleMouseLeave() {
    if (this.tooltip) {
      this.tooltip.style.opacity = '0';
    }
    if (this.button) {
      this.button.style.transform = 'scale(1)';
      this.button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    }
  }

  private async showAuthPrompt() {
    // Show a message since we can't easily open the popup
    this.setState('error');
    if (this.tooltip) {
      this.tooltip.textContent = 'Please login via extension popup';
      this.tooltip.style.opacity = '1';
      setTimeout(() => {
        if (this.tooltip) {
          this.tooltip.style.opacity = '0';
          this.tooltip.textContent = 'Add to BookmarkAI';
        }
        this.setState('default');
      }, 3000);
    }
  }

  private async bookmarkPage() {
    this.setState('loading');
    
    // Get page metadata
    const metadata = {
      url: window.location.href,
      title: document.title,
      description: this.getMetaDescription(),
      favicon: this.getFaviconUrl(),
    };

    try {
      // Send bookmark request to service worker
      if (browserAPI && browserAPI.runtime && browserAPI.runtime.sendMessage) {
        const response = await browserAPI.runtime.sendMessage({
          type: 'BOOKMARK_PAGE',
          metadata,
        });

        if (response && response.success) {
          this.setState('success');
          setTimeout(() => this.setState('default'), 2000);
        } else {
          throw new Error(response?.error || 'Bookmark failed');
        }
      } else {
        throw new Error('Browser API not available');
      }
    } catch (error: any) {
      console.error('BookmarkAI: Bookmark failed:', error);
      console.error('BookmarkAI: Error details:', {
        message: error.message,
        stack: error.stack,
        metadata: metadata,
      });
      this.setState('error');
      setTimeout(() => this.setState('default'), 3000);
    }
  }

  private setState(newState: FABState) {
    this.state = newState;
    if (!this.button) return;

    switch (newState) {
      case 'loading':
        this.button.style.backgroundColor = '#6b7280'; // Gray
        this.button.innerHTML = this.getLoadingIcon();
        this.button.style.cursor = 'wait';
        break;
      case 'success':
        this.button.style.backgroundColor = '#10b981'; // Green
        this.button.innerHTML = this.getSuccessIcon();
        break;
      case 'error':
        this.button.style.backgroundColor = '#ef4444'; // Red
        this.button.innerHTML = this.getErrorIcon();
        break;
      default:
        this.button.style.backgroundColor = '#2563eb'; // Blue
        this.button.innerHTML = this.getButtonIcon();
        this.button.style.cursor = 'pointer';
    }
  }

  private getLoadingIcon(): string {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <style>
          @keyframes rotate { to { transform: rotate(360deg); } }
        </style>
        <g style="animation: rotate 1s linear infinite; transform-origin: center;">
          <circle cx="12" cy="12" r="10" stroke="white" stroke-width="2" fill="none" 
                  stroke-dasharray="31.4" stroke-dashoffset="10" opacity="0.5"/>
        </g>
      </svg>
    `;
  }

  private getSuccessIcon(): string {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 13L9 17L19 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  private getErrorIcon(): string {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18M6 6L18 18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  private getMetaDescription(): string {
    const metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    const ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement;
    return metaDesc?.content || ogDesc?.content || '';
  }

  private getFaviconUrl(): string {
    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    const shortcutIcon = document.querySelector('link[rel="shortcut icon"]') as HTMLLinkElement;
    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
    
    const iconUrl = favicon?.href || shortcutIcon?.href || appleTouchIcon?.href || '/favicon.ico';
    
    // Make sure it's an absolute URL
    return new URL(iconUrl, window.location.origin).href;
  }

  public destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.button = null;
    this.tooltip = null;
  }
}

// Global FAB instance
let fab: FloatingActionButton | null = null;

async function init() {
  try {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectFAB);
    } else {
      injectFAB();
    }

    // Listen for messages from service worker
    if (browserAPI && browserAPI.runtime && browserAPI.runtime.onMessage) {
      browserAPI.runtime.onMessage.addListener((message: any) => {
        if (message.type === 'AUTH_STATE_CHANGED') {
          // Re-check auth status when it changes
          if (fab) {
            fab.checkAuthStatus();
          }
        }
      });
    }
  } catch (error) {
    console.error('BookmarkAI: Content script initialization failed:', error);
  }
}

function injectFAB() {
  console.log('BookmarkAI: injectFAB called, current URL:', window.location.href);
  console.log('BookmarkAI: Document ready state:', document.readyState);
  
  // Create and inject the FAB
  fab = new FloatingActionButton();
  fab.inject();
}

// Initialize the content script
init();