'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateOnMutation } from './query-keys';
import { apiFetcher, apiMutator } from './fetcher';
import type { Schedule } from '@/types';

// ── Cache strategy ────────────────────────────────────────────
// Semi-dynamic: stale after 30-120s, background revalidation
const STALE_TIME = 60 * 1000; // 60 seconds
const GC_TIME = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch schedules, optionally filtered by department.
 */
export function useSchedules(departmentId?: string | null) {
  const params = departmentId ? { departmentId } : undefined;

  return useQuery({
    queryKey: queryKeys.schedules.list(params),
    queryFn: ({ signal }) => apiFetcher<Schedule[]>('/api/schedules', params, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single schedule by ID.
 */
export function useSchedule(id: string) {
  return useQuery({
    queryKey: queryKeys.schedules.detail(id),
    queryFn: ({ signal }) => apiFetcher<Schedule>(`/api/schedules/${id}`, undefined, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!id,
  });
}

/**
 * Create a new schedule.
 */
export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Schedule>) =>
      apiMutator<Schedule>('/api/schedules', { method: 'POST', body: data }),
    onSuccess: () => {
      invalidateOnMutation.schedules(queryClient);
    },
  });
}

/**
 * Update an existing schedule.
 */
export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Schedule> & { id: string }) =>
      apiMutator<Schedule>(`/api/schedules/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      invalidateOnMutation.schedules(queryClient);
    },
  });
}

/**
 * Delete a schedule.
 */
export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiMutator(`/api/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateOnMutation.schedules(queryClient);
    },
  });
}
