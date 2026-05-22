'use client';

import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
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
      <div className="flex h-screen items-center justify-center bg-background dark:bg-[#0F172A]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500 dark:text-[#EF4444]" />
      </div>
    );
  }

  return (
    <div className="h-dvh w-screen bg-background dark:bg-[#0F172A] flex flex-col overflow-hidden">
      {/* Notification Provider for real-time toast notifications */}
      <NotificationProvider />
      
      {/* FIXED: Header (top-0, left-0, right-0, full width) */}
      <Header />
      
      {/* FIXED: Sidebar (positioned absolutely, top below header) */}
      <Sidebar />
      
      {/* Main Content Area - ONLY scrollable element */}
      <div
        className={cn(
          'flex-1 flex flex-col overflow-hidden',
          // Desktop: apply margin for sidebar
          'md:transition-all',
          sidebarCollapsed ? 'md:ml-[68px]' : 'md:ml-[260px]',
          // Mobile: no margin, full width
          'ml-0'
        )}
      >
        {/* Main Content with bottom padding for mobile nav — scrollable only content */}
        <main className="flex-1 flex flex-col overflow-y-auto premium-scrollbar">
          <div className="p-4 sm:p-5 lg:p-8 pb-24 md:pb-8">
            {children}
          </div>
          {/* Footer */}
          <Footer className="mt-auto" />
        </main>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
