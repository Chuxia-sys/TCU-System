'use client';

import { useEffect, useRef } from 'react';

/**
 * PWA Registration Component
 * Handles service worker registration, install prompts, and update notifications
 * Automatically registers the service worker on mount (client-side only)
 */
export function PWARegister() {
  const registerPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    // Register service worker
    const registerServiceWorker = async () => {
      if (!('serviceWorker' in navigator)) {
        console.log('[PWA] Service Workers not supported');
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none', // Check for updates on every registration
        });

        console.log('[PWA] Service Worker registered successfully:', registration.scope);

        // Listen for service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;

          newWorker?.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // New service worker available - optionally show update prompt
              console.log('[PWA] Update available');
              
              // Notify user (optional - can implement a toast/banner)
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('pwa-update-available', { detail: { registration } })
                );
              }
            }
          });
        });

        // Listen for controller change (new SW activated)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('[PWA] Service Worker controller changed (update activated)');
        });
      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
      }
    };

    registerServiceWorker();

    // Capture install prompt event
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      registerPromptRef.current = e;
      console.log('[PWA] Install prompt available');
      
      // Dispatch event so other components can listen for install availability
      window.dispatchEvent(
        new CustomEvent('pwa-install-prompt-available', { detail: { prompt: e } })
      );
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed successfully');
      registerPromptRef.current = null;
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    };
  }, []);

  return null; // This component doesn't render anything
}

/**
 * Helper hook to access PWA install prompt
 * Usage:
 *   const { canInstall, installApp } = usePWAInstall();
 *   if (canInstall) {
 *     <button onClick={installApp}>Install App</button>
 *   }
 */
export function usePWAInstall() {
  const [canInstall, setCanInstall] = useRef(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handlePromptAvailable = (e: CustomEvent) => {
      promptRef.current = e.detail.prompt;
      setCanInstall(true);
    };

    const handleInstalled = () => {
      setCanInstall(false);
      promptRef.current = null;
    };

    window.addEventListener('pwa-install-prompt-available', handlePromptAvailable as EventListener);
    window.addEventListener('pwa-installed', handleInstalled);

    return () => {
      window.removeEventListener('pwa-install-prompt-available', handlePromptAvailable as EventListener);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!promptRef.current) return;

    promptRef.current.prompt();
    const { outcome } = await promptRef.current.userChoice;
    console.log(`[PWA] User response to install prompt: ${outcome}`);
    promptRef.current = null;
    setCanInstall(false);
  };

  return { canInstall, installApp };
}
