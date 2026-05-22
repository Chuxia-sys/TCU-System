'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { status } = useSession();
  const router = useRouter();

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-background dark:bg-[#0F172A]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500 dark:text-[#EF4444]" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/auth/login');
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
