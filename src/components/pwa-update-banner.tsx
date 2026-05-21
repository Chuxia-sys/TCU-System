'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * PWA Update Notification Banner
 * Shows when a new version of the app is available
 * User can refresh to get the latest version
 */
export function PWAUpdateBanner() {
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  useEffect(() => {
    const handleUpdateAvailable = () => {
      console.log('[PWA] Update banner shown');
      setShowUpdateBanner(true);
    };

    window.addEventListener('pwa-update-available', handleUpdateAvailable);

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdateAvailable);
    };
  }, []);

  if (!showUpdateBanner) {
    return null;
  }

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleDismiss = () => {
    setShowUpdateBanner(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-blue-50 border border-blue-200 rounded-lg shadow-lg z-50">
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900 text-sm">App Update Available</h3>
          <p className="text-blue-700 text-xs mt-1">
            A new version of TCU Scheduling is ready. Refresh to get the latest features and improvements.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-blue-600 hover:text-blue-800 shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex gap-2 px-4 pb-4">
        <Button
          onClick={handleRefresh}
          size="sm"
          className="flex-1"
          variant="default"
        >
          Refresh Now
        </Button>
        <Button
          onClick={handleDismiss}
          size="sm"
          variant="outline"
          className="flex-1"
        >
          Later
        </Button>
      </div>
    </div>
  );
}
