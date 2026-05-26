'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateOnMutation } from './query-keys';
import { apiFetcher, apiMutator } from './fetcher';
import type { Room } from '@/types';

// ── Cache strategy ────────────────────────────────────────────
// Static data: cache aggressively (30 min stale time)
const STALE_TIME = 30 * 60 * 1000; // 30 minutes
const GC_TIME = 60 * 60 * 1000; // 60 minutes

/**
 * Fetch all rooms.
 */
export function useRooms(filters?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.rooms.list(filters),
    queryFn: ({ signal }) => apiFetcher<Room[]>('/api/rooms', filters, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single room by ID.
 */
export function useRoom(id: string) {
  return useQuery({
    queryKey: queryKeys.rooms.detail(id),
    queryFn: ({ signal }) => apiFetcher<Room>(`/api/rooms/${id}`, undefined, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!id,
  });
}

/**
 * Create a new room.
 */
export function useCreateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Room>) =>
      apiMutator<Room>('/api/rooms', { method: 'POST', body: data }),
    onSuccess: () => {
      invalidateOnMutation.rooms(queryClient);
    },
  });
}

/**
 * Update an existing room.
 */
export function useUpdateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Room> & { id: string }) =>
      apiMutator<Room>(`/api/rooms/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      invalidateOnMutation.rooms(queryClient);
    },
  });
}

/**
 * Delete a room.
 */
export function useDeleteRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiMutator(`/api/rooms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateOnMutation.rooms(queryClient);
    },
  });
}
