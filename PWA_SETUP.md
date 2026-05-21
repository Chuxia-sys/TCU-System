# Progressive Web App (PWA) Setup - TCU Scheduling System

This document explains the PWA implementation for the TCU Scheduling System and how to use its features.

## What's Implemented

### 1. **Service Worker** (`public/sw.js`)
- **Offline Support**: Caches API responses and pages for offline access
- **Smart Caching Strategies**:
  - **Cache-First**: Static assets (CSS, JS, images) - loaded from cache immediately
  - **Network-First**: API calls and pages - tries network first, falls back to cache
  - **Stale-While-Revalidate**: Dynamic content - returns cached version while fetching fresh data
- **Background Sync**: Foundation for push notifications (currently commented out)
- **Automatic Updates**: Detects new service worker versions and notifies users

### 2. **Web App Manifest** (`public/manifest.json`)
- **Install Support**: Enables "Add to Home Screen" on mobile and "Install" on desktop
- **App Configuration**: Name, icons, display mode, theme colors
- **App Shortcuts**: Quick access to Dashboard, Schedules, and Conflicts tabs
- **Adaptive Icons**: Supports maskable icons for Android adaptive icons

### 3. **PWA Components**

#### `src/components/pwa-register.tsx`
- **Service Worker Registration**: Automatically registers SW on app load
- **Update Detection**: Detects when new versions are available
- **Install Prompt Handling**: Captures browser install prompts
- **Exports**:
  - `PWARegister`: Component - auto-registers SW (invisible, no UI)
  - `usePWAInstall()`: Hook - provides install capability detection and install trigger

#### `src/components/pwa-update-banner.tsx`
- **Update Notification**: Shows when app updates are available
- **Refresh Prompt**: One-click refresh to get latest version
- **Auto-dismiss**: Can be dismissed by user

#### `src/components/pwa-install-prompt.tsx`
- **Install Button**: Small button for header/navbar (shows when app can be installed)
- **Install Card**: Larger, more visible prompt card for dashboard/settings
- **Conditional Display**: Only shows on supported browsers when installable

### 4. **Metadata Updates** (`src/app/layout.tsx`)
- iOS Web App Support: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`
- Windows Support: `msapplication-TileColor`, `msapplication-TileImage`
- Responsive Viewport Configuration
- Theme Color Support for light/dark modes

## How to Use

### Basic Setup (Already Done)
The PWA is automatically set up and working. Just rebuild/redeploy:

```bash
npm run build
npm start
```

### Using the Install Prompt in Your UI

#### Option 1: Simple Install Button in Header
Add to your header component:

```tsx
import { PWAInstallButton } from '@/components/pwa-install-prompt';

export function Header() {
  return (
    <header>
      {/* ...other header content... */}
      <PWAInstallButton />
    </header>
  );
}
```

#### Option 2: Install Card in Dashboard
Add to your dashboard:

```tsx
import { PWAInstallPrompt } from '@/components/pwa-install-prompt';

export function DashboardView() {
  return (
    <div>
      <PWAInstallPrompt />
      {/* ...rest of dashboard... */}
    </div>
  );
}
```

#### Option 3: Custom Install Logic
Use the hook directly:

```tsx
'use client';

import { usePWAInstall } from '@/components/pwa-register';

export function CustomInstallButton() {
  const { canInstall, installApp } = usePWAInstall();

  if (!canInstall) return null;

  return (
    <button onClick={installApp}>
      Add to Home Screen
    </button>
  );
}
```

### Monitoring PWA Events
Listen for PWA events in your app:

```tsx
useEffect(() => {
  // Update available
  const handleUpdate = (e: CustomEvent) => {
    console.log('Update available:', e.detail);
  };

  // Install prompt available
  const handlePrompt = (e: CustomEvent) => {
    console.log('Install prompt available:', e.detail);
  };

  // App installed
  const handleInstalled = () => {
    console.log('App installed successfully');
  };

  window.addEventListener('pwa-update-available', handleUpdate);
  window.addEventListener('pwa-install-prompt-available', handlePrompt);
  window.addEventListener('pwa-installed', handleInstalled);

  return () => {
    window.removeEventListener('pwa-update-available', handleUpdate);
    window.removeEventListener('pwa-install-prompt-available', handlePrompt);
    window.removeEventListener('pwa-installed', handleInstalled);
  };
}, []);
```

## Offline Behavior

### What Works Offline
- ✅ Already visited pages
- ✅ Static assets (CSS, JS, images)
- ✅ Cached API responses from recent visits
- ✅ UI navigation and interaction

### What Doesn't Work Offline
- ❌ Real-time data updates
- ❌ Creating/updating data (requires connectivity)
- ❌ First-time visits to pages not previously loaded

### Customizing Caching
Edit `public/sw.js` to adjust caching:

```javascript
// Adjust timeout for API requests
REQUEST_CONFIG.TIMEOUT_MS = 20000; // 20 seconds

// Limit concurrent requests
REQUEST_CONFIG.MAX_CONCURRENT_RELATIONS = 10;

// Add more static assets to pre-cache
const STATIC_ASSETS = [
  '/',
  '/tcu-logo.png',
  '/api/departments', // Pre-cache critical API
];
```

## Testing PWA Features

### Testing in Browser DevTools

1. **Chrome/Edge DevTools**:
   - Open DevTools → Application tab
   - Check "Service Workers" section
   - View Cache Storage
   - Simulate offline mode: Network tab → "Offline"

2. **Testing Install Prompt**:
   - Desktop: Click install button in address bar
   - Mobile: Browser's "Add to Home Screen" menu
   - DevTools: Emulate Mobile → Trigger "beforeinstallprompt"

3. **Lighthouse PWA Audit**:
   ```bash
   # In Chrome DevTools → Lighthouse
   # Run audit for Progressive Web App
   ```

### Manual Testing Checklist
- [ ] App loads offline after first visit
- [ ] Install button appears on supported browsers
- [ ] App can be installed (Android/iOS/Desktop)
- [ ] Installed app has correct name and icon
- [ ] Installed app runs in fullscreen mode
- [ ] Navigation works offline
- [ ] Update banner appears when new version deployed

## Deployment Considerations

### HTTPS Required
PWA requires HTTPS in production. HTTP only works for localhost development.

### Service Worker Updates
The service worker checks for updates on every page load:
- If new version found: Shows update banner
- User can refresh to get latest
- Alternatively, auto-update after 24 hours (configurable)

### Cache Versioning
Update cache version when deploying:

```javascript
// In public/sw.js
const CACHE_VERSION = 'v2'; // Increment on each deployment
```

## Browser Support

| Browser | Support | Features |
|---------|---------|----------|
| Chrome/Edge | ✅ Full | All PWA features |
| Firefox | ✅ Full | All PWA features |
| Safari | ⚠️ Partial | Service Worker, limited install |
| Samsung Internet | ✅ Full | All PWA features |
| Opera | ✅ Full | All PWA features |

## Troubleshooting

### Service Worker Not Registering
- Check browser console for errors
- Verify `/public/sw.js` exists
- Clear browser cache: DevTools → Clear Site Data
- Check HTTPS in production

### Install Button Not Appearing
- Only appears when PWA criteria met
- Check manifest.json is valid
- Must be HTTPS in production
- Try on Android or latest Chrome

### Offline Data Stale
- Service worker caches responses for performance
- Edit `REQUEST_CONFIG.TIMEOUT_MS` to adjust stale threshold
- Clear cache in DevTools to force fresh data

### Updates Not Showing
- Service worker checks for updates on page load
- Manual check: `navigator.serviceWorker.controller.postMessage({type: 'SKIP_WAITING'})`
- Try incognito mode to bypass browser cache

## Next Steps

### Optional: Enable Push Notifications
Uncomment in `public/sw.js`:

```javascript
self.addEventListener('push', (event) => {
  // Handle push notifications
  // Requires backend push service setup
});
```

### Optional: Background Sync
For offline data submission:

```javascript
// In your component
const registration = await navigator.serviceWorker.ready;
await registration.sync.register('sync-schedules');
```

### Optional: Cache Strategy Customization
Modify cache duration per resource type based on your needs.

## Files Created/Modified

```
Created:
├── public/manifest.json                      (Web app manifest)
├── public/sw.js                              (Service worker)
├── src/components/pwa-register.tsx           (SW registration + hooks)
├── src/components/pwa-update-banner.tsx      (Update notification)
└── src/components/pwa-install-prompt.tsx     (Install UI)

Modified:
└── src/app/layout.tsx                        (Metadata + PWA initialization)
```

## References
- [MDN PWA Documentation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Web App Manifest Spec](https://www.w3.org/TR/appmanifest/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Workbox (Optional - for advanced caching)](https://developers.google.com/web/tools/workbox)

