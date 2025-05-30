import browser from 'webextension-polyfill';

console.log('BookmarkAI Web Clip content script loaded');

// FAB states
type FABState = 'default' | 'hover' | 'loading' | 'success' | 'error';

class FloatingActionButton {
  private container: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private button: HTMLButtonElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private toast: HTMLDivElement | null = null;
  private state: FABState = 'default';
  private isAuthenticated: boolean = false;

  constructor() {
    this.checkAuthStatus();
  }

  public async checkAuthStatus() {
    try {
      const response = await browser.runtime.sendMessage({ type: 'AUTH_GET_STATE' });
      if (response && response.success && response.data) {
        this.isAuthenticated = response.data.isAuthenticated;
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
    // Create container (host element)
    this.container = document.createElement('div');
    this.container.id = 'bookmarkai-fab-host';
    
    // Create shadow DOM
    this.shadowRoot = this.container.attachShadow({ mode: 'closed' });
    
    // Create styles for shadow DOM
    const style = document.createElement('style');
    style.textContent = this.getShadowStyles();
    
    // Create wrapper div inside shadow DOM
    const wrapper = document.createElement('div');
    wrapper.className = 'fab-wrapper';

    // Create button
    this.button = document.createElement('button');
    this.button.className = 'fab-button';
    this.button.setAttribute('aria-label', 'Add to BookmarkAI');
    this.button.innerHTML = this.getButtonIcon();

    // Create tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'fab-tooltip';
    this.tooltip.textContent = 'Add to BookmarkAI';

    // Create toast notification
    this.toast = document.createElement('div');
    this.toast.className = 'fab-toast';
    this.toast.innerHTML = `
      <span class="toast-text">Saved to BookmarkAI</span>
      <a href="#" class="toast-link">View in Timeline</a>
    `;

    // Add event listeners
    this.button.addEventListener('click', this.handleClick.bind(this));
    this.button.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
    this.button.addEventListener('mouseleave', this.handleMouseLeave.bind(this));

    // Add toast link click handler
    const toastLink = this.toast.querySelector('.toast-link');
    if (toastLink) {
      toastLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.openTimeline();
      });
    }

    // Assemble elements in shadow DOM
    wrapper.appendChild(this.button);
    wrapper.appendChild(this.tooltip);
    wrapper.appendChild(this.toast);
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(wrapper);
    
    // Set minimal styles on host element
    this.setHostStyles();
  }

  private setHostStyles() {
    if (!this.container) return;
    
    // Set positioning styles on the host element with important flag
    this.container.style.cssText = `
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      z-index: 2147483647 !important;
      width: auto !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      background: transparent !important;
      display: block !important;
      box-sizing: border-box !important;
      transform: none !important;
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
      overflow: visible !important;
    `;
  }

  private getShadowStyles(): string {
    return `
      :host {
        all: initial;
        display: block;
      }
      
      * {
        box-sizing: border-box;
      }
      
      .fab-wrapper {
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      
      .fab-button {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background-color: #2563eb;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
        padding: 0;
        margin: 0;
        outline: none;
        position: relative;
        overflow: visible;
      }
      
      .fab-button:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
      }
      
      .fab-button svg {
        pointer-events: none;
      }
      
      .fab-button.loading {
        background-color: #6b7280;
        cursor: wait;
      }
      
      .fab-button.success {
        background-color: #10b981;
      }
      
      .fab-button.error {
        background-color: #ef4444;
      }
      
      .fab-tooltip {
        position: absolute;
        bottom: 70px;
        right: 0;
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 14px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
        user-select: none;
      }
      
      .fab-tooltip.visible {
        opacity: 1;
      }
      
      @keyframes rotate {
        to { transform: rotate(360deg); }
      }
      
      .loading-spinner {
        animation: rotate 1s linear infinite;
      }
      
      .fab-toast {
        position: absolute;
        bottom: 70px;
        right: 0;
        background-color: #1a1a1a;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 14px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s ease;
        transform: translateY(10px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 200px;
      }
      
      .fab-toast.visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }
      
      .toast-text {
        flex: 1;
      }
      
      .toast-link {
        color: #60a5fa;
        text-decoration: none;
        font-weight: 500;
        transition: color 0.2s ease;
      }
      
      .toast-link:hover {
        color: #93bbfc;
        text-decoration: underline;
      }
    `;
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
      this.tooltip.classList.add('visible');
    }
  }

  private handleMouseLeave() {
    if (this.tooltip) {
      this.tooltip.classList.remove('visible');
    }
  }

  private async showAuthPrompt() {
    // Open the extension popup to prompt login
    try {
      await browser.runtime.sendMessage({ type: 'OPEN_POPUP_FOR_AUTH' });
    } catch (error) {
      console.error('BookmarkAI: Failed to open popup:', error);
      // Fallback: show a message
      this.setState('error');
      if (this.tooltip) {
        this.tooltip.textContent = 'Please login via extension popup';
        this.tooltip.classList.add('visible');
        setTimeout(() => {
          if (this.tooltip) {
            this.tooltip.classList.remove('visible');
            this.tooltip.textContent = 'Add to BookmarkAI';
          }
          this.setState('default');
        }, 3000);
      }
    }
  }

  private async bookmarkPage() {
    this.setState('loading');

    try {
      // Check if extension context is still valid
      if (!browser.runtime?.id) {
        throw new Error('Extension context invalidated. Please refresh the page.');
      }

      // Get page metadata
      const metadata = {
        url: window.location.href,
        title: document.title,
        description: this.getMetaDescription(),
        favicon: this.getFaviconUrl(),
      };

      // Send bookmark request to service worker
      const response = await browser.runtime.sendMessage({
        type: 'BOOKMARK_PAGE',
        metadata,
      });

      if (response && response.success) {
        this.setState('success');
        this.showToast();
        setTimeout(() => this.setState('default'), 2000);
      } else {
        throw new Error(response?.error || 'Bookmark failed');
      }
    } catch (error) {
      console.error('BookmarkAI: Bookmark failed:', error);
      
      // Handle specific error cases
      if (error instanceof Error && error.message?.includes('Extension context invalidated')) {
        // Show a more user-friendly message for this common error
        if (this.tooltip) {
          this.tooltip.textContent = 'Extension updated. Please refresh the page.';
          this.tooltip.classList.add('visible');
          setTimeout(() => {
            if (this.tooltip) {
              this.tooltip.classList.remove('visible');
              this.tooltip.textContent = 'Add to BookmarkAI';
            }
          }, 4000);
        }
      }
      
      this.setState('error');
      setTimeout(() => this.setState('default'), 3000);
    }
  }

  private setState(newState: FABState) {
    this.state = newState;
    if (!this.button) return;

    // Remove all state classes
    this.button.classList.remove('loading', 'success', 'error');

    switch (newState) {
      case 'loading':
        this.button.classList.add('loading');
        this.button.innerHTML = this.getLoadingIcon();
        break;
      case 'success':
        this.button.classList.add('success');
        this.button.innerHTML = this.getSuccessIcon();
        break;
      case 'error':
        this.button.classList.add('error');
        this.button.innerHTML = this.getErrorIcon();
        break;
      default:
        this.button.innerHTML = this.getButtonIcon();
    }
  }

  private getLoadingIcon(): string {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="loading-spinner">
        <circle cx="12" cy="12" r="10" stroke="white" stroke-width="2" fill="none" 
                stroke-dasharray="31.4" stroke-dashoffset="10" opacity="0.5"/>
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

  private showToast() {
    if (!this.toast) return;
    
    // Show the toast
    this.toast.classList.add('visible');
    
    // Hide the toast after 5 seconds
    setTimeout(() => {
      if (this.toast) {
        this.toast.classList.remove('visible');
      }
    }, 5000);
  }

  private async openTimeline() {
    try {
      // Get the web app URL from config
      const response = await browser.runtime.sendMessage({ type: 'OPEN_TIMELINE' });
      if (!response || !response.success) {
        console.error('BookmarkAI: Failed to open timeline');
      }
    } catch (error) {
      console.error('BookmarkAI: Failed to open timeline:', error);
    }
  }

  public destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.button = null;
    this.tooltip = null;
    this.toast = null;
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
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'AUTH_STATE_CHANGED') {
        // Re-check auth status when it changes
        if (fab) {
          fab.checkAuthStatus();
        }
      }
    });
    
    // Set up CSP error detection
    setupCSPErrorDetection();
  } catch (error) {
    console.error('BookmarkAI: Content script initialization failed:', error);
    // Log the error to service worker
    const errorMessage = error instanceof Error ? error.message : 'Content script initialization failed';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    browser.runtime.sendMessage({
      type: 'LOG_ERROR',
      error: errorMessage,
      url: window.location.href,
      details: { stack: errorStack }
    }).catch(() => {});
  }
}

function setupCSPErrorDetection() {
  // Listen for security policy violations
  document.addEventListener('securitypolicyviolation', (e) => {
    console.warn('BookmarkAI: CSP violation detected:', e);
    
    // Log CSP error to service worker
    browser.runtime.sendMessage({
      type: 'LOG_ERROR',
      error: `CSP violation: ${e.violatedDirective}`,
      url: window.location.href,
      details: {
        errorType: 'CSP',
        violatedDirective: e.violatedDirective,
        blockedURI: e.blockedURI,
        lineNumber: e.lineNumber,
        columnNumber: e.columnNumber,
        sourceFile: e.sourceFile
      }
    }).catch(() => {});
  });
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