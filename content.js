// Content script for Blocky ad blocker
class BlockyContent {
  constructor() {
    this.blockedCount = 0;
    this.init();
  }

  init() {
    // Inject CSS immediately for faster blocking
    this.injectBlockingCSS();
    
    // Start blocking immediately
    this.setupObserver();
    this.blockExistingAds();
    this.setupEventListeners();
    
    console.log('Blocky: Content script initialized');
  }

  setupObserver() {
    // Create a mutation observer to watch for dynamically added content
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.blockAdsInElement(node);
            }
          });
        }
      });
    });

    // Start observing
    this.observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  blockExistingAds() {
    // Block ads that are already in the DOM
    this.blockAdsInElement(document);
  }

  blockAdsInElement(element) {
    if (!element || !element.querySelectorAll) return;

    // Common ad selectors
    const adSelectors = [
      // Google Ads
      '.adsbygoogle',
      'ins.adsbygoogle',
      '[data-ad-client]',
      '[data-ad-slot]',
      
      // Generic ad classes
      '.ad', '.ads', '.advertisement', '.banner-ad',
      '.google-ad', '.ad-banner', '.ad-container',
      '.sponsored', '.promotion', '.promo',
      
      // Common ad networks
      '[src*="doubleclick"]',
      '[src*="googleadservices"]',
      '[src*="googlesyndication"]',
      '[href*="doubleclick"]',
      
      // Social media ads
      '[data-testid*="placementTracking"]',
      '.facebook_ad_provider',
      '[aria-label*="Sponsored"]',
      
      // Video ads
      '.video-ads',
      '.preroll-ads',
      '.overlay-ads'
    ];

    adSelectors.forEach(selector => {
      try {
        const elements = element.querySelectorAll(selector);
        elements.forEach(el => this.blockElement(el));
      } catch (error) {
        // Ignore invalid selectors
      }
    });

    // Block by text content patterns
    this.blockByTextContent(element);
    
    // Block by URL patterns
    this.blockByUrlPatterns(element);
  }

  blockByTextContent(element) {
    const adTextPatterns = [
      /advertisement/i,
      /sponsored/i,
      /promoted/i,
      /ads by/i,
      /google ads/i
    ];

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    textNodes.forEach(textNode => {
      const text = textNode.textContent.trim();
      if (adTextPatterns.some(pattern => pattern.test(text))) {
        const parentElement = textNode.parentElement;
        if (parentElement && !parentElement.hasAttribute('data-blocky-hidden')) {
          this.blockElement(parentElement);
        }
      }
    });
  }

  blockByUrlPatterns(element) {
    const urlPatterns = [
      /doubleclick\.net/i,
      /googleadservices\.com/i,
      /googlesyndication\.com/i,
      /facebook\.com\/tr/i,
      /amazon-adsystem\.com/i,
      /adsystem\.amazon/i
    ];

    const elementsWithUrls = element.querySelectorAll('img, script, iframe, embed, object');
    
    elementsWithUrls.forEach(el => {
      const src = el.src || el.href || '';
      if (urlPatterns.some(pattern => pattern.test(src))) {
        this.blockElement(el);
      }
    });
  }

  blockElement(element) {
    if (!element || element.hasAttribute('data-blocky-hidden')) {
      return;
    }

    // Mark as blocked
    element.setAttribute('data-blocky-hidden', 'true');
    
    // Apply blocking styles
    element.style.display = 'none !important';
    element.style.visibility = 'hidden !important';
    element.style.opacity = '0 !important';
    element.style.height = '0 !important';
    element.style.width = '0 !important';
    element.style.margin = '0 !important';
    element.style.padding = '0 !important';
    
    // Remove from layout
    element.remove();
    
    this.blockedCount++;
    this.updateBlockingStats();
    
    console.log(`Blocky: Blocked ad element #${this.blockedCount}`, element);
  }

  setupEventListeners() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'GET_CONTENT_STATS':
          sendResponse({
            blockedCount: this.blockedCount,
            url: window.location.href
          });
          break;
          
        case 'TOGGLE_CONTENT_BLOCKING':
          if (message.enabled) {
            this.startBlocking();
          } else {
            this.stopBlocking();
          }
          sendResponse({ success: true });
          break;
      }
    });

    // Block ads when page loads
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.blockExistingAds();
      });
    }

    // Block ads on dynamic content
    window.addEventListener('load', () => {
      this.blockExistingAds();
    });
  }

  updateBlockingStats() {
    // Send stats to background script
    chrome.runtime.sendMessage({
      type: 'UPDATE_CONTENT_STATS',
      blockedCount: this.blockedCount,
      url: window.location.href
    }).catch(error => {
      console.error('Failed to send content stats:', error);
    });
  }

  async getTabId() {
    // Helper to get current tab ID from background script
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_ID' });
      return response?.tabId;
    } catch (error) {
      console.error('Failed to get tab ID:', error);
      return null;
    }
  }

  startBlocking() {
    if (!this.observer) {
      this.setupObserver();
    }
    this.blockExistingAds();
  }

  stopBlocking() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    // Restore hidden elements
    const hiddenElements = document.querySelectorAll('[data-blocky-hidden]');
    hiddenElements.forEach(el => {
      el.removeAttribute('data-blocky-hidden');
      el.style.display = '';
      el.style.visibility = '';
      el.style.opacity = '';
      el.style.height = '';
      el.style.width = '';
      el.style.margin = '';
      el.style.padding = '';
    });
  }

  // CSS injection for additional blocking
  injectBlockingCSS() {
    const css = `
      /* Hide common ad containers */
      .adsbygoogle,
      ins.adsbygoogle,
      .google-ad,
      .advertisement,
      .ad-banner,
      .sponsored-content,
      [data-ad-client],
      [data-ad-slot] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        height: 0 !important;
        width: 0 !important;
      }

      /* Remove ad spacing */
      .ad-container:empty,
      .banner-ad:empty,
      .advertisement:empty {
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
      }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    style.setAttribute('data-blocky-css', 'true');
    
    (document.head || document.documentElement).appendChild(style);
  }
}

// Initialize content script
function initializeBlocky() {
  // Ensure we don't initialize twice
  if (window.blockyInitialized) {
    return;
  }
  window.blockyInitialized = true;
  
  console.log('Blocky: Initializing content script for', window.location.href);
  new BlockyContent();
}

// Initialize immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeBlocky);
} else {
  initializeBlocky();
}
