'use client';

import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { UnifiedHeader, HEADER_HEIGHT } from './UnifiedHeader';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import { Loader2 } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { status } = useSession();
  const { sidebarCollapsed } = useAppStore();

  if (status === 'loading') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background dark:bg-[#0F172A]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500 dark:text-[#EF4444]" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-background dark:bg-[#0F172A]">
      {/* Notification Provider for real-time toast notifications */}
      <NotificationProvider />

      {/* ===== TOP HEADER (shrink-0, never scrolls) ===== */}
      <div className="shrink-0">
        <UnifiedHeader />
      </div>

      {/* ===== MAIN LAYOUT: Sidebar + Content (flex-1, overflow-hidden) ===== */}
      <div className="flex-1 flex overflow-hidden">
        {/* ===== SIDEBAR: Fixed width, flex column, content scrolls ===== */}
        <Sidebar />

        {/* ===== MAIN CONTENT: Only this section scrolls ===== */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Content area — this is the ONLY scrollable container */}
          <div className="flex-1 overflow-y-auto pb-24 md:pb-8">
            {/* Actual page content */}
            <div className="p-4 sm:p-5 lg:p-8">
              {children}
              {/* Footer inside scrollable area */}
              <Footer />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
