'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateOnMutation } from './query-keys';
import { apiFetcher, apiMutator } from './fetcher';
import type { Subject } from '@/types';

// ── Cache strategy ────────────────────────────────────────────
// Static data: cache aggressively (30 min stale time)
const STALE_TIME = 30 * 60 * 1000; // 30 minutes
const GC_TIME = 60 * 60 * 1000; // 60 minutes

/**
 * Fetch subjects, optionally filtered by department.
 */
export function useSubjects(departmentId?: string | null) {
  const params = departmentId ? { departmentId } : undefined;

  return useQuery({
    queryKey: queryKeys.subjects.list(params),
    queryFn: ({ signal }) => apiFetcher<Subject[]>('/api/subjects', params, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single subject by ID.
 */
export function useSubject(id: string) {
  return useQuery({
    queryKey: queryKeys.subjects.detail(id),
    queryFn: ({ signal }) => apiFetcher<Subject>(`/api/subjects/${id}`, undefined, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!id,
  });
}

/**
 * Create a new subject.
 */
export function useCreateSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Subject>) =>
      apiMutator<Subject>('/api/subjects', { method: 'POST', body: data }),
    onSuccess: () => {
      invalidateOnMutation.subjects(queryClient);
    },
  });
}

/**
 * Update an existing subject.
 */
export function useUpdateSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Subject> & { id: string }) =>
      apiMutator<Subject>(`/api/subjects/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      invalidateOnMutation.subjects(queryClient);
    },
  });
}

/**
 * Delete a subject.
 */
export function useDeleteSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiMutator(`/api/subjects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateOnMutation.subjects(queryClient);
    },
  });
}
