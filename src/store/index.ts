import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DayOfWeek } from '@/types';

export type ViewMode = 
  | 'dashboard' 
  | 'schedules' 
  | 'calendar' 
  | 'faculty' 
  | 'rooms' 
  | 'subjects' 
  | 'sections' 
  | 'departments' 
  | 'users' 
  | 'preferences' 
  | 'conflicts' 
  | 'notifications' 
  | 'profile'
  | 'settings'
  | 'reports'
  | 'schedule-responses'
  | 'my-responses';

interface CalendarFilters {
  section: string;
  faculty: string;
  day: DayOfWeek | 'all';
  room: string;
}

interface AppState {
  // Navigation
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  
  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  
  // Department Filter
  selectedDepartment: string | null;
  setSelectedDepartment: (id: string | null) => void;
  initializeDepartmentFromSession: (role?: string | null, departmentId?: string | null) => void;
  
  // Calendar Filters
  calendarFilters: CalendarFilters;
  setCalendarFilters: (filters: Partial<CalendarFilters>) => void;
  resetCalendarFilters: () => void;
  
  // Data Refresh
  lastRefresh: number;
  triggerRefresh: () => void;
}

const defaultCalendarFilters: CalendarFilters = {
  section: 'all',
  faculty: 'all',
  day: 'all',
  room: 'all',
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Navigation
      viewMode: 'dashboard',
      setViewMode: (mode) => set({ viewMode: mode }),
      
      // Sidebar
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      
      // Department Filter
      selectedDepartment: null,
      setSelectedDepartment: (id) => set({ selectedDepartment: id }),
      initializeDepartmentFromSession: (role, departmentId) => {
        // If the user is a department_head and has a departmentId, auto-set the selected department
        if (role === 'department_head' && departmentId) {
          // Only set if not already set to this department (avoid unnecessary re-renders)
          if (get().selectedDepartment !== departmentId) {
            set({ selectedDepartment: departmentId });
          }
        }
        // For admin or other roles, leave selectedDepartment as-is (allow manual selection)
      },
      
      // Calendar Filters
      calendarFilters: defaultCalendarFilters,
      setCalendarFilters: (filters) => 
        set((state) => ({ 
          calendarFilters: { ...state.calendarFilters, ...filters } 
        })),
      resetCalendarFilters: () => set({ calendarFilters: defaultCalendarFilters }),
      
      // Data Refresh
      lastRefresh: Date.now(),
      triggerRefresh: () => set({ lastRefresh: Date.now() }),
    }),
    {
      name: 'tcu-scheduling-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        selectedDepartment: state.selectedDepartment,
        calendarFilters: state.calendarFilters,
      }),
    }
  )
);

// Selector hooks for better performance
export const useViewMode = () => useAppStore((state) => state.viewMode);
export const useSidebarState = () => useAppStore((state) => ({
  open: state.sidebarOpen,
  collapsed: state.sidebarCollapsed,
}));
export const useSelectedDepartment = () => useAppStore((state) => state.selectedDepartment);
export const useCalendarFilters = () => useAppStore((state) => state.calendarFilters);
