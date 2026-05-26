'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateOnMutation } from './query-keys';
import { apiFetcher, apiMutator } from './fetcher';
import type { User } from '@/types';

// ── Cache strategy ────────────────────────────────────────────
// Semi-static: 10 min stale time (faculty data changes infrequently)
const STALE_TIME = 10 * 60 * 1000; // 10 minutes
const GC_TIME = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch faculty members (users with role=faculty),
 * optionally filtered by department.
 */
export function useFaculty(departmentId?: string | null) {
  const params: Record<string, string> = { role: 'faculty' };
  if (departmentId) {
    params.departmentId = departmentId;
  }

  return useQuery({
    queryKey: queryKeys.faculty.list(params),
    queryFn: ({ signal }) => apiFetcher<User[]>('/api/users', params, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single faculty member by ID.
 */
export function useFacultyMember(id: string) {
  return useQuery({
    queryKey: queryKeys.faculty.detail(id),
    queryFn: ({ signal }) => apiFetcher<User>(`/api/users/${id}`, undefined, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!id,
  });
}
