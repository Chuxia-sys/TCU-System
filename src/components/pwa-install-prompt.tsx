'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/components/pwa-register';

/**
 * PWA Install Button
 * Shows only on supported browsers when the app can be installed
 * Can be placed in header, sidebar, or anywhere in the UI
 */
export function PWAInstallButton() {
  const { canInstall, installApp } = usePWAInstall();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !canInstall) {
    return null;
  }

  return (
    <Button
      onClick={installApp}
      variant="outline"
      size="sm"
      className="gap-2"
      title="Install TCU Scheduling app to home screen for quick access"
    >
      <Download size={16} />
      <span className="hidden sm:inline">Install App</span>
      <span className="sm:hidden">Install</span>
    </Button>
  );
}

/**
 * PWA Install Prompt Card
 * Larger, more prominent install prompt - can be shown in dashboard or settings
 */
export function PWAInstallPrompt() {
  const { canInstall, installApp } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !canInstall || dismissed) {
    return null;
  }

  return (
    <div className="bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="bg-blue-100 rounded-lg p-2 shrink-0">
          <Download size={20} className="text-blue-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900">Install TCU Scheduling</h3>
          <p className="text-sm text-slate-600 mt-1">
            Add the app to your home screen for quick access and offline support. Works on mobile and desktop.
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              onClick={installApp}
              size="sm"
              className="gap-1"
            >
              <Download size={14} />
              Install
            </Button>
            <Button
              onClick={() => setDismissed(true)}
              variant="ghost"
              size="sm"
            >
              Not Now
            </Button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-400 hover:text-slate-600 shrink-0"
          aria-label="Dismiss"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
