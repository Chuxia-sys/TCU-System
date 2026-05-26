'use client';

import { queryClient } from './query-client';
import { queryKeys } from './query-keys';
import { apiFetcher } from './fetcher';
import type { Schedule, Room, Subject, Section, Department, User, Conflict } from '@/types';

/**
 * Route-based prefetching utilities.
 * Call these when hovering over navigation links or on route change.
 * Data will be ready in cache by the time the user lands on the page.
 */

export const prefetch = {
  /**
   * Prefetch schedules page data.
   */
  schedules: (departmentId?: string | null) => {
    const params = departmentId ? { departmentId } : undefined;
    queryClient.prefetchQuery({
      queryKey: queryKeys.schedules.list(params),
      queryFn: ({ signal }) => apiFetcher<Schedule[]>('/api/schedules', params, signal),
      staleTime: 60 * 1000,
    });
  },

  /**
   * Prefetch rooms page data.
   */
  rooms: () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rooms.list(),
      queryFn: ({ signal }) => apiFetcher<Room[]>('/api/rooms', undefined, signal),
      staleTime: 30 * 60 * 1000,
    });
  },

  /**
   * Prefetch subjects page data.
   */
  subjects: (departmentId?: string | null) => {
    const params = departmentId ? { departmentId } : undefined;
    queryClient.prefetchQuery({
      queryKey: queryKeys.subjects.list(params),
      queryFn: ({ signal }) => apiFetcher<Subject[]>('/api/subjects', params, signal),
      staleTime: 30 * 60 * 1000,
    });
  },

  /**
   * Prefetch faculty page data.
   */
  faculty: (departmentId?: string | null) => {
    const params: Record<string, string> = { role: 'faculty' };
    if (departmentId) params.departmentId = departmentId;
    queryClient.prefetchQuery({
      queryKey: queryKeys.faculty.list(params),
      queryFn: ({ signal }) => apiFetcher<User[]>('/api/users', params, signal),
      staleTime: 10 * 60 * 1000,
    });
  },

  /**
   * Prefetch departments page data.
   */
  departments: () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.departments.list(),
      queryFn: ({ signal }) => apiFetcher<Department[]>('/api/departments', undefined, signal),
      staleTime: 30 * 60 * 1000,
    });
  },

  /**
   * Prefetch sections page data.
   */
  sections: (departmentId?: string | null) => {
    const params = departmentId ? { departmentId } : undefined;
    queryClient.prefetchQuery({
      queryKey: queryKeys.sections.list(params),
      queryFn: ({ signal }) => apiFetcher<Section[]>('/api/sections', params, signal),
      staleTime: 30 * 60 * 1000,
    });
  },

  /**
   * Prefetch users page data.
   */
  users: () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.users.list(),
      queryFn: ({ signal }) => apiFetcher<User[]>('/api/users', undefined, signal),
      staleTime: 10 * 60 * 1000,
    });
  },

  /**
   * Prefetch conflicts page data.
   */
  conflicts: () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.conflicts.list(),
      queryFn: ({ signal }) =>
        apiFetcher<{ conflicts?: Conflict[] }>('/api/conflicts', undefined, signal),
      staleTime: 30 * 1000,
    });
  },

  /**
   * Prefetch dashboard data.
   */
  dashboard: (departmentId?: string | null) => {
    const deptParam = departmentId ? `?departmentId=${departmentId}` : '';
    queryClient.prefetchQuery({
      queryKey: queryKeys.dashboard.stats(deptParam || 'all'),
      queryFn: ({ signal }) =>
        apiFetcher(`/api/stats${deptParam}`, undefined, signal),
      staleTime: 30 * 1000,
    });
  },

  /**
   * Prefetch all static data at once (for initial app load).
   */
  allStatic: (departmentId?: string | null) => {
    prefetch.departments();
    prefetch.rooms();
    prefetch.subjects(departmentId);
    prefetch.sections(departmentId);
    prefetch.faculty(departmentId);
  },
};
