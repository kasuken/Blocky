// Background service worker for Blocky ad blocker
class BlockyBackground {
  constructor() {
    this.init();
  }

  async init() {
    // Initialize the extension
    await this.setupDefaultSettings();
    await this.updateBlockingRules();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Initialize badge
    await this.initializeBadge();
    
    // Update rules periodically (every 24 hours)
    this.scheduleRuleUpdates();
  }

  setupEventListeners() {
    // Listen for extension installation/update
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.onInstall();
      } else if (details.reason === 'update') {
        this.onUpdate();
      }
    });

    // Listen for messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });

    // Listen for tab updates to update blocking stats
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.updateTabStats(tabId, tab.url);
      }
    });

    // Listen for tab activation to update badge
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      await this.updateBadgeForActiveTab(activeInfo.tabId);
    });

    // Listen for window focus changes to update badge
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        const [activeTab] = await chrome.tabs.query({ active: true, windowId: windowId });
        if (activeTab) {
          await this.updateBadgeForActiveTab(activeTab.id);
        }
      }
    });

    // Note: onRuleMatchedDebug is only available in dev mode
    // For production, we'll rely on content script reporting
    if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
      chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
        this.onRequestBlocked(info);
      });
    }
  }

  async setupDefaultSettings() {
    const settings = await chrome.storage.sync.get({
      isEnabled: true,
      blockingSources: {
        easylist: true,
        ublock: true
      },
      customRules: [],
      whitelistedDomains: [],
      statsEnabled: true,
      showNotifications: true,
      blockingLevel: 'standard'
    });

    await chrome.storage.sync.set(settings);
  }

  async onInstall() {
    console.log('Blocky installed successfully');
    // Show welcome page or notification
    chrome.tabs.create({ url: 'options.html#welcome' });
  }

  async onUpdate() {
    console.log('Blocky updated');
    await this.updateBlockingRules();
  }

  async handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'GET_STATS':
        const stats = await this.getBlockingStats(message.tabId);
        sendResponse(stats);
        break;
        
      case 'TOGGLE_BLOCKING':
        await this.toggleBlocking(message.tabId, message.enabled);
        sendResponse({ success: true });
        break;
        
      case 'UPDATE_RULES':
        await this.updateBlockingRules();
        sendResponse({ success: true });
        break;
        
      case 'GET_SETTINGS':
        const settings = await chrome.storage.sync.get();
        sendResponse(settings);
        break;
        
      case 'SAVE_SETTINGS':
        await chrome.storage.sync.set(message.settings);
        await this.updateBlockingRules();
        sendResponse({ success: true });
        break;
        
      case 'UPDATE_CONTENT_STATS':
        await this.updateContentStats(message.tabId || sender.tab?.id, message.blockedCount, message.url);
        sendResponse({ success: true });
        break;
        
      case 'GET_TAB_ID':
        sendResponse({ tabId: sender.tab?.id });
        break;
        
      case 'UPDATE_BADGE':
        if (message.tabId) {
          await this.updateBadgeForActiveTab(message.tabId);
        }
        sendResponse({ success: true });
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  }

  async updateBlockingRules() {
    try {
      const settings = await chrome.storage.sync.get();
      
      if (!settings.isEnabled) {
        // Disable all rules if blocking is disabled
        await chrome.declarativeNetRequest.updateEnabledRulesets({
          disableRulesetIds: ['easylist_rules', 'ublock_rules']
        });
        return;
      }

      // Set max rules based on blocking level
      this.maxRulesPerSource = this.getMaxRulesForBlockingLevel(settings.blockingLevel || 'standard');

      const enabledRulesets = [];
      const disabledRulesets = [];

      if (settings.blockingSources?.easylist) {
        enabledRulesets.push('easylist_rules');
        await this.updateEasyListRules();
      } else {
        disabledRulesets.push('easylist_rules');
      }

      if (settings.blockingSources?.ublock) {
        enabledRulesets.push('ublock_rules');
        await this.updateUBlockRules();
      } else {
        disabledRulesets.push('ublock_rules');
      }

      // Update enabled rulesets
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: enabledRulesets,
        disableRulesetIds: disabledRulesets
      });

      console.log(`Blocking rules updated successfully with ${settings.blockingLevel || 'standard'} blocking level`);
    } catch (error) {
      console.error('Failed to update blocking rules:', error);
    }
  }

  getMaxRulesForBlockingLevel(level) {
    switch (level) {
      case 'light':
        return 5000;   // Light blocking
      case 'standard':
        return 15000;  // Standard blocking
      case 'strict':
        return 30000;  // Maximum blocking
      default:
        return 15000;  // Default to standard
    }
  }

  getMaxRulesForLevel() {
    return this.maxRulesPerSource || 15000;
  }

  async updateEasyListRules() {
    try {
      // Fetch EasyList rules (simplified for demo)
      const response = await fetch('https://easylist.to/easylist/easylist.txt');
      const text = await response.text();
      
      const rules = this.parseAdBlockRules(text, 'easylist');
      await this.saveRulesToFile('rules/easylist_rules.json', rules);
    } catch (error) {
      console.error('Failed to update EasyList rules:', error);
      // Use backup/cached rules
      await this.loadBackupRules('easylist');
    }
  }

  async updateUBlockRules() {
    try {
      // Fetch uBlock Origin filters (simplified for demo)
      const response = await fetch('https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt');
      const text = await response.text();
      
      const rules = this.parseAdBlockRules(text, 'ublock');
      await this.saveRulesToFile('rules/ublock_rules.json', rules);
    } catch (error) {
      console.error('Failed to update uBlock rules:', error);
      // Use backup/cached rules
      await this.loadBackupRules('ublock');
    }
  }

  parseAdBlockRules(text, source) {
    const rules = [];
    const lines = text.split('\n');
    let ruleId = source === 'easylist' ? 1000 : 2000;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('#')) {
        continue;
      }

      // Parse basic blocking rules (simplified)
      if (trimmed.includes('||') || trimmed.includes('##')) {
        const rule = this.createDeclarativeNetRequestRule(trimmed, ruleId++, source);
        if (rule) {
          rules.push(rule);
        }
      }

      // Limit rules based on blocking level
      const maxRules = this.getMaxRulesForLevel();
      if (rules.length >= maxRules) {
        break;
      }
    }

    return rules;
  }

  getMaxRulesForLevel() {
    // This will be updated with actual settings in updateBlockingRules
    return 30000; // Default max
  }

  createDeclarativeNetRequestRule(adBlockRule, id, source) {
    try {
      // Simplified rule conversion (basic URL blocking)
      if (adBlockRule.startsWith('||')) {
        const domain = adBlockRule.substring(2).split('/')[0].replace('*', '');
        
        return {
          id: id,
          priority: 1,
          action: { type: 'block' },
          condition: {
            urlFilter: `*://${domain}/*`,
            resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame']
          }
        };
      }
      
      // Handle other rule types as needed
      return null;
    } catch (error) {
      console.error('Failed to parse rule:', adBlockRule, error);
      return null;
    }
  }

  async saveRulesToFile(filePath, rules) {
    // In a real extension, you'd save to the extension's storage
    // For this demo, we'll store in chrome.storage.local
    await chrome.storage.local.set({
      [filePath]: JSON.stringify(rules)
    });
  }

  async loadBackupRules(source) {
    // Load minimal backup rules
    const backupRules = this.getMinimalBackupRules(source);
    await this.saveRulesToFile(`rules/${source}_rules.json`, backupRules);
  }

  getMinimalBackupRules(source) {
    const baseId = source === 'easylist' ? 1000 : 2000;
    
    return [
      {
        id: baseId + 1,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: '*://doubleclick.net/*',
          resourceTypes: ['script', 'image', 'xmlhttprequest']
        }
      },
      {
        id: baseId + 2,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: '*://googleadservices.com/*',
          resourceTypes: ['script', 'image', 'xmlhttprequest']
        }
      },
      {
        id: baseId + 3,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: '*://googlesyndication.com/*',
          resourceTypes: ['script', 'image', 'xmlhttprequest']
        }
      }
    ];
  }

  async getBlockingStats(tabId) {
    try {
      // Check if stats collection is enabled
      const settings = await chrome.storage.sync.get(['statsEnabled']);
      
      if (settings.statsEnabled === false) {
        return { blockedCount: 0, allowedCount: 0 };
      }
      
      const stats = await chrome.storage.local.get(`stats_${tabId}`);
      const result = {
        blockedCount: stats[`stats_${tabId}`]?.blocked || 0,
        allowedCount: stats[`stats_${tabId}`]?.allowed || 0
      };
      console.log(`Blocky: Getting stats for tab ${tabId}:`, result);
      return result;
    } catch (error) {
      console.error('Failed to get blocking stats:', error);
      return { blockedCount: 0, allowedCount: 0 };
    }
  }

  async updateTabStats(tabId, url) {
    // Check if stats already exist for this tab
    const existingStats = await chrome.storage.local.get(`stats_${tabId}`);
    
    if (!existingStats[`stats_${tabId}`]) {
      // Only initialize if stats don't exist
      await chrome.storage.local.set({
        [`stats_${tabId}`]: { blocked: 0, allowed: 0, url: url }
      });
      console.log(`Blocky: Initialized stats for new tab ${tabId}`);
    } else {
      // Just update the URL if tab already has stats
      const currentStats = existingStats[`stats_${tabId}`];
      currentStats.url = url;
      await chrome.storage.local.set({
        [`stats_${tabId}`]: currentStats
      });
      console.log(`Blocky: Updated URL for existing tab ${tabId}, current blocked: ${currentStats.blocked}`);
    }
  }

  async updateContentStats(tabId, blockedCount, url) {
    if (!tabId) {
      console.log('Blocky: No tabId provided for content stats update');
      return;
    }
    
    console.log(`Blocky: Updating content stats for tab ${tabId}: ${blockedCount} blocked ads`);
    
    try {
      // Check if stats collection is enabled
      const settings = await chrome.storage.sync.get(['statsEnabled', 'showNotifications']);
      
      if (settings.statsEnabled !== false) {
        // Update tab-specific stats
        const tabStats = await chrome.storage.local.get(`stats_${tabId}`);
        const currentTabStats = tabStats[`stats_${tabId}`] || { blocked: 0, allowed: 0, url: url };
        currentTabStats.blocked = blockedCount;
        
        await chrome.storage.local.set({
          [`stats_${tabId}`]: currentTabStats
        });

        // Update daily aggregated stats
        await this.updateDailyStats(1, url); // Increment daily count by 1
        
        console.log(`Blocky: Updated tab stats:`, currentTabStats);
      }
      
      // Update badge if notifications are enabled
      if (settings.showNotifications !== false) {
        await this.updateBadge(tabId, blockedCount);
      }
      
    } catch (error) {
      console.error('Failed to update content stats:', error);
    }
  }

  async updateDailyStats(incrementBy, url) {
    const today = new Date().toDateString();
    const dailyStatsKey = `daily_stats_${today}`;
    
    try {
      const dailyData = await chrome.storage.local.get(dailyStatsKey);
      const stats = dailyData[dailyStatsKey] || { blocked: 0, sites: [] };
      
      // Increment blocked count 
      stats.blocked = (stats.blocked || 0) + (incrementBy || 1);
      
      // Add site to protected sites set
      if (url) {
        try {
          const domain = new URL(url).hostname;
          if (!Array.isArray(stats.sites)) {
            stats.sites = [];
          }
          if (!stats.sites.includes(domain)) {
            stats.sites.push(domain);
          }
        } catch (urlError) {
          console.error('Invalid URL for daily stats:', url);
        }
      }
      
      // Store updated stats
      await chrome.storage.local.set({
        [dailyStatsKey]: {
          blocked: stats.blocked,
          sites: stats.sites
        }
      });
      
      console.log(`Blocky: Updated daily stats - ${stats.blocked} total blocked, ${stats.sites.length} sites protected`);
    } catch (error) {
      console.error('Failed to update daily stats:', error);
    }
  }

  async onRequestBlocked(info) {
    // This is called when declarativeNetRequest blocks a request
    if (info.request && info.request.tabId) {
      const tabId = info.request.tabId;
      
      try {
        // Update tab stats for network-level blocks
        const tabStats = await chrome.storage.local.get(`stats_${tabId}`);
        const currentStats = tabStats[`stats_${tabId}`] || { blocked: 0, allowed: 0, url: '' };
        currentStats.blocked = (currentStats.blocked || 0) + 1;
        
        await chrome.storage.local.set({
          [`stats_${tabId}`]: currentStats
        });

        // Update badge for this tab
        await this.updateBadge(tabId, currentStats.blocked);

        // Update daily stats
        if (currentStats.url) {
          await this.updateDailyStats(currentStats.blocked, currentStats.url);
        }
      } catch (error) {
        console.error('Failed to update request block stats:', error);
      }
    }
  }

  async updateBadge(tabId, blockedCount) {
    try {
      const settings = await chrome.storage.sync.get(['isEnabled', 'showNotifications']);
      
      if (!settings.isEnabled || settings.showNotifications === false) {
        // Clear badge if blocking is disabled or notifications are off
        await chrome.action.setBadgeText({ text: '', tabId: tabId });
        return;
      }

      // Set badge text to show blocked count
      let badgeText = '';
      if (blockedCount > 0) {
        // Format large numbers (999+ shows as 999+)
        badgeText = blockedCount > 999 ? '999+' : blockedCount.toString();
      }
      
      await chrome.action.setBadgeText({ 
        text: badgeText, 
        tabId: tabId 
      });

      // Set badge color - red for active blocking, gray for no blocks
      const badgeColor = blockedCount > 0 ? '#ff4444' : '#cccccc';
      await chrome.action.setBadgeBackgroundColor({ 
        color: badgeColor, 
        tabId: tabId 
      });

      console.log(`Blocky: Updated badge for tab ${tabId}: ${badgeText} blocked`);
    } catch (error) {
      console.error('Failed to update badge:', error);
    }
  }

  async updateBadgeForActiveTab(tabId) {
    try {
      const stats = await this.getBlockingStats(tabId);
      await this.updateBadge(tabId, stats.blockedCount);
    } catch (error) {
      console.error('Failed to update badge for active tab:', error);
    }
  }

  async clearAllBadges() {
    try {
      // Clear badge for all tabs
      await chrome.action.setBadgeText({ text: '' });
      console.log('Blocky: Cleared all badges');
    } catch (error) {
      console.error('Failed to clear badges:', error);
    }
  }

  async initializeBadge() {
    try {
      // Set default badge appearance
      await chrome.action.setBadgeBackgroundColor({ color: '#ff4444' });
      
      // Get current active tab and update its badge
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab) {
        await this.updateBadgeForActiveTab(activeTab.id);
      }
      
      console.log('Blocky: Badge initialized');
    } catch (error) {
      console.error('Failed to initialize badge:', error);
    }
  }

  async toggleBlocking(tabId, enabled) {
    if (enabled) {
      await this.updateBlockingRules();
      // Update badge for current tab
      if (tabId) {
        await this.updateBadgeForActiveTab(tabId);
      }
    } else {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ['easylist_rules', 'ublock_rules']
      });
      // Clear all badges when blocking is disabled
      await this.clearAllBadges();
    }
  }

  scheduleRuleUpdates() {
    // Update rules every 24 hours
    setInterval(() => {
      this.updateBlockingRules();
    }, 24 * 60 * 60 * 1000);
  }
}

// Initialize the background service
new BlockyBackground();
