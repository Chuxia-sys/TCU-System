'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateOnMutation } from './query-keys';
import { apiFetcher, apiMutator } from './fetcher';
import type { User } from '@/types';

// ── Cache strategy ────────────────────────────────────────────
// Semi-static: 10 min stale time
const STALE_TIME = 10 * 60 * 1000;
const GC_TIME = 30 * 60 * 1000;

/**
 * Fetch all users, optionally filtered by role/department.
 */
export function useUsers(filters?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.users.list(filters ?? {}),
    queryFn: ({ signal }) => apiFetcher<User[]>('/api/users', filters, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch a single user by ID.
 */
export function useUser(id: string) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: ({ signal }) => apiFetcher<User>(`/api/users/${id}`, undefined, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!id,
  });
}

/**
 * Create a new user.
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<User> & { password?: string }) =>
      apiMutator<User>('/api/users', { method: 'POST', body: data }),
    onSuccess: () => {
      invalidateOnMutation.users(queryClient);
    },
  });
}

/**
 * Update an existing user.
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: Partial<User> & { id: string }) =>
      apiMutator<User>(`/api/users/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      invalidateOnMutation.users(queryClient);
    },
  });
}

/**
 * Delete a user.
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiMutator(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateOnMutation.users(queryClient);
    },
  });
}
