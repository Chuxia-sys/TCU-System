// =============================================================
// Notification Client — Resilient Socket.IO Wrapper
// =============================================================
// Sends real-time notifications via the notification service.
// When the service is unavailable, operations silently fail
// without blocking the calling API route.
//
// IMPORTANT: This is a BEST-EFFORT service. Database
// notifications (via db.notification.create) are the primary
// delivery mechanism. Socket.IO is only for real-time push.
// =============================================================

import { io, Socket } from 'socket.io-client';

let notificationSocket: Socket | null = null;
let connectionAttempted = false;
let lastConnectAttempt = 0;
const RECONNECT_COOLDOWN = 30_000; // Don't retry connection more than once per 30s

/**
 * Try to get a connected socket. Returns null if unavailable.
 * Never blocks — if the socket isn't connected, returns null immediately.
 */
function getConnectedSocket(): Socket | null {
  const now = Date.now();

  // If we have a connected socket, use it
  if (notificationSocket?.connected) {
    return notificationSocket;
  }

  // Don't hammer the connection — respect cooldown
  if (now - lastConnectAttempt < RECONNECT_COOLDOWN) {
    return null;
  }

  lastConnectAttempt = now;

  try {
    // Clean up old socket if exists
    if (notificationSocket) {
      notificationSocket.disconnect();
      notificationSocket = null;
    }

    notificationSocket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: false, // We manage reconnection ourselves
      timeout: 3000,
    });

    notificationSocket.on('connect_error', () => {
      // Silently ignore — the service might not be running
    });

    notificationSocket.on('disconnect', () => {
      // Socket disconnected — will try again on next call
    });

    // Don't wait for connection — return null, the notification
    // will be delivered via the polling mechanism instead
    return null;
  } catch {
    return null;
  }
}

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

/**
 * Send a real-time notification to a specific user.
 * NON-BLOCKING: Returns immediately. If the socket service is
 * unavailable, the notification will still be delivered via
 * the database polling mechanism.
 */
export function sendNotificationToUser(payload: NotificationPayload): boolean {
  try {
    const socket = getConnectedSocket();

    if (socket?.connected) {
      socket.emit('notify-user', {
        userId: payload.userId,
        notification: {
          title: payload.title,
          message: payload.message,
          type: payload.type || 'info',
        },
      });
      return true;
    }

    // Socket not available — notification will be picked up by polling
    return false;
  } catch {
    return false;
  }
}

/**
 * Send a notification to multiple users.
 * Non-blocking per user.
 */
export function sendNotificationToUsers(
  userIds: string[],
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info'
): void {
  for (const userId of userIds) {
    sendNotificationToUser({ userId, title, message, type });
  }
}

/**
 * Broadcast a notification to all connected users.
 * Non-blocking.
 */
export function broadcastNotification(
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info'
): void {
  try {
    const socket = getConnectedSocket();
    if (socket?.connected) {
      socket.emit('notify-all', { title, message, type });
    }
  } catch {
    // Silently ignore
  }
}

/**
 * Notify a faculty member about schedule changes.
 * Non-blocking — database notification is the primary delivery.
 */
export function notifyScheduleChange(
  facultyId: string,
  action: 'created' | 'updated' | 'deleted',
  subjectName: string,
  day: string,
  time: string
): void {
  const actionText = {
    created: 'assigned to',
    updated: 'updated for',
    deleted: 'removed from',
  };

  sendNotificationToUser({
    userId: facultyId,
    title: `Schedule ${action === 'deleted' ? 'Removed' : action.charAt(0).toUpperCase() + action.slice(1)}`,
    message: `You have been ${actionText[action]} ${subjectName} on ${day} (${time})`,
    type: action === 'deleted' ? 'warning' : 'info',
  });
}
