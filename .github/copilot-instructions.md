# Blocky

## Project Overview
This is a browser extension (Chrome/Edge) called "Blocky" that functions as an ad blocker. The extension uses Manifest V3 and blocks ads using declarative net request rules.

## Architecture
- **Manifest V3**: Uses service worker for background processing
- **Declarative Net Request**: For blocking network requests
- **Content Scripts**: For DOM manipulation and cosmetic filtering
- **Filter Sources**: EasyList and uBlock Origin filters

## Code Style Guidelines
- Use modern JavaScript (ES6+)
- Follow Chrome Extension best practices
- Use async/await for asynchronous operations
- Implement proper error handling
- Use descriptive variable and function names

## Key Components
1. **Background Script** (`background.js`): Manages blocking rules and settings
2. **Content Script** (`content.js`): Handles DOM-based ad blocking
3. **Popup** (`popup.html/js`): Extension popup interface
4. **Options Page** (`options.html/js`): Settings and configuration
5. **Filter Rules** (`rules/*.json`): Declarative net request rules

## Development Notes
- Filter rules should follow Chrome's declarativeNetRequest format
- Content scripts should be lightweight and performant
- All user settings should be stored using chrome.storage.sync
- Extension should gracefully handle filter update failures
- UI should be responsive and accessible

## Security Considerations
- Validate all user inputs
- Use minimal permissions
- Store sensitive data securely
- Implement CSP policies
- Regular security audits of filter sources
