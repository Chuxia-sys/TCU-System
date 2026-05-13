'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Bell, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { safeJson } from '@/lib/utils';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
}

const POLL_INTERVAL = 30000; // 30 seconds base interval
const MAX_BACKOFF = 120000; // 2 minutes max backoff
const BACKOFF_MULTIPLIER = 2;

export function NotificationProvider() {
  const { data: session, status } = useSession();
  const lastPollTime = useRef<string>(new Date().toISOString());
  const isInitialized = useRef(false);
  const processedIds = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [backoff, setBackoff] = useState(POLL_INTERVAL);

  const showNotification = useCallback((notification: Notification) => {
    // Skip if already processed
    if (processedIds.current.has(notification.id)) {
      return;
    }
    processedIds.current.add(notification.id);

    const icon = getNotificationIcon(notification.type);
    
    // Show toast notification in bottom-right corner
    toast.custom(
      (t) => (
        <div className="flex items-start gap-3 p-4 bg-card border rounded-lg shadow-lg max-w-sm w-full">
          <div className="flex-shrink-0 mt-0.5">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{notification.title}</p>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {notification.message}
            </p>
          </div>
          <button
            onClick={() => toast.dismiss(t)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ),
      {
        position: 'bottom-right',
        duration: 8000,
        id: notification.id, // Prevent duplicates
      }
    );
  }, []);

  const pollNotifications = useCallback(async () => {
    if (status !== 'authenticated' || !session?.user?.id) {
      return;
    }

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `/api/notifications/poll?since=${encodeURIComponent(lastPollTime.current)}`,
        { signal: controller.signal }
      );
      
      const data = await safeJson<{ notifications?: Notification[]; timestamp?: string }>(res);
      if (!data) {
        // On failure, increase backoff
        setBackoff(prev => Math.min(prev * BACKOFF_MULTIPLIER, MAX_BACKOFF));
        return;
      }

      // Reset backoff on success
      setBackoff(POLL_INTERVAL);
      
      // Update last poll time
      if (data.timestamp) {
        lastPollTime.current = data.timestamp;
      }

      // Show new notifications as toasts
      if (data.notifications && data.notifications.length > 0) {
        // Sort by creation time (oldest first) so they appear in order
        const sortedNotifications = [...data.notifications].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        for (const notification of sortedNotifications) {
          showNotification(notification);
        }
      }
    } catch (error) {
      // Ignore aborted requests
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      // On network error, increase backoff
      setBackoff(prev => Math.min(prev * BACKOFF_MULTIPLIER, MAX_BACKOFF));
    }
  }, [status, session?.user?.id, showNotification]);

  useEffect(() => {
    // Only start polling when authenticated
    if (status !== 'authenticated' || !session?.user?.id) {
      return;
    }

    // Skip if already initialized for this session
    if (isInitialized.current) {
      return;
    }
    isInitialized.current = true;

    // Initial poll after a short delay
    const initialDelay = setTimeout(() => {
      pollNotifications();
    }, 3000);

    // Set up polling with backoff
    const scheduleNext = () => {
      intervalRef.current = setTimeout(() => {
        pollNotifications().finally(() => {
          scheduleNext();
        });
      }, backoff);
    };
    scheduleNext();

    return () => {
      clearTimeout(initialDelay);
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
      isInitialized.current = false;
    };
  }, [status, session?.user?.id, pollNotifications, backoff]);

  // This component doesn't render anything
  return null;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'success':
      return <CheckCircle className="h-5 w-5 text-primary" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'error':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'info':
    default:
      return <Info className="h-5 w-5 text-blue-500" />;
  }
}
