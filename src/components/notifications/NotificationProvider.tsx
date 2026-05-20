'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { XCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { safeJson } from '@/lib/utils';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
}

const POLL_INTERVAL = 30_000; // 30 seconds

export function NotificationProvider() {
  const { data: session, status } = useSession();
  const lastPollTime = useRef<string>(new Date().toISOString());
  const processedIds = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(false);

  const showNotification = useCallback((notification: Notification) => {
    if (processedIds.current.has(notification.id)) return;
    processedIds.current.add(notification.id);

    const icon = getNotificationIcon(notification.type);

    toast.custom(
      (t) => (
        <div className="flex items-start gap-3 p-4 bg-card border rounded-lg shadow-lg max-w-sm w-full">
          <div className="flex-shrink-0 mt-0.5">{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{notification.title}</p>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{notification.message}</p>
          </div>
          <button onClick={() => toast.dismiss(t)} className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ),
      { position: 'bottom-right', duration: 8000, id: notification.id }
    );
  }, []);

  const pollNotifications = useCallback(async () => {
    if (status !== 'authenticated' || !session?.user?.id) return;

    try {
      const res = await fetch(`/api/notifications/poll?since=${encodeURIComponent(lastPollTime.current)}`);
      const data = await safeJson<{ notifications?: Notification[]; timestamp?: string }>(res);
      if (!data) return;

      if (data.timestamp) lastPollTime.current = data.timestamp;

      if (data.notifications && data.notifications.length > 0) {
        const sorted = [...data.notifications].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        for (const notification of sorted) showNotification(notification);
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [status, session?.user?.id, showNotification]);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) return;
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Initial poll after short delay
    const initialDelay = setTimeout(pollNotifications, 3000);

    // Set up simple interval polling (no recursive setTimeout, no backoff state)
    intervalRef.current = setInterval(pollNotifications, POLL_INTERVAL);

    return () => {
      clearTimeout(initialDelay);
      if (intervalRef.current) clearInterval(intervalRef.current);
      mountedRef.current = false;
    };
  }, [status, session?.user?.id, pollNotifications]);

  return null;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'success': return <CheckCircle className="h-5 w-5 text-primary" />;
    case 'warning': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
    case 'info':
    default: return <Info className="h-5 w-5 text-blue-500" />;
  }
}
