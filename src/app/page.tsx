'use client';

import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { useAppStore, type ViewMode } from '@/store';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

// Lazy-load all views to reduce initial compilation memory footprint.
// Only the currently needed view is compiled, preventing OOM crashes.
const AppShell = dynamic(() => import('@/components/layout/AppShell').then(m => ({ default: m.AppShell })), { ssr: false });
const LoginPage = dynamic(() => import('@/components/auth/LoginPage').then(m => ({ default: m.LoginPage })), { ssr: false });
const DashboardView = dynamic(() => import('@/components/dashboard/DashboardView').then(m => ({ default: m.DashboardView })), { ssr: false });
const CalendarView = dynamic(() => import('@/components/calendar/CalendarView').then(m => ({ default: m.CalendarView })), { ssr: false });
const FacultyView = dynamic(() => import('@/components/tables/FacultyView').then(m => ({ default: m.FacultyView })), { ssr: false });
const SubjectsView = dynamic(() => import('@/components/tables/SubjectsView').then(m => ({ default: m.SubjectsView })), { ssr: false });
const RoomsView = dynamic(() => import('@/components/tables/RoomsView').then(m => ({ default: m.RoomsView })), { ssr: false });
const SectionsView = dynamic(() => import('@/components/tables/SectionsView').then(m => ({ default: m.SectionsView })), { ssr: false });
const DepartmentsView = dynamic(() => import('@/components/tables/DepartmentsView').then(m => ({ default: m.DepartmentsView })), { ssr: false });
const SchedulesView = dynamic(() => import('@/components/tables/SchedulesView').then(m => ({ default: m.SchedulesView })), { ssr: false });
const UsersView = dynamic(() => import('@/components/tables/UsersView').then(m => ({ default: m.UsersView })), { ssr: false });
const ConflictsView = dynamic(() => import('@/components/tables/ConflictView').then(m => ({ default: m.ConflictsView })), { ssr: false });
const NotificationsView = dynamic(() => import('@/components/tables/NotificationsView').then(m => ({ default: m.NotificationsView })), { ssr: false });
const ProfileView = dynamic(() => import('@/components/tables/ProfileView').then(m => ({ default: m.ProfileView })), { ssr: false });
const PreferencesView = dynamic(() => import('@/components/tables/PreferencesView').then(m => ({ default: m.PreferencesView })), { ssr: false });
const ReportsView = dynamic(() => import('@/components/tables/ReportsView').then(m => ({ default: m.ReportsView })), { ssr: false });
const SettingsView = dynamic(() => import('@/components/tables/SettingsView').then(m => ({ default: m.SettingsView })), { ssr: false });
const ScheduleResponsesView = dynamic(() => import('@/components/responses/ScheduleResponsesView').then(m => ({ default: m.ScheduleResponsesView })), { ssr: false });
const MyScheduleResponsesView = dynamic(() => import('@/components/responses/MyScheduleResponsesView').then(m => ({ default: m.MyScheduleResponsesView })), { ssr: false });

// Define which roles can access which views
const viewPermissions: Record<ViewMode, string[]> = {
  dashboard: ['admin', 'department_head', 'faculty'],
  calendar: ['admin', 'department_head', 'faculty'],
  schedules: ['admin', 'department_head'],
  faculty: ['admin', 'department_head'],
  subjects: ['admin', 'department_head'],
  rooms: ['admin', 'department_head'],
  sections: ['admin', 'department_head'],
  departments: ['admin'],
  users: ['admin'],
  conflicts: ['admin', 'department_head'],
  notifications: ['admin', 'department_head', 'faculty'],
  profile: ['admin', 'department_head', 'faculty'],
  preferences: ['faculty'],
  reports: ['admin', 'department_head'],
  settings: ['admin'],
  'schedule-responses': ['admin'],
  'my-responses': ['faculty'],
};

export default function Home() {
  const { status, data: session } = useSession();
  const { viewMode, setViewMode } = useAppStore();

  // Redirect unauthorized users to dashboard
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role) {
      const allowedRoles = viewPermissions[viewMode];
      if (allowedRoles && !allowedRoles.includes(session.user.role)) {
        setViewMode('dashboard');
      }
    }
  }, [status, session, viewMode, setViewMode]);

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show login page if not authenticated
  if (status === 'unauthenticated') {
    return <LoginPage />;
  }

  // Render the appropriate view based on viewMode
  const renderView = () => {
    switch (viewMode) {
      case 'dashboard':
        return <DashboardView />;
      case 'calendar':
        return <CalendarView />;
      case 'schedules':
        return <SchedulesView />;
      case 'faculty':
        return <FacultyView />;
      case 'subjects':
        return <SubjectsView />;
      case 'rooms':
        return <RoomsView />;
      case 'sections':
        return <SectionsView />;
      case 'departments':
        return <DepartmentsView />;
      case 'users':
        return <UsersView />;
      case 'conflicts':
        return <ConflictsView />;
      case 'notifications':
        return <NotificationsView />;
      case 'profile':
        return <ProfileView />;
      case 'preferences':
        return <PreferencesView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView />;
      case 'schedule-responses':
        return <ScheduleResponsesView />;
      case 'my-responses':
        return <MyScheduleResponsesView />;
      default:
        return <DashboardView />;
    }
  };

  return <AppShell>{renderView()}</AppShell>;
}
