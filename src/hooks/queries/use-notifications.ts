'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { apiFetcher, apiMutator } from './fetcher';
import type { Notification } from '@/types';

// ── Cache strategy ────────────────────────────────────────────
// Dynamic data: short stale time (30s)
const STALE_TIME = 30 * 1000;
const GC_TIME = 5 * 60 * 1000;

/**
 * Fetch notifications for the current user.
 */
export function useNotifications(userId?: string) {
  return useQuery({
    queryKey: queryKeys.notifications.list(userId),
    queryFn: ({ signal }) =>
      apiFetcher<Notification[]>('/api/notifications', userId ? { userId } : undefined, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
    enabled: !!userId,
  });
}

/**
 * Fetch unread notification count.
 */
export function useUnreadNotifications(userId?: string) {
  return useQuery({
    queryKey: queryKeys.notifications.unread(userId),
    queryFn: async ({ signal }) => {
      const data = await apiFetcher<{ count: number }>(
        '/api/notifications/unread',
        userId ? { userId } : undefined,
        signal
      );
      return data?.count ?? 0;
    },
    staleTime: 15 * 1000, // 15 seconds - check frequently
    gcTime: GC_TIME,
    enabled: !!userId,
  });
}

/**
 * Mark a notification as read.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiMutator(`/api/notifications/${id}/read`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/**
 * Mark all notifications as read.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiMutator('/api/notifications/read-all', { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
