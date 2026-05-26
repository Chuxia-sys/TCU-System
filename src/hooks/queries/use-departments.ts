'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateOnMutation } from './query-keys';
import { apiFetcher, apiMutator } from './fetcher';
import type { Department } from '@/types';

// ── Cache strategy ────────────────────────────────────────────
// Static data: cache aggressively (30 min stale time)
const STALE_TIME = 30 * 60 * 1000; // 30 minutes
const GC_TIME = 60 * 60 * 1000; // 60 minutes

/**
 * Fetch all departments.
 */
export function useDepartments() {
  return useQuery({
    queryKey: queryKeys.departments.list(),
    queryFn: ({ signal }) => apiFetcher<Department[]>('/api/departments', undefined, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single department by ID.
 */
export function useDepartment(id: string) {
  return useQuery({
    queryKey: queryKeys.departments.detail(id),
    queryFn: ({ signal }) => apiFetcher<Department>(`/api/departments/${id}`, undefined, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!id,
  });
}

/**
 * Create a new department.
 */
export function useCreateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Department>) =>
      apiMutator<Department>('/api/departments', { method: 'POST', body: data }),
    onSuccess: () => {
      invalidateOnMutation.departments(queryClient);
    },
  });
}

/**
 * Update an existing department.
 */
export function useUpdateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Department> & { id: string }) =>
      apiMutator<Department>(`/api/departments/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      invalidateOnMutation.departments(queryClient);
    },
  });
}

/**
 * Delete a department.
 */
export function useDeleteDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiMutator(`/api/departments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateOnMutation.departments(queryClient);
    },
  });
}
