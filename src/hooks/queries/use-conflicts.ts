'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateOnMutation } from './query-keys';
import { apiFetcher, apiMutator } from './fetcher';
import type { Conflict, ConflictResolutionResult } from '@/types';

// ── Cache strategy ────────────────────────────────────────────
// Semi-dynamic: 30s stale time for conflict data
const STALE_TIME = 30 * 1000; // 30 seconds
const GC_TIME = 5 * 60 * 1000; // 5 minutes

interface ConflictsResponse {
  conflicts?: Conflict[];
  [key: string]: unknown;
}

/**
 * Fetch unresolved conflicts.
 * Handles background detection: when API returns loading=true,
 * automatically retries after a brief delay.
 */
export function useConflicts(filters?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.conflicts.list(filters),
    queryFn: async ({ signal }) => {
      const data = await apiFetcher<ConflictsResponse>('/api/conflicts', filters, signal);
      
      // If data is still loading in background, retry after delay
      if (data?.loading === true) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
        return apiFetcher<ConflictsResponse>('/api/conflicts', filters, signal).then(
          (retryData) => retryData?.conflicts ?? []
        );
      }
      
      return data?.conflicts ?? [];
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Manually detect conflicts.
 */
export function useDetectConflicts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiMutator<{ conflicts: Conflict[] }>('/api/conflicts/detect', { method: 'POST' }),
    onSuccess: () => {
      invalidateOnMutation.conflicts(queryClient);
    },
  });
}

/**
 * Resolve a specific conflict.
 */
export function useResolveConflict() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; strategy: string; [key: string]: unknown }) =>
      apiMutator<ConflictResolutionResult>(`/api/conflicts/${id}/resolve`, {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      invalidateOnMutation.conflicts(queryClient);
    },
  });
}

/**
 * Resolve all conflicts automatically.
 */
export function useResolveAllConflicts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiMutator<{ results: ConflictResolutionResult[] }>('/api/conflicts/resolve-all', {
        method: 'POST',
      }),
    onSuccess: () => {
      invalidateOnMutation.conflicts(queryClient);
    },
  });
}
