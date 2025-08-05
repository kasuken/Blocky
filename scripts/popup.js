// Popup script for Blocky ad blocker
class BlockyPopup {
  constructor() {
    this.currentTab = null;
    this.statsInterval = null;
    this.lastStatsUpdate = 0;
    this.init();
  }

  async init() {
    await this.getCurrentTab();
    await this.loadSettings();
    await this.updateUI();
    this.setupEventListeners();
    
    // Request badge update for current tab
    if (this.currentTab?.id) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_BADGE',
        tabId: this.currentTab.id
      }).catch(error => console.error('Failed to request badge update:', error));
    }
    
    // Refresh stats every 3 seconds while popup is open (reduced frequency)
    this.statsInterval = setInterval(() => {
      const now = Date.now();
      // Only update if enough time has passed since last update
      if (now - this.lastStatsUpdate > 2500) {
        this.updateStats();
        this.updateCurrentSiteStats();
        this.lastStatsUpdate = now;
      }
    }, 3000);
  }

  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tab;
  }

  async loadSettings() {
    this.settings = await chrome.storage.sync.get({
      isEnabled: true,
      blockingSources: { easylist: true, ublock: true },
      whitelistedDomains: [],
      statsEnabled: true
    });
  }

  setupEventListeners() {
    // Main toggle
    document.getElementById('toggleBlocking').addEventListener('change', (e) => {
      this.toggleBlocking(e.target.checked);
    });

    // Whitelist site
    document.getElementById('whitelistSite').addEventListener('click', () => {
      this.toggleWhitelist();
    });

    // Pause for 30 minutes
    document.getElementById('pauseFor30').addEventListener('click', () => {
      this.pauseBlocking(30);
    });

    // Report issue
    document.getElementById('reportIssue').addEventListener('click', () => {
      this.reportIssue();
    });

    // Open options
    document.getElementById('openOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Refresh rules
    document.getElementById('refreshRules').addEventListener('click', () => {
      this.refreshRules();
    });
  }

  async updateUI() {
    await this.updateStatus();
    await this.updateStats();
    await this.updateCurrentSite();
  }

  async updateStatus() {
    const isEnabled = this.settings.isEnabled;
    const toggle = document.getElementById('toggleBlocking');
    const status = document.getElementById('blockingStatus');

    toggle.checked = isEnabled;
    status.textContent = isEnabled ? 'Active' : 'Disabled';
    status.className = `status-value ${isEnabled ? 'active' : 'disabled'}`;
  }

  async updateStats() {
    try {
      // Get today's stats
      const today = new Date().toDateString();
      const dailyStats = await chrome.storage.local.get(`daily_stats_${today}`);
      const stats = dailyStats[`daily_stats_${today}`] || { blocked: 0, sites: [] };

      // Display total blocked ads
      const blockedCount = stats.blocked || 0;
      document.getElementById('blockedCount').textContent = blockedCount.toLocaleString();
      
      // Display protected sites count
      const sitesCount = Array.isArray(stats.sites) ? stats.sites.length : 0;
      document.getElementById('sitesProtected').textContent = sitesCount.toLocaleString();
    } catch (error) {
      console.error('Failed to update stats:', error);
      document.getElementById('blockedCount').textContent = '0';
      document.getElementById('sitesProtected').textContent = '0';
    }
  }

  async updateCurrentSite() {
    if (!this.currentTab || !this.currentTab.url) {
      document.getElementById('currentSite').textContent = 'No active tab';
      document.getElementById('currentSiteBlocked').textContent = '0';
      return;
    }

    try {
      const url = new URL(this.currentTab.url);
      const domain = url.hostname;

      // Update site URL
      document.getElementById('currentSite').textContent = domain;

      // Get current site stats
      await this.updateCurrentSiteStats();

      // Update whitelist button
      const isWhitelisted = this.settings.whitelistedDomains.includes(domain);
      const whitelistBtn = document.getElementById('whitelistSite');
      const whitelistText = document.getElementById('whitelistText');

      if (isWhitelisted) {
        whitelistText.textContent = 'Remove from Whitelist';
        whitelistBtn.classList.add('whitelisted');
      } else {
        whitelistText.textContent = 'Whitelist Site';
        whitelistBtn.classList.remove('whitelisted');
      }
    } catch (error) {
      console.error('Failed to update current site:', error);
      document.getElementById('currentSite').textContent = 'Invalid URL';
      document.getElementById('currentSiteBlocked').textContent = '0';
    }
  }

  async updateCurrentSiteStats() {
    if (!this.currentTab || !this.currentTab.id) {
      return;
    }

    try {
      // Show updating indicator
      const indicator = document.getElementById('statsUpdating');
      if (indicator) indicator.style.display = 'inline';
      
      const response = await chrome.runtime.sendMessage({
        type: 'GET_STATS',
        tabId: this.currentTab.id
      });

      const blockedCount = response?.blockedCount || 0;
      const currentElement = document.getElementById('currentSiteBlocked');
      
      // Only update if we have a valid count and it's different from current
      if (currentElement) {
        const currentValue = parseInt(currentElement.textContent) || 0;
        if (blockedCount !== currentValue) {
          currentElement.textContent = blockedCount;
          console.log(`Blocky: Updated current site blocked count: ${currentValue} -> ${blockedCount}`);
        }
      }
      
      // Hide updating indicator
      if (indicator) indicator.style.display = 'none';
    } catch (error) {
      console.error('Failed to update current site stats:', error);
      // Hide updating indicator on error
      const indicator = document.getElementById('statsUpdating');
      if (indicator) indicator.style.display = 'none';
    }
  }

  async toggleBlocking(enabled) {
    try {
      this.settings.isEnabled = enabled;
      await chrome.storage.sync.set({ isEnabled: enabled });
      
      await chrome.runtime.sendMessage({
        type: 'TOGGLE_BLOCKING',
        tabId: this.currentTab.id,
        enabled: enabled
      });

      await this.updateStatus();
      this.showNotification(enabled ? 'Ad blocking enabled' : 'Ad blocking disabled');
    } catch (error) {
      console.error('Failed to toggle blocking:', error);
      this.showError('Failed to toggle blocking');
    }
  }

  async toggleWhitelist() {
    if (!this.currentTab || !this.currentTab.url) return;

    try {
      const url = new URL(this.currentTab.url);
      const domain = url.hostname;
      
      const isWhitelisted = this.settings.whitelistedDomains.includes(domain);
      
      if (isWhitelisted) {
        // Remove from whitelist
        this.settings.whitelistedDomains = this.settings.whitelistedDomains.filter(d => d !== domain);
        this.showNotification(`Removed ${domain} from whitelist`);
      } else {
        // Add to whitelist
        this.settings.whitelistedDomains.push(domain);
        this.showNotification(`Added ${domain} to whitelist`);
      }

      await chrome.storage.sync.set({ whitelistedDomains: this.settings.whitelistedDomains });
      await this.updateCurrentSite();
      
      // Reload the tab to apply changes
      chrome.tabs.reload(this.currentTab.id);
    } catch (error) {
      console.error('Failed to toggle whitelist:', error);
      this.showError('Failed to update whitelist');
    }
  }

  async pauseBlocking(minutes) {
    try {
      const pauseUntil = Date.now() + (minutes * 60 * 1000);
      await chrome.storage.local.set({ pauseUntil: pauseUntil });
      
      // Temporarily disable blocking
      await this.toggleBlocking(false);
      
      this.showNotification(`Blocking paused for ${minutes} minutes`);
      
      // Set timer to re-enable
      setTimeout(async () => {
        await chrome.storage.local.remove('pauseUntil');
        await this.toggleBlocking(true);
      }, minutes * 60 * 1000);
    } catch (error) {
      console.error('Failed to pause blocking:', error);
      this.showError('Failed to pause blocking');
    }
  }

  reportIssue() {
    const url = `https://github.com/kasuken/blocky/issues/new?title=Issue with ${this.currentTab?.url || 'unknown site'}`;
    chrome.tabs.create({ url: url });
  }

  async refreshRules() {
    try {
      const refreshBtn = document.getElementById('refreshRules');
      refreshBtn.textContent = 'Updating...';
      refreshBtn.disabled = true;

      await chrome.runtime.sendMessage({ type: 'UPDATE_RULES' });
      
      this.showNotification('Filter rules updated successfully');
    } catch (error) {
      console.error('Failed to refresh rules:', error);
      this.showError('Failed to update filter rules');
    } finally {
      const refreshBtn = document.getElementById('refreshRules');
      refreshBtn.textContent = 'Update Filters';
      refreshBtn.disabled = false;
    }
  }

  showNotification(message) {
    // Create and show a temporary notification
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  showError(message) {
    // Create and show a temporary error notification
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const popup = new BlockyPopup();
  
  // Clean up interval when popup is closed
  window.addEventListener('beforeunload', () => {
    if (popup.statsInterval) {
      clearInterval(popup.statsInterval);
    }
  });
});
