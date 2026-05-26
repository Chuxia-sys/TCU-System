'use client';

/**
 * Centralized query key factory for TanStack Query.
 *
 * Every query in the app uses these keys to ensure:
 * - Consistent cache keys across components
 * - Proper cache invalidation on mutations
 * - No duplicate or conflicting keys
 *
 * Structure: [domain, resource, ...filters]
 */

export const queryKeys = {
  // ── Dashboard ──────────────────────────────────────────────
  dashboard: {
    all: ['dashboard'] as const,
    stats: (deptParam?: string) => ['dashboard', 'stats', deptParam] as const,
  },

  // ── Schedules ──────────────────────────────────────────────
  schedules: {
    all: ['schedules'] as const,
    list: (filters?: Record<string, string>) =>
      ['schedules', 'list', filters ?? {}] as const,
    detail: (id: string) => ['schedules', 'detail', id] as const,
  },

  // ── Rooms ──────────────────────────────────────────────────
  rooms: {
    all: ['rooms'] as const,
    list: (filters?: Record<string, string>) =>
      ['rooms', 'list', filters ?? {}] as const,
    detail: (id: string) => ['rooms', 'detail', id] as const,
  },

  // ── Subjects ───────────────────────────────────────────────
  subjects: {
    all: ['subjects'] as const,
    list: (filters?: Record<string, string>) =>
      ['subjects', 'list', filters ?? {}] as const,
    detail: (id: string) => ['subjects', 'detail', id] as const,
  },

  // ── Faculty (Users with role=faculty) ──────────────────────
  faculty: {
    all: ['faculty'] as const,
    list: (filters?: Record<string, string>) =>
      ['faculty', 'list', filters ?? {}] as const,
    detail: (id: string) => ['faculty', 'detail', id] as const,
  },

  // ── Departments ────────────────────────────────────────────
  departments: {
    all: ['departments'] as const,
    list: (filters?: Record<string, string>) =>
      ['departments', 'list', filters ?? {}] as const,
    detail: (id: string) => ['departments', 'detail', id] as const,
  },

  // ── Sections ───────────────────────────────────────────────
  sections: {
    all: ['sections'] as const,
    list: (filters?: Record<string, string>) =>
      ['sections', 'list', filters ?? {}] as const,
    detail: (id: string) => ['sections', 'detail', id] as const,
  },

  // ── Users ──────────────────────────────────────────────────
  users: {
    all: ['users'] as const,
    list: (filters?: Record<string, string>) =>
      ['users', 'list', filters ?? {}] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },

  // ── Conflicts ──────────────────────────────────────────────
  conflicts: {
    all: ['conflicts'] as const,
    list: (filters?: Record<string, string>) =>
      ['conflicts', 'list', filters ?? {}] as const,
  },

  // ── Notifications ──────────────────────────────────────────
  notifications: {
    all: ['notifications'] as const,
    list: (userId?: string) => ['notifications', 'list', userId] as const,
    unread: (userId?: string) => ['notifications', 'unread', userId] as const,
  },

  // ── Preferences ────────────────────────────────────────────
  preferences: {
    all: ['preferences'] as const,
    detail: (facultyId: string) => ['preferences', 'detail', facultyId] as const,
  },

  // ── Auth Session ──────────────────────────────────────────
  session: {
    all: ['session'] as const,
  },

  // ── Reports ────────────────────────────────────────────────
  reports: {
    all: ['reports'] as const,
    detail: (type: string) => ['reports', 'detail', type] as const,
  },

  // ── Schedule Responses ──────────────────────────────────────
  scheduleResponses: {
    all: ['schedule-responses'] as const,
    pending: ['schedule-responses', 'pending'] as const,
    mine: ['schedule-responses', 'mine'] as const,
  },
};

/**
 * Helper to invalidate related queries after mutations.
 * Call this after creating/updating/deleting entities.
 *
 * Example:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all })
 */
export const invalidateOnMutation = {
  schedules: (queryClient: any) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  },
  rooms: (queryClient: any) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all });
  },
  subjects: (queryClient: any) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.subjects.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all });
  },
  faculty: (queryClient: any) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.faculty.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all });
  },
  departments: (queryClient: any) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.departments.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.subjects.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.sections.all });
  },
  sections: (queryClient: any) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sections.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all });
  },
  users: (queryClient: any) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.faculty.all });
  },
  conflicts: (queryClient: any) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.conflicts.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  },
  notifications: (queryClient: any) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  },
};
