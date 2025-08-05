// Options page script for Blocky ad blocker
class BlockyOptions {
  constructor() {
    this.settings = {};
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupTabs();
    this.setupEventListeners();
    this.updateUI();
    this.checkForWelcome();
  }

  async loadSettings() {
    this.settings = await chrome.storage.sync.get({
      isEnabled: true,
      blockingSources: { easylist: true, ublock: true },
      customRules: [],
      whitelistedDomains: [],
      statsEnabled: true,
      showNotifications: true,
      blockingLevel: 'standard',
      debugMode: false
    });
  }

  setupTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Remove active class from all tabs and contents
        navTabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        tab.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
      });
    });
  }

  setupEventListeners() {
    // General settings
    document.getElementById('enableBlocking').addEventListener('change', (e) => {
      this.updateSetting('isEnabled', e.target.checked);
    });

    document.getElementById('enableStats').addEventListener('change', (e) => {
      this.updateSetting('statsEnabled', e.target.checked);
    });

    document.getElementById('showNotifications').addEventListener('change', (e) => {
      this.updateSetting('showNotifications', e.target.checked);
    });

    document.getElementById('blockingLevel').addEventListener('change', (e) => {
      this.updateSetting('blockingLevel', e.target.value);
    });

    // Filter lists
    document.getElementById('enableEasyList').addEventListener('change', (e) => {
      this.updateBlockingSource('easylist', e.target.checked);
    });

    document.getElementById('enableUBlock').addEventListener('change', (e) => {
      this.updateBlockingSource('ublock', e.target.checked);
    });

    document.getElementById('updateFilters').addEventListener('click', () => {
      this.updateFilters();
    });

    // Custom rules
    document.getElementById('manageCustomRules').addEventListener('click', () => {
      this.showCustomRulesModal();
    });

    document.getElementById('closeCustomRules').addEventListener('click', () => {
      this.hideCustomRulesModal();
    });

    document.getElementById('saveCustomRules').addEventListener('click', () => {
      this.saveCustomRules();
    });

    document.getElementById('cancelCustomRules').addEventListener('click', () => {
      this.hideCustomRulesModal();
    });

    // Whitelist
    document.getElementById('addWhitelist').addEventListener('click', () => {
      this.addToWhitelist();
    });

    document.getElementById('whitelistInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addToWhitelist();
      }
    });

    // Advanced settings
    document.getElementById('enableDebugMode').addEventListener('change', (e) => {
      this.updateSetting('debugMode', e.target.checked);
    });

    document.getElementById('exportSettings').addEventListener('click', () => {
      this.exportSettings();
    });

    document.getElementById('importSettings').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
      this.importSettings(e.target.files[0]);
    });

    document.getElementById('resetSettings').addEventListener('click', () => {
      this.resetSettings();
    });

    // About links
    document.getElementById('reportBug').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/kasuken/blocky/issues' });
    });

    document.getElementById('requestFeature').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/kasuken/blocky/issues/new?template=feature_request.md' });
    });

    document.getElementById('viewSource').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/kasuken/blocky' });
    });

    // Welcome
    document.getElementById('dismissWelcome').addEventListener('click', () => {
      this.dismissWelcome();
    });

    // Modal backdrop
    document.getElementById('customRulesModal').addEventListener('click', (e) => {
      if (e.target.id === 'customRulesModal') {
        this.hideCustomRulesModal();
      }
    });
  }

  updateUI() {
    // General settings
    document.getElementById('enableBlocking').checked = this.settings.isEnabled;
    document.getElementById('enableStats').checked = this.settings.statsEnabled;
    document.getElementById('showNotifications').checked = this.settings.showNotifications;
    document.getElementById('blockingLevel').value = this.settings.blockingLevel;

    // Filter lists
    document.getElementById('enableEasyList').checked = this.settings.blockingSources.easylist;
    document.getElementById('enableUBlock').checked = this.settings.blockingSources.ublock;

    // Advanced
    document.getElementById('enableDebugMode').checked = this.settings.debugMode;

    // Update whitelist display
    this.updateWhitelistDisplay();

    // Update filter stats
    this.updateFilterStats();
  }

  checkForWelcome() {
    const urlParams = new URLSearchParams(window.location.hash.substring(1));
    if (urlParams.has('welcome') || window.location.hash === '#welcome') {
      document.getElementById('welcomeSection').style.display = 'block';
    }
  }

  dismissWelcome() {
    document.getElementById('welcomeSection').style.display = 'none';
    // Remove welcome hash from URL
    if (window.location.hash.includes('welcome')) {
      window.location.hash = '';
    }
  }

  async updateSetting(key, value) {
    this.settings[key] = value;
    await chrome.storage.sync.set({ [key]: value });
    
    // Notify background script of changes
    chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: this.settings
    });

    this.showStatusMessage('Settings saved successfully', 'success');
  }

  async updateBlockingSource(source, enabled) {
    this.settings.blockingSources[source] = enabled;
    await chrome.storage.sync.set({ blockingSources: this.settings.blockingSources });
    
    chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: this.settings
    });

    this.showStatusMessage('Filter list settings updated', 'success');
  }

  async updateFilters() {
    const updateBtn = document.getElementById('updateFilters');
    updateBtn.textContent = 'Updating...';
    updateBtn.disabled = true;

    try {
      await chrome.runtime.sendMessage({ type: 'UPDATE_RULES' });
      this.showStatusMessage('Filter lists updated successfully', 'success');
      this.updateFilterStats();
    } catch (error) {
      console.error('Failed to update filters:', error);
      this.showStatusMessage('Failed to update filter lists', 'error');
    } finally {
      updateBtn.textContent = 'Update All Filter Lists';
      updateBtn.disabled = false;
    }
  }

  showCustomRulesModal() {
    const modal = document.getElementById('customRulesModal');
    const textarea = document.getElementById('customRulesText');
    
    textarea.value = this.settings.customRules.join('\n');
    modal.style.display = 'flex';
  }

  hideCustomRulesModal() {
    document.getElementById('customRulesModal').style.display = 'none';
  }

  async saveCustomRules() {
    const textarea = document.getElementById('customRulesText');
    const rules = textarea.value.split('\n')
      .map(rule => rule.trim())
      .filter(rule => rule && !rule.startsWith('#'));

    this.settings.customRules = rules;
    await chrome.storage.sync.set({ customRules: rules });
    
    chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: this.settings
    });

    this.hideCustomRulesModal();
    this.showStatusMessage('Custom rules saved successfully', 'success');
  }

  async addToWhitelist() {
    const input = document.getElementById('whitelistInput');
    const domain = input.value.trim();

    if (!domain) {
      this.showStatusMessage('Please enter a valid domain', 'error');
      return;
    }

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,}|[a-zA-Z]{2,}\.[a-zA-Z]{2,})$/;
    if (!domainRegex.test(domain)) {
      this.showStatusMessage('Please enter a valid domain format (e.g., example.com)', 'error');
      return;
    }

    if (this.settings.whitelistedDomains.includes(domain)) {
      this.showStatusMessage('Domain is already whitelisted', 'error');
      return;
    }

    this.settings.whitelistedDomains.push(domain);
    await chrome.storage.sync.set({ whitelistedDomains: this.settings.whitelistedDomains });
    
    input.value = '';
    this.updateWhitelistDisplay();
    this.showStatusMessage('Domain added to whitelist', 'success');
  }

  async removeFromWhitelist(domain) {
    this.settings.whitelistedDomains = this.settings.whitelistedDomains.filter(d => d !== domain);
    await chrome.storage.sync.set({ whitelistedDomains: this.settings.whitelistedDomains });
    
    this.updateWhitelistDisplay();
    this.showStatusMessage('Domain removed from whitelist', 'success');
  }

  updateWhitelistDisplay() {
    const container = document.getElementById('whitelistList');
    container.innerHTML = '';

    if (this.settings.whitelistedDomains.length === 0) {
      container.innerHTML = '<p class="empty-state">No whitelisted domains</p>';
      return;
    }

    this.settings.whitelistedDomains.forEach(domain => {
      const item = document.createElement('div');
      item.className = 'whitelist-item';
      item.innerHTML = `
        <span class="domain-name">${domain}</span>
        <button class="btn btn-danger btn-small remove-whitelist" data-domain="${domain}">Remove</button>
      `;
      container.appendChild(item);
    });

    // Add event listeners for remove buttons
    container.querySelectorAll('.remove-whitelist').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.removeFromWhitelist(e.target.dataset.domain);
      });
    });
  }

  updateFilterStats() {
    // Update last updated time
    const now = new Date().toLocaleString();
    document.getElementById('lastUpdated').textContent = now;
    document.getElementById('aboutLastUpdated').textContent = now;
  }

  exportSettings() {
    const exportData = {
      settings: this.settings,
      version: '1.0.0',
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `blocky-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    this.showStatusMessage('Settings exported successfully', 'success');
  }

  async importSettings(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.settings) {
        throw new Error('Invalid settings file format');
      }

      // Merge with current settings
      const newSettings = { ...this.settings, ...data.settings };
      
      // Save to storage
      await chrome.storage.sync.set(newSettings);
      this.settings = newSettings;
      
      // Update UI
      this.updateUI();
      
      this.showStatusMessage('Settings imported successfully', 'success');
    } catch (error) {
      console.error('Failed to import settings:', error);
      this.showStatusMessage('Failed to import settings file', 'error');
    }
  }

  async resetSettings() {
    if (!confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      return;
    }

    try {
      // Clear all settings
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      
      // Reload default settings
      await this.loadSettings();
      this.updateUI();
      
      this.showStatusMessage('Settings reset successfully', 'success');
    } catch (error) {
      console.error('Failed to reset settings:', error);
      this.showStatusMessage('Failed to reset settings', 'error');
    }
  }

  showStatusMessage(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type} show`;
    
    setTimeout(() => {
      statusEl.classList.remove('show');
    }, 3000);
  }
}

// Initialize options page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new BlockyOptions();
});
