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
    <div className="min-h-screen flex flex-col bg-background dark:bg-[#0F172A]">
      {/* Notification Provider for real-time toast notifications */}
      <NotificationProvider />
      
      {/* Desktop Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <div
        className={cn(
          'flex-1 flex flex-col transition-all duration-300 ease-in-out',
          // Desktop: apply margin for sidebar
          'md:transition-all',
          sidebarCollapsed ? 'md:ml-[68px]' : 'md:ml-[260px]',
          // Mobile: no margin, full width
          'ml-0'
        )}
      >
        {/* Header */}
        <Header />
        
        {/* Main Content with bottom padding for mobile nav */}
        <main className="flex-1 p-4 sm:p-5 lg:p-8 pb-24 md:pb-8">
          {children}
        </main>

        {/* Footer */}
        <Footer />
      </div>
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
