'use client';

// ── Query Key Factory ─────────────────────────────────────────
export { queryKeys, invalidateOnMutation } from './query-keys';

// ── Cache Storage ─────────────────────────────────────────────
export {
  persistQueryToLocal,
  getPersistedQuery,
  removePersistedQuery,
  clearPersistedCache,
} from './cache-storage';

// ── Fetcher Utilities ────────────────────────────────────────
export { apiFetcher, apiMutator } from './fetcher';

// ── Query Client ──────────────────────────────────────────────
export { setQueryClient, getQueryClient, queryClient } from './query-client';

// ── Prefetching ────────────────────────────────────────────────
export { prefetch } from './prefetch';

// ── Schedules ──────────────────────────────────────────────────
export {
  useSchedules,
  useSchedule,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
} from './use-schedules';

// ── Rooms ──────────────────────────────────────────────────────
export {
  useRooms,
  useRoom,
  useCreateRoom,
  useUpdateRoom,
  useDeleteRoom,
} from './use-rooms';

// ── Subjects ────────────────────────────────────────────────────
export {
  useSubjects,
  useSubject,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
} from './use-subjects';

// ── Faculty ─────────────────────────────────────────────────────
export {
  useFaculty,
  useFacultyMember,
} from './use-faculty';

// ── Departments ─────────────────────────────────────────────────
export {
  useDepartments,
  useDepartment,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from './use-departments';

// ── Sections ────────────────────────────────────────────────────
export {
  useSections,
  useSection,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
} from './use-sections';

// ── Users ───────────────────────────────────────────────────────
export {
  useUsers,
  useUser,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from './use-users';

// ── Conflicts ───────────────────────────────────────────────────
export {
  useConflicts,
  useDetectConflicts,
  useResolveConflict,
  useResolveAllConflicts,
} from './use-conflicts';

// ── Notifications ───────────────────────────────────────────────
export {
  useNotifications,
  useUnreadNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from './use-notifications';

// ── Dashboard ───────────────────────────────────────────────────
export {
  useDashboardStats,
  useRecentSchedules,
  useRecentConflicts,
} from './use-dashboard';
export type { DashboardStats } from './use-dashboard';

// ── Schedule Responses ──────────────────────────────────────────
export {
  useScheduleResponses,
  usePendingSchedules,
  useMyResponses,
  useSubmitScheduleResponse,
} from './use-schedule-responses';
export type {
  ScheduleResponse,
  PendingSchedule,
  MyResponse,
} from './use-schedule-responses';

// ── Generic API Hooks ──────────────────────────────────────────
export { useApiQuery, useApiMutation } from './fetcher';
