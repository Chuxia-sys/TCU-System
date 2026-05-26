'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import { apiFetcher } from './fetcher';
import type { Schedule, Conflict } from '@/types';

// ── Cache strategy ────────────────────────────────────────────
// Dashboard data: 30s stale time (semi-dynamic)
const STALE_TIME = 30 * 1000; // 30 seconds
const GC_TIME = 5 * 60 * 1000; // 5 minutes

export interface DashboardStats {
  totalSchedules?: number;
  totalFaculty?: number;
  totalRooms?: number;
  totalSubjects?: number;
  totalSections?: number;
  totalDepartments?: number;
  conflictCount?: number;
  scheduledCount?: number;
  unscheduledCount?: number;
  generationVersion?: number;
  lastGeneratedAt?: string;
  [key: string]: unknown;
}

/**
 * Fetch dashboard statistics.
 */
export function useDashboardStats(departmentId?: string | null) {
  const deptParam = departmentId ? `?departmentId=${departmentId}` : '';

  return useQuery({
    queryKey: queryKeys.dashboard.stats(deptParam || 'all'),
    queryFn: ({ signal }) =>
      apiFetcher<DashboardStats>(
        `/api/stats${deptParam}`,
        undefined,
        signal
      ),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch recent schedules for dashboard.
 */
export function useRecentSchedules(departmentId?: string | null) {
  const params = departmentId ? { departmentId } : undefined;

  return useQuery({
    queryKey: [...queryKeys.schedules.list(params), 'recent'] as const,
    queryFn: async ({ signal }) => {
      const data = await apiFetcher<Schedule[]>('/api/schedules', params, signal);
      return Array.isArray(data) ? data.slice(0, 5) : [];
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch recent conflicts for dashboard.
 */
export function useRecentConflicts() {
  return useQuery({
    queryKey: [...queryKeys.conflicts.list(), 'recent'] as const,
    queryFn: async ({ signal }) => {
      const data = await apiFetcher<{ conflicts?: Conflict[] }>(
        '/api/conflicts',
        undefined,
        signal
      );
      return Array.isArray(data?.conflicts) ? data.conflicts.slice(0, 5) : [];
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    placeholderData: (previousData) => previousData,
  });
}
