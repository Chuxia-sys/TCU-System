'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateOnMutation } from './query-keys';
import { apiFetcher, apiMutator } from './fetcher';
import type { Section } from '@/types';

// ── Cache strategy ────────────────────────────────────────────
// Static data: cache aggressively (30 min stale time)
const STALE_TIME = 30 * 60 * 1000; // 30 minutes
const GC_TIME = 60 * 60 * 1000; // 60 minutes

/**
 * Fetch sections, optionally filtered by department.
 */
export function useSections(departmentId?: string | null) {
  const params = departmentId ? { departmentId } : undefined;

  return useQuery({
    queryKey: queryKeys.sections.list(params),
    queryFn: ({ signal }) => apiFetcher<Section[]>('/api/sections', params, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single section by ID.
 */
export function useSection(id: string) {
  return useQuery({
    queryKey: queryKeys.sections.detail(id),
    queryFn: ({ signal }) => apiFetcher<Section>(`/api/sections/${id}`, undefined, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!id,
  });
}

/**
 * Create a new section.
 */
export function useCreateSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Section>) =>
      apiMutator<Section>('/api/sections', { method: 'POST', body: data }),
    onSuccess: () => {
      invalidateOnMutation.sections(queryClient);
    },
  });
}

/**
 * Update an existing section.
 */
export function useUpdateSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Section> & { id: string }) =>
      apiMutator<Section>(`/api/sections/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      invalidateOnMutation.sections(queryClient);
    },
  });
}

/**
 * Delete a section.
 */
export function useDeleteSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiMutator(`/api/sections/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateOnMutation.sections(queryClient);
    },
  });
}
