'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetcher, apiMutator } from './fetcher';
import { queryKeys } from './query-keys';

// ─── Types ─────────────────────────────────────────────────────────────

export type ScheduleResponse = {
  id: string;
  scheduleId: string;
  facultyId: string;
  status: 'pending' | 'accepted' | 'rejected';
  reason: string | null;
  respondedAt: string | null;
  createdAt: string;
  schedule: {
    id: string;
    day: string;
    startTime: string;
    endTime: string;
    subject: {
      subjectCode: string;
      subjectName: string;
    } | null;
    section: {
      sectionName: string;
    } | null;
    room: {
      roomName: string;
    } | null;
  };
  faculty: {
    id: string;
    name: string;
    email: string;
    department: {
      name: string;
    } | null;
  };
};

export type PendingSchedule = {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  subject: {
    subjectCode: string;
    subjectName: string;
    units: number;
  } | null;
  section: {
    sectionName: string;
    yearLevel: number;
  } | null;
  room: {
    roomName: string;
    building: string;
  } | null;
};

export type MyResponse = {
  id: string;
  scheduleId: string;
  status: 'pending' | 'accepted' | 'rejected';
  reason: string | null;
  respondedAt: string | null;
  schedule: PendingSchedule;
};

// ─── Hooks ──────────────────────────────────────────────────────────────

/**
 * Fetch all schedule responses (admin view).
 */
export function useScheduleResponses() {
  return useQuery<ScheduleResponse[]>({
    queryKey: queryKeys.scheduleResponses.all,
    queryFn: ({ signal }) => apiFetcher<ScheduleResponse[]>('/api/schedule-responses', undefined, signal),
    staleTime: 30 * 1000, // 30s — dynamic data
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch pending schedules for the current faculty member.
 */
export function usePendingSchedules() {
  return useQuery<PendingSchedule[]>({
    queryKey: queryKeys.scheduleResponses.pending,
    queryFn: ({ signal }) => apiFetcher<PendingSchedule[]>('/api/schedule-responses/pending', undefined, signal),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch my (faculty) responses.
 */
export function useMyResponses() {
  return useQuery<MyResponse[]>({
    queryKey: queryKeys.scheduleResponses.mine,
    queryFn: ({ signal }) => apiFetcher<MyResponse[]>('/api/schedule-responses', undefined, signal),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Submit a response to a schedule (accept/reject).
 */
export function useSubmitScheduleResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { scheduleId: string; status: 'accepted' | 'rejected'; reason?: string }) =>
      apiMutator('/api/schedule-responses', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleResponses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleResponses.pending });
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleResponses.mine });
    },
  });
}
